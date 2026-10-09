"""
MetaForge recruitment pipeline: Graph inbox → filter → AI classify/extract → MetaForge.
Legacy ``dump`` subcommand keeps the original JSON/CSV/SQLite export behavior.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import logging
import os
import re
from pathlib import Path
import shutil
import sys
import time
from dataclasses import asdict
from datetime import date, datetime, timezone
from typing import Any

from dotenv import load_dotenv

from attachment_handler import extract_text_from_attachment
from body_normalizer import html_to_plain, normalize_body, scrub_pii
from client_detector import detect_client, resolve_idexcel_client_for_requirement
from config import Settings
from email_filter import (
    apply_email_filter,
    has_requirement_structure,
    is_sender_allowlisted,
)
from field_mapper import EmailContext, check_ui_readiness, map_to_metaforge
from historical_autofill import autofill_from_history
from metaforge_api import IdAllocator, send_to_metaforge
from outlook_graph import (
    OutlookMessage,
    acquire_token_from_env,
    fetch_attachment_detail,
    fetch_attachments,
    iter_inbox_messages,
    message_to_outlook,
)
from processed_store import ProcessedStore
from requirement_classifier import classify_email, heuristic_obvious_client_requirement
from requirement_parser import parse_requirements_from_email
from table_reconciler import run_client_table_reconciliation
from models import RequirementItem
from structured_requirement_extract import build_requirement_struct
from utils import (
    bind_log_context,
    clear_log_context,
    decode_graph_attachment_bytes,
    setup_logging,
)

_LOG = logging.getLogger(__name__)


# --- Legacy dump (original export) -------------------------------------------------


def _msg_dict(om: OutlookMessage) -> dict[str, object]:
    return asdict(om)


def _structured_email(row: dict[str, object], *, body_mode: str) -> dict[str, object]:
    attachments = row.get("attachments") or []
    extracted: dict[str, object] = {}
    requirement = build_requirement_struct(
        subject=str(row.get("subject") or ""),
        from_email=str(row.get("from_email") or ""),
        from_name=str(row.get("from_name") or ""),
        body_normalized=str(row.get("body_normalized") or ""),
        job_table=None,
    )

    content: dict[str, object] = {"normalized": row.get("body_normalized") or ""}
    if body_mode == "full":
        content["plain"] = row.get("body_plain") or ""
        content["html"] = row.get("body_html") or ""

    return {
        "id": {
            "graph_id": row.get("graph_id") or "",
            "internet_message_id": row.get("internet_message_id") or "",
        },
        "metadata": {
            "subject": row.get("subject") or "",
            "from": {
                "email": row.get("from_email") or "",
                "name": row.get("from_name") or "",
            },
            "to": row.get("to_recipients") or [],
            "cc": row.get("cc_recipients") or [],
            "received_date_time": row.get("received_date_time") or "",
            "is_read": bool(row.get("is_read")),
        },
        "content": content,
        "attachments": attachments,
        "extracted": extracted,
        "requirement": requirement,
    }


def _build_row(
    raw: dict[str, object], token: str, mailbox: str
) -> tuple[dict[str, object], OutlookMessage]:
    body_obj = raw.get("body") or {}
    ctype = (body_obj.get("contentType") or "").lower()
    content = body_obj.get("content") or ""
    plain, html = "", ""
    if "html" in ctype:
        html = content
        plain = html_to_plain(html)
    else:
        plain = content
    norm = normalize_body(plain, html)
    mid = raw.get("id") or ""
    atts: list = []
    if raw.get("hasAttachments") and mid:
        try:
            atts = fetch_attachments(token, mailbox, mid)
        except Exception:
            atts = []
    om = message_to_outlook(
        raw,
        body_plain=plain,
        body_html=html,
        body_normalized=norm,
        attachments=atts,
    )
    row = _msg_dict(om)
    return row, om


def run_legacy_dump(args: argparse.Namespace) -> int:
    import os
    import sqlite3
    from datetime import datetime, timezone

    default_mailbox = os.getenv(
        "MAILBOX_UPN",
        "recruitment.application@metaforgeit.com",
    ).strip()

    mailbox = args.mailbox or default_mailbox
    try:
        token = acquire_token_from_env()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    rows: list[dict[str, object]] = []
    with ProcessedStore(args.processed_db) as store:
        for raw in iter_inbox_messages(token, mailbox, limit=args.limit):
            gid = raw.get("id")
            if not gid:
                continue
            if not args.no_skip_processed and store.is_processed(gid):
                continue
            try:
                row, _ = _build_row(raw, token, mailbox)
            except Exception as ex:
                print(f"Skip message {gid}: {ex}", file=sys.stderr)
                continue
            rows.append(row)
            store.mark(gid)

    if args.format == "json":
        with open(args.output, "w", encoding="utf-8") as f:
            structured = [_structured_email(r, body_mode=args.body_mode) for r in rows]
            json.dump(structured, f, ensure_ascii=False, indent=2)
    elif args.format == "csv":
        base_fields = [
            "graph_id",
            "internet_message_id",
            "subject",
            "from_email",
            "from_name",
            "source_vendor_key",
            "source_vendor_display",
            "sender_domain",
            "to_recipients",
            "received_date_time",
            "is_read",
            "requirement_summary",
            "locations_joined",
            "key_points_count",
            "key_points_json",
            "experience_mentions_joined",
            "requirement_json",
            "body_char_count",
            "body_normalized",
            "attachment_count",
            "attachments_json",
            "job_locations",
            "job_roles_count",
            "job_roles_json",
            "candidate_submissions_count",
            "candidate_submissions_json",
        ]
        if args.body_mode == "full":
            base_fields.extend(["body_plain", "body_html"])

        with open(args.output, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=base_fields)
            w.writeheader()

            for r in rows:
                to_list = r.get("to_recipients")
                to_s = ";".join(to_list) if isinstance(to_list, list) else str(to_list or "")

                attachments = r.get("attachments") or []
                attachment_count = len(attachments) if isinstance(attachments, list) else 0

                jt: dict[str, Any] = {}
                locs = []
                roles = []
                csubs = []
                job_locations = ""
                job_roles_count = 0

                body_full = str(r.get("body_normalized") or "")
                body_char_count = len(body_full)
                if args.csv_body_full:
                    body_out = body_full
                else:
                    cap = 3000
                    body_out = (
                        body_full
                        if len(body_full) <= cap
                        else body_full[: cap - 1].rstrip() + "…"
                    )

                req = build_requirement_struct(
                    subject=str(r.get("subject") or ""),
                    from_email=str(r.get("from_email") or ""),
                    from_name=str(r.get("from_name") or ""),
                    body_normalized=body_full,
                    job_table=None,
                )
                src = req.get("source") or {}
                locs_all = req.get("locations") or []
                locs_joined = ";".join(locs_all) if isinstance(locs_all, list) else ""
                kpts = req.get("key_points") or []
                kpt_count = len(kpts) if isinstance(kpts, list) else 0
                exp = req.get("experience_mentions") or []
                exp_joined = ";".join(exp) if isinstance(exp, list) else ""

                row_out: dict[str, object] = {
                    "graph_id": r.get("graph_id") or "",
                    "internet_message_id": r.get("internet_message_id") or "",
                    "subject": r.get("subject") or "",
                    "from_email": r.get("from_email") or "",
                    "from_name": r.get("from_name") or "",
                    "source_vendor_key": src.get("vendor_key") or "",
                    "source_vendor_display": src.get("vendor_display") or "",
                    "sender_domain": src.get("sender_domain") or "",
                    "to_recipients": to_s,
                    "received_date_time": r.get("received_date_time") or "",
                    "is_read": bool(r.get("is_read")),
                    "requirement_summary": req.get("summary") or "",
                    "locations_joined": locs_joined,
                    "key_points_count": kpt_count,
                    "key_points_json": json.dumps(
                        kpts if isinstance(kpts, list) else [], ensure_ascii=False
                    ),
                    "experience_mentions_joined": exp_joined,
                    "requirement_json": json.dumps(req, ensure_ascii=False),
                    "body_char_count": body_char_count,
                    "body_normalized": body_out,
                    "attachment_count": attachment_count,
                    "attachments_json": json.dumps(attachments, ensure_ascii=False),
                    "job_locations": job_locations,
                    "job_roles_count": job_roles_count,
                    "job_roles_json": json.dumps(
                        roles if isinstance(roles, list) else [], ensure_ascii=False
                    ),
                    "candidate_submissions_count": len(csubs),
                    "candidate_submissions_json": json.dumps(csubs, ensure_ascii=False),
                }
                if args.body_mode == "full":
                    row_out["body_plain"] = r.get("body_plain") or ""
                    row_out["body_html"] = r.get("body_html") or ""

                w.writerow(row_out)
    else:
        db_path = args.output
        parent = os.path.dirname(os.path.abspath(db_path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        conn = sqlite3.connect(db_path)
        conn.execute(
            """CREATE TABLE IF NOT EXISTS extractions (
                graph_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                extracted_at TEXT NOT NULL
            )"""
        )
        now = datetime.now(timezone.utc).isoformat()
        for r in rows:
            payload = _structured_email(r, body_mode=args.body_mode)
            conn.execute(
                "INSERT OR REPLACE INTO extractions (graph_id, payload, extracted_at) VALUES (?,?,?)",
                (r["graph_id"], json.dumps(payload, ensure_ascii=False), now),
            )
        conn.commit()
        conn.close()

    print(f"Wrote {len(rows)} message(s) to {args.output}", file=sys.stderr)
    return 0


# --- MetaForge pipeline ------------------------------------------------------------


def _attachment_text_extras(
    token: str, mailbox: str, message_id: str, attachments: list[Any]
) -> str:
    """Download supported attachments and append extracted text for AI context."""
    chunks: list[str] = []
    for att in attachments:
        name = (getattr(att, "name", None) or "")
        lower_name = name.lower()
        ct = (getattr(att, "content_type", None) or "")
        # Ignore obvious non-JD binaries.
        if lower_name.endswith((".zip", ".rar", ".7z", ".mp4", ".avi", ".mp3")):
            continue
        aid = getattr(att, "id", None)
        if not aid:
            continue
        try:
            detail = fetch_attachment_detail(token, mailbox, message_id, aid)
        except Exception as exc:
            _LOG.warning("Attachment fetch failed %s: %s", name, exc)
            continue
        if detail.get("@odata.type") != "#microsoft.graph.fileAttachment":
            continue
        data = decode_graph_attachment_bytes(detail)
        if not data:
            continue
        text = extract_text_from_attachment(
            data,
            name=name,
            content_type=ct,
        )
        if text:
            chunks.append(f"\n--- Attachment: {name or 'file'} ---\n{text}")
    return "\n".join(chunks)


def _body_from_raw(raw: dict[str, Any]) -> tuple[str, str, str]:
    body_obj = raw.get("body") or {}
    ctype = (body_obj.get("contentType") or "").lower()
    content = body_obj.get("content") or ""
    plain, html = "", ""
    if "html" in ctype:
        html = content
        plain = html_to_plain(html)
    else:
        plain = content
    norm = normalize_body(plain, html)
    return plain, html, norm


def extract_and_map(
    raw: dict[str, Any],
    *,
    token: str,
    mailbox: str,
    settings: Settings,
    allocator: IdAllocator,
    skip_classifier: bool = False,
) -> tuple[str, list[dict[str, Any]], str]:
    """
    Single-pass extraction flow:
    read body + attachments -> classify/filter -> parse -> map to dashboard payload(s).
    Returns (status, payloads, body_for_ai).
    """
    subject = str(raw.get("subject") or "")
    plain, html_body, norm = _body_from_raw(raw)
    gid = str(raw.get("id") or "").strip()
    has_att = bool(raw.get("hasAttachments"))

    atts: list = []
    if has_att and gid:
        try:
            atts = fetch_attachments(token, mailbox, gid)
        except Exception as exc:
            _LOG.warning("List attachments failed: %s", exc)

    attachment_context = ""
    if atts and gid:
        attachment_context = _attachment_text_extras(token, mailbox, gid, atts)

    stitched_context = (
        f"ATTACHMENT_PRIMARY_CONTEXT:\n{attachment_context}\n\n"
        f"EMAIL_BODY_METADATA_CONTEXT:\n{norm or plain}"
        if attachment_context
        else (norm or plain)
    )
    body_for_ai = scrub_pii(stitched_context)

    from_obj = raw.get("from") or {}
    ea = (from_obj.get("emailAddress") or {}) if isinstance(from_obj, dict) else {}
    fe = (ea.get("address") or "").strip()
    fn = (ea.get("name") or "").strip()

    client = detect_client(subject, body_for_ai, fe)
    if client is None:
        return "unknown_client", [], body_for_ai

    if not is_sender_allowlisted(fe):
        return "sender_not_allowlisted", [], body_for_ai

    if not has_requirement_structure(body_for_ai):
        return "no_requirement_structure_in_body", [], body_for_ai

    filt = apply_email_filter(
        from_email=fe,
        body=body_for_ai,
    )
    if not filt.allowed:
        return f"filter:{filt.reason}", [], body_for_ai

    is_classifier_uncertain = False
    if not skip_classifier:
        if heuristic_obvious_client_requirement(subject, body_for_ai):
            _LOG.info(
                "Heuristic client-requirement gate passed (vendor JD pattern); skipping LLM classifier"
            )
        else:
            cls_res = classify_email(body_for_ai, subject=subject, settings=settings, from_email=fe)
            if cls_res.label == "NOT_A_REQUIREMENT":
                return "ai_classifier_no", [], body_for_ai

    parsed = parse_requirements_from_email(
        subject=subject, body=body_for_ai, settings=settings, message_id=gid or None, from_email=fe
    )

    client_name = client.display_name if client else None
    parsed, recon_meta = run_client_table_reconciliation(
        client_name=client_name,
        body_text=body_for_ai,
        parse_result=parsed,
        graph_id=gid,
    )

    kept: list[RequirementItem] = []
    for item in parsed.requirements:
        conf = float(item.confidence)
        if conf < settings.openai_min_confidence:
            _LOG.info(
                "Drop sub-requirement (confidence %.2f < %.2f)",
                conf,
                settings.openai_min_confidence,
            )
            continue
        kept.append(item)
    if not kept:
        return (parsed.processing_note or "no_requirements_after_parse"), [], body_for_ai

    om = message_to_outlook(
        raw,
        body_plain=plain,
        body_html=html_body,
        body_normalized=norm,
        attachments=atts,
    )
    ctx = EmailContext(
        graph_message_id=gid,
        internet_message_id=om.internet_message_id,
        to_emails=om.to_recipients,
        cc_emails=om.cc_recipients,
        from_email=fe,
        from_name=fn,
    )

    recv_raw = str(raw.get("receivedDateTime") or "").strip()
    recv_date = date.today()
    if recv_raw:
        try:
            recv_date = date.fromisoformat(recv_raw[:10])
        except ValueError:
            recv_date = date.today()

    payloads: list[dict[str, Any]] = []
    for idx, ext in enumerate(kept):
        ext_obj = ext.model_dump(mode="json", by_alias=True)

        req_client = client
        if fe and fe.lower().endswith("@idexcel.com"):
            req_text = (ext.job_title or "") + " " + " ".join(ext.mandatory_skills or [])
            req_client, idexcel_note = resolve_idexcel_client_for_requirement(
                subject=subject,
                body=body_for_ai,
                requirement_text=req_text,
                role_index=idx,
            )
            if idexcel_note:
                existing_note = ext_obj.get("processing_note")
                ext_obj["processing_note"] = (
                    f"{idexcel_note} | {existing_note}" if existing_note else idexcel_note
                )
                ext_obj["idexcel_unresolved"] = True

        if parsed.processing_note and not ext_obj.get("processing_note"):
            ext_obj["processing_note"] = parsed.processing_note

        if recon_meta.get("reconciliation_status"):
            ext_obj["reconciliation_status"] = recon_meta["reconciliation_status"]

        if is_classifier_uncertain or req_client.key == "idexcel_unresolved":
            ext_obj["is_classifier_uncertain"] = True

        job_id = allocator.next_job_id(recv_date)
        cjd = ext.req_id if ext.req_id else allocator.next_client_jd_id(req_client.key)
        payload = map_to_metaforge(
            ext_obj,
            ctx=ctx,
            client_display_name=req_client.display_name,
            job_id=job_id,
            client_jd_id=cjd,
            body_text=body_for_ai,
            internal_poc_default=settings.internal_poc_default,
            jd_count=len(kept),
            demand_received_date=recv_date,
            email_subject=subject,
            email_body_plain=plain,
            email_body_html=html_body,
            email_received_iso=recv_raw,
        )
        payload["client_key"] = req_client.key
        if req_client.key == "idexcel_unresolved":
            payload["idexcel_unresolved"] = True
        if ext.req_id:
            payload["_has_req_id"] = True
            payload["client_jd_id"] = ext.req_id
            if ext.raw_status:
                raw_st = ext.raw_status.lower()
                if "hold" in raw_st:
                    payload["job_status"] = "hold"
                    payload["priority"] = "Low"
                else:
                    payload["job_status"] = "open"
        conv_id = str(raw.get("conversationId") or "")
        payload.setdefault("_provenance", {})
        if isinstance(payload["_provenance"], dict):
            if conv_id:
                payload["_provenance"]["conversation_id"] = conv_id
            if is_classifier_uncertain:
                payload["_provenance"]["classifier_uncertain"] = True
        if is_classifier_uncertain:
            payload["is_classifier_uncertain"] = True
        payloads.append(payload)
    return "ok", payloads, body_for_ai


def process_single_message(
    raw: dict[str, Any],
    *,
    token: str,
    mailbox: str,
    settings: Settings,
    allocator: IdAllocator,
    store: ProcessedStore,
    skip_classifier: bool = False,
    sync_via_task: bool = False,
) -> int:
    """
    Process one raw Graph message through filter + AI + MetaForge sync.
    Returns number of synced requirement rows for this message.
    """
    gid = raw.get("id")
    if not gid:
        return 0
    bind_log_context(message_id=gid)
    if store.pipeline_should_skip(gid):
        _LOG.debug("Skip already finalized message %s", gid)
        clear_log_context()
        return 0

    store.pipeline_mark_processing(gid, "pipeline_processing")

    from_obj = raw.get("from") or {}
    ea = (from_obj.get("emailAddress") or {}) if isinstance(from_obj, dict) else {}
    fe = (ea.get("address") or "").strip()

    if not is_sender_allowlisted(fe):
        _LOG.info("SKIP %s: sender_not_allowlisted (%s)", gid, fe)
        store.pipeline_mark_skipped(gid, "sender_not_allowlisted")
        store.log_filtered(
            graph_id=gid,
            subject=str(raw.get("subject") or ""),
            from_email=fe,
            reason="sender_not_allowlisted",
            stage="allowlist",
        )
        clear_log_context()
        return 0


    status, payloads, _ = extract_and_map(
        raw,
        token=token,
        mailbox=mailbox,
        settings=settings,
        allocator=allocator,
        skip_classifier=skip_classifier,
    )
    if status != "ok":
        _LOG.info("SKIP %s: %s", gid, status)
        store.pipeline_mark_skipped(gid, status)

        subj = str(raw.get("subject") or "")
        fe = ""
        from_dict = raw.get("from")
        if isinstance(from_dict, dict) and "emailAddress" in from_dict:
            fe = str(from_dict["emailAddress"].get("address") or "")

        if status.startswith("filter:"):
            reason = status.split("filter:", 1)[1]
            stage = (
                "junk_detector"
                if reason in {"promotional_email", "job_seeker_self_application", "popup_notification"}
                else "email_filter"
            )
            store.log_filtered(graph_id=gid, subject=subj, from_email=fe, reason=reason, stage=stage)
        elif status == "ai_classifier_no":
            store.log_filtered(graph_id=gid, subject=subj, from_email=fe, reason="ai_classifier_no", stage="classifier")

        clear_log_context()
        return 0

    synced_for_message = 0
    pending_review_count = 0
    try:
        for payload in payloads:
            payload = autofill_from_history(payload, store)
            title = str(payload.get("job_title") or "").strip().lower()
            location = str(payload.get("location") or "").strip().lower()
            key_seed = f"{gid}|{title}|{location}"
            payload["idempotencyKey"] = hashlib.sha256(key_seed.encode("utf-8")).hexdigest()
            payload["graphMessageId"] = gid
            # Always persist RFC Message-ID for Outlook thread reply fallbacks
            inet_id = ""
            if payload.get("_provenance") and isinstance(payload.get("_provenance"), dict):
                inet_id = str(payload.get("_provenance", {}).get("internet_message_id") or "").strip()
            if not inet_id:
                inet_id = str(raw.get("internetMessageId") or "").strip()
            if inet_id:
                payload["internetMessageId"] = inet_id
                payload.setdefault("_provenance", {})
                if isinstance(payload["_provenance"], dict):
                    payload["_provenance"]["internet_message_id"] = inet_id
                    payload["_provenance"]["graph_message_id"] = gid

            readiness = check_ui_readiness(payload)
            is_ready = readiness.get("is_ready_for_auto_sync", False)
            is_uncertain = bool(payload.get("is_classifier_uncertain"))

            if not is_ready or is_uncertain:
                review_fields_str = ",".join(readiness.get("review_fields", []))
                store.add_pending_review(
                    graph_id=gid,
                    job_id=str(payload.get("job_id") or ""),
                    client_jd_id=str(payload.get("client_jd_id") or ""),
                    payload_json=json.dumps(payload, ensure_ascii=False),
                    review_fields=review_fields_str,
                )
                store.pipeline_mark_pending_review(gid, detail=review_fields_str)
                _LOG.info(
                    "Routed message %s (job_id=%s) to pending_review (review_fields=%r)",
                    gid,
                    payload.get("job_id"),
                    review_fields_str,
                )
                pending_review_count += 1
                continue

            cjd = str(payload.get("client_jd_id") or "")
            has_req_id = bool(payload.get("_has_req_id") or re.match(r"^\d{5,8}(-\d+)?$", cjd))

            if has_req_id:
                # Rule 7: Rows with a Req ID skip 24-hour fingerprint check
                req_from = str(payload.get("requirement_from") or "")
                req_action, _ = store.evaluate_client_requirement_action(
                    client_jd_id=cjd,
                    requirement_from=req_from,
                    payload=payload,
                )
                if req_action == "SKIP":
                    _LOG.info("SKIP %s: Req ID %s unchanged (Rule 3)", gid, cjd)
                    continue
                _LOG.info("Req ID lifecycle action %s for %s (%s)", req_action, cjd, gid)
            else:
                # Rows without a Req ID keep the 24-hour fingerprint check
                if store.requirement_fingerprint_exists(
                    requirement_from=str(payload.get("requirement_from") or ""),
                    job_title=str(payload.get("job_title") or ""),
                    location=str(payload.get("location") or ""),
                    budget_period=("monthly" if payload.get("monthly_budget") else "yearly"),
                    hours=24,
                ):
                    _LOG.info(
                        "SKIP %s: duplicate requirement fingerprint for title=%s",
                        gid,
                        str(payload.get("job_title") or ""),
                    )
                    continue
            if sync_via_task:
                payload.setdefault("_provenance", {})
                if isinstance(payload["_provenance"], dict):
                    payload["_provenance"]["queued_sync_total"] = len(payloads)
                from tasks import sync_metaforge_payload_task

                sync_metaforge_payload_task.delay(payload)
            else:
                send_to_metaforge(payload, settings)
            store.add_requirement_fingerprint(
                graph_id=gid,
                requirement_from=str(payload.get("requirement_from") or ""),
                job_title=str(payload.get("job_title") or ""),
                location=str(payload.get("location") or ""),
                budget_period=("monthly" if payload.get("monthly_budget") else "yearly"),
            )
            try:
                store.add_requirement_memory(
                    requirement_from=str(payload.get("requirement_from") or ""),
                    job_title=str(payload.get("job_title") or ""),
                    payload_json=json.dumps(payload, ensure_ascii=False),
                    source_graph_id=str(gid),
                )
            except Exception as mem_exc:
                _LOG.warning("Failed to persist requirement memory: %s", mem_exc)
            synced_for_message += 1
    except Exception as exc:
        _LOG.exception("MetaForge sync failed for message %s: %s", gid, exc)
        clear_log_context()
        return 0

    if pending_review_count > 0 and synced_for_message == 0:
        _LOG.info("OK %s: %s requirement row(s) routed to pending_review", gid, pending_review_count)
        clear_log_context()
        return 0

    if sync_via_task:
        store.pipeline_mark_pending_sync(gid, f"queued_sync_rows={synced_for_message}")
        _LOG.info("OK %s: queued %s requirement row(s) for sync", gid, synced_for_message)
    else:
        store.pipeline_mark_synced(gid, f"requirements={synced_for_message}")
        _LOG.info("OK %s: synced %s requirement row(s)", gid, synced_for_message)
    clear_log_context()
    return synced_for_message


def run_pipeline(args: argparse.Namespace, settings: Settings) -> int:
    try:
        token = acquire_token_from_env()
    except RuntimeError as e:
        _LOG.error("%s", e)
        return 1

    id_db = (
        settings.metaforge_sqlite_path
        if settings.metaforge_mode == "sqlite"
        else settings.metaforge_id_db
    )
    allocator = IdAllocator(id_db)

    mailbox = args.mailbox or settings.mailbox_upn
    processed = 0
    synced = 0

    try:
        with ProcessedStore(settings.processed_db) as store:
            for raw in iter_inbox_messages(token, mailbox, limit=args.limit):
                processed += 1
                synced += process_single_message(
                    raw,
                    token=token,
                    mailbox=mailbox,
                    settings=settings,
                    allocator=allocator,
                    store=store,
                )
    finally:
        allocator.close()

    _LOG.info("Pipeline finished: examined=%s total rows synced=%s", processed, synced)
    
    # SQLite to CSV/JSON Sync: Always generate final consolidated CSV
    try:
        import csv
        import json
        from datetime import date
        
        today = date.today().strftime('%Y-%m-%d')
        csv_filename = f"metaforge_consolidated_{today}.csv"
        json_filename = f"metaforge_consolidated_{today}.json"
        
        # Generate CSV from SQLite
        if settings.metaforge_mode == "sqlite":
            import sqlite3
            conn = sqlite3.connect(settings.metaforge_sqlite_path)
            
            # Get all data from SQLite
            cursor = conn.execute("SELECT * FROM metaforge_requirements ORDER BY created_at DESC")
            rows = cursor.fetchall()
            columns = [description[0] for description in cursor.description]
            
            # Write to CSV
            with open(csv_filename, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                writer.writerow(columns)
                writer.writerows(rows)
            
            # Write to JSON
            data = []
            for row in rows:
                data.append(dict(zip(columns, row)))
            
            with open(json_filename, 'w', encoding='utf-8') as jsonfile:
                json.dump(data, jsonfile, indent=2, ensure_ascii=False)
            
            conn.close()
            
            _LOG.info("Generated consolidated files: %s, %s with %d rows", csv_filename, json_filename, len(rows))
        else:
            _LOG.info("MetaForge API mode detected - skipping local CSV/JSON generation")
            
    except Exception as e:
        _LOG.error("Failed to generate consolidated CSV/JSON: %s", e)
    
    return 0


def retry_pending_sync_batch(settings: Settings, store: ProcessedStore, *, limit: int = 3) -> int:
    """Re-post stored payloads stuck in pending_sync. API dedupes; skips if already ingested."""
    import json

    from metaforge_api import send_to_metaforge

    synced = 0
    for graph_id, payload_json in store.pipeline_pending_sync_with_memory(limit=limit):
        try:
            payload = json.loads(payload_json)
        except json.JSONDecodeError:
            _LOG.warning("pending_sync retry skipped invalid JSON for %s", graph_id[:40])
            continue
        try:
            send_to_metaforge(payload, settings)
            store.pipeline_mark_synced(graph_id, "scheduler_retry_pending_sync")
            synced += 1
        except Exception as exc:
            _LOG.warning("pending_sync retry failed for %s: %s", graph_id[:40], exc)
    if synced:
        _LOG.info("Retried pending_sync payloads: synced=%s", synced)
    return synced


def enqueue_pipeline(args: argparse.Namespace, settings: Settings) -> int:
    """
    Producer mode: queue message IDs into Celery for asynchronous worker processing.
    """
    try:
        from tasks import classify_email_task
    except Exception as exc:
        _LOG.error("Celery tasks import failed: %s", exc)
        return 1

    try:
        token = acquire_token_from_env()
    except RuntimeError as e:
        _LOG.error("%s", e)
        return 1

    mailbox = args.mailbox or settings.mailbox_upn
    queued = 0
    examined = 0
    with ProcessedStore(settings.processed_db) as store:
        stale = store.pipeline_clear_stale_inflight(max_age_seconds=1800)
        if stale:
            _LOG.info("Cleared stale inflight pipeline rows: %s", stale)
        for raw in iter_inbox_messages(token, mailbox, limit=args.limit):
            examined += 1
            gid = str(raw.get("id") or "").strip()
            if not gid:
                continue
            if store.pipeline_should_skip(gid):
                continue
            state = store.pipeline_get_state(gid)
            if state in {"queued", "processing"}:
                continue
            classify_email_task.delay(gid, mailbox)
            store.pipeline_mark_queued(gid, "queued_by_producer")
            queued += 1

    _LOG.info("Enqueue finished: examined=%s queued=%s", examined, queued)
    return 0


def _build_raw_from_file(path: Path) -> tuple[str, dict[str, Any]]:
    payload: dict[str, Any]
    text = path.read_text(encoding="utf-8", errors="ignore")
    if path.suffix.lower() == ".json":
        try:
            obj = json.loads(text)
            if isinstance(obj, dict):
                payload = obj
            else:
                payload = {"body": text}
        except Exception:
            payload = {"body": text}
    else:
        payload = {"body": text}

    subject = str(payload.get("subject") or path.stem).strip() or "Requirement mail"
    from_email = str(payload.get("from_email") or payload.get("from") or "unknown@local").strip()
    from_name = str(payload.get("from_name") or "").strip()
    body_text = str(payload.get("body") or payload.get("content") or text)
    file_event_id = str(
        payload.get("message_id")
        or payload.get("graph_id")
        or f"file:{hashlib.sha256(text.encode('utf-8')).hexdigest()[:24]}"
    )

    raw = {
        "id": file_event_id,
        "subject": subject,
        "from": {
            "emailAddress": {
                "address": from_email,
                "name": from_name,
            }
        },
        "body": {"contentType": "text", "content": body_text},
        "hasAttachments": False,
        "receivedDateTime": payload.get("receivedDateTime") or datetime.now(timezone.utc).isoformat(),
    }
    return file_event_id, raw


def run_file_listener_cycle(settings: Settings) -> int:
    inbox = Path(settings.file_listener_inbox_dir)
    archive = Path(settings.file_listener_archive_dir)
    inbox.mkdir(parents=True, exist_ok=True)
    archive.mkdir(parents=True, exist_ok=True)

    files = sorted([p for p in inbox.glob("*") if p.is_file()])
    if not files:
        return 0

    id_db = settings.metaforge_sqlite_path if settings.metaforge_mode == "sqlite" else settings.metaforge_id_db
    allocator = IdAllocator(id_db)
    processed_count = 0
    try:
        with ProcessedStore(settings.processed_db) as store:
            for f in files:
                fp = hashlib.sha256(f"{f.resolve()}|{f.stat().st_size}|{f.stat().st_mtime}".encode("utf-8")).hexdigest()
                if store.is_file_event_processed(fp):
                    continue
                try:
                    gid, raw = _build_raw_from_file(f)
                    bind_log_context(message_id=gid, source="file_listener")
                    synced_rows = process_single_message(
                        raw,
                        token="",
                        mailbox=settings.mailbox_upn,
                        settings=settings,
                        allocator=allocator,
                        store=store,
                        skip_classifier=False,
                        sync_via_task=True,
                    )
                    store.mark_file_event_processed(fingerprint=fp, file_path=str(f))
                    processed_count += 1
                    archived_name = f"{f.stem}.{int(time.time())}{f.suffix}"
                    shutil.move(str(f), str(archive / archived_name))
                    _LOG.info("File listener processed=%s synced_rows=%s", f.name, synced_rows)
                except Exception as exc:
                    _LOG.exception("File listener failed for %s: %s", f, exc)
                finally:
                    clear_log_context()
    finally:
        allocator.close()

    return processed_count


def _write_scheduler_heartbeat(
    path: str,
    *,
    status: str,
    details: dict[str, Any] | None = None,
) -> None:
    try:
        parent = os.path.dirname(os.path.abspath(path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        payload: dict[str, Any] = {
            "status": status,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }
        if details:
            payload.update(details)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        _LOG.warning("Failed to write scheduler heartbeat file: %s", exc)


def run_scheduler(args: argparse.Namespace, settings: Settings) -> int:
    """
    Long-running scheduler loop:
    periodically enqueues new inbox messages for Celery workers.
    """
    max_cycles = args.max_cycles if args.max_cycles and args.max_cycles > 0 else None
    cycle = 0
    mailbox = args.mailbox or settings.mailbox_upn
    _LOG.info(
        "Scheduler started: poll=%ss mailbox=%s heartbeat=%s",
        settings.scheduler_poll_seconds,
        mailbox,
        settings.scheduler_heartbeat_path,
    )
    while True:
        cycle += 1
        _write_scheduler_heartbeat(
            settings.scheduler_heartbeat_path,
            status="running",
            details={"cycle": cycle, "mailbox": mailbox},
        )
        run_args = argparse.Namespace(limit=args.limit, mailbox=mailbox)
        try:
            rc = enqueue_pipeline(run_args, settings)
            if cycle % 5 == 0:
                with ProcessedStore(settings.processed_db) as store:
                    retry_pending_sync_batch(settings, store, limit=3)
            file_processed = 0
            if settings.file_listener_enabled:
                file_processed = run_file_listener_cycle(settings)
            _write_scheduler_heartbeat(
                settings.scheduler_heartbeat_path,
                status="running",
                details={
                    "cycle": cycle,
                    "mailbox": mailbox,
                    "last_cycle_rc": rc,
                    "file_events_processed": file_processed,
                },
            )
        except Exception as exc:
            _LOG.exception("Scheduler cycle failed: %s", exc)
            _write_scheduler_heartbeat(
                settings.scheduler_heartbeat_path,
                status="degraded",
                details={
                    "cycle": cycle,
                    "mailbox": mailbox,
                    "last_error": str(exc),
                },
            )
            time.sleep(settings.scheduler_error_backoff_seconds)
            if max_cycles is not None and cycle >= max_cycles:
                break
            continue

        if max_cycles is not None and cycle >= max_cycles:
            break
        time.sleep(settings.scheduler_poll_seconds)

    _write_scheduler_heartbeat(
        settings.scheduler_heartbeat_path,
        status="stopped",
        details={"cycle": cycle, "mailbox": mailbox},
    )
    _LOG.info("Scheduler stopped after %s cycle(s)", cycle)
    return 0


def _add_dump_args(p: argparse.ArgumentParser) -> None:
    import os

    p.add_argument("--format", choices=("json", "csv", "sqlite"), default="json")
    p.add_argument("--body-mode", choices=("normalized", "full"), default="normalized")
    p.add_argument("-o", "--output", default="extractions.json")
    p.add_argument(
        "--processed-db",
        default=os.getenv("PROCESSED_DB", "data/processed_messages.db"),
    )
    p.add_argument("--no-skip-processed", action="store_true")
    p.add_argument("--csv-body-full", action="store_true")


def main() -> int:
    load_dotenv()
    settings = Settings.from_env()
    setup_logging(settings.log_level)

    root = argparse.ArgumentParser(
        description="MetaForge email requirement pipeline (default) or legacy mailbox dump",
    )
    root.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Pipeline/dump: max inbox messages (newest first)",
    )
    root.add_argument(
        "--mailbox",
        default=None,
        help="Pipeline/dump: mailbox UPN (default MAILBOX_UPN)",
    )
    sub = root.add_subparsers(dest="cmd", required=False)

    sub.add_parser("pipeline", help="Run filter + AI + MetaForge (same as default)")
    sub.add_parser("enqueue", help="Queue inbox messages for async Celery workers")
    p_scheduler = sub.add_parser(
        "scheduler",
        help="Always-on scheduler: periodically enqueue inbox messages for workers",
    )
    p_scheduler.add_argument(
        "--max-cycles",
        type=int,
        default=None,
        help="Run only N cycles (default: infinite loop)",
    )

    p_dump = sub.add_parser("dump", help="Legacy: export mailbox to JSON/CSV/SQLite")
    _add_dump_args(p_dump)

    args = root.parse_args()

    if args.cmd == "dump":
        return run_legacy_dump(args)
    if args.cmd == "enqueue":
        return enqueue_pipeline(args, settings)
    if args.cmd == "scheduler":
        return run_scheduler(args, settings)

    if not settings.openai_api_key:
        _LOG.warning("OPENAI_API_KEY is empty — classifier/parser will reject all")
    return run_pipeline(args, settings)


if __name__ == "__main__":
    raise SystemExit(main())
