"""Read-only SQLite Database interface for Recruiter Application UI.

Rule 4: Default sort is updated_at DESC (most recently changed requirement first).
Rule 2: Deduplication by client_jd_id — one record per unique requirement.
Rule 3: Expose field_change_history from both client_requirements and metaforge_requirements.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
from typing import Any, Dict, List, Optional

_LOG = logging.getLogger(__name__)


def normalize_id(req_id: str, rule: dict) -> str:
    """Normalize a requirement ID according to configuration rules."""
    if not req_id:
        return ""
    val = req_id
    if rule.get("strip_whitespace", True):
        val = val.strip()
    if rule.get("uppercase", True):
        val = val.upper()
    return val


def _open_ro_connection(db_path: str) -> Optional[sqlite3.Connection]:
    """Open SQLite connection strictly in read-only mode."""
    if not os.path.exists(db_path):
        _LOG.warning("Database file not found: %s", db_path)
        return None
    try:
        uri = f"file:{os.path.abspath(db_path)}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as err:
        _LOG.error("Failed to open DB %s in read-only mode: %s", db_path, err)
        return None


def _format_internal_id(raw_id: str) -> str | None:
    """Format internal requirement ID as YYYY/MM/DD-NNN if matching date sequence."""
    if not raw_id:
        return None
    val = str(raw_id).strip()
    if val.startswith("REQ-"):
        val = val[4:]
    m = re.search(r"(\d{4})[\-\/](\d{2})[\-\/](\d{2})[\-\/]?(\d{3,})$", val)
    if m:
        return f"{m.group(1)}/{m.group(2)}/{m.group(3)}-{m.group(4)}"
    return None


def _extract_real_client_jd_id(payload: dict, raw_id: str) -> str | None:
    """Return genuine client-provided ID or None if not extracted from text (never fabricated)."""
    cjd = payload.get("client_jd_id") or payload.get("client_jd_id_override")
    if not cjd or str(cjd).lower() in ("none", "null", "not_found"):
        # Check if raw_id is a client ID (e.g., not YYYY-MM-DD-NNN)
        if raw_id and not _format_internal_id(raw_id):
            cjd = raw_id
        else:
            return None
    val = str(cjd).strip()
    # Ignore fabricated system placeholders (ACC-2026-SEP-001, LTTS-2026-09-001, etc.)
    if re.match(r"^(ACC|LTTS|REQ)\-\d{4}\-", val, re.IGNORECASE) or re.match(
        r"^(ACC|LTTS)\-\d{4}\-[A-Z]{3}\-", val, re.IGNORECASE
    ):
        return None
    return val


def _merge_field_change_history(hist_a: list, hist_b: list) -> list:
    """Merge two field_change_history lists, deduplicated by changed_at+source_email_id."""
    seen = set()
    merged = []
    for h in (hist_a + hist_b):
        key = (h.get("changed_at", ""), h.get("source_email_id", ""))
        if key not in seen:
            seen.add(key)
            merged.append(h)
    merged.sort(key=lambda x: x.get("changed_at", ""))
    return merged


def fetch_all_records(config: dict) -> List[Dict[str, Any]]:
    """
    Fetch requirements from all configured SQLite databases in read-only mode.

    Rule 2: Deduplicates by client_jd_id, keeping the most-recently-updated version.
    Rule 4: Default sort is by updated_at (or created_at) descending — most recently
            changed requirement at the top.
    Rule 3: Exposes field_change_history so the UI can show what changed.
    """
    db_paths = config.get("db_paths", [])

    from client_detector import detect_client

    # identity_map: client_jd_id -> best record seen so far
    # Rule 2: When the same client_jd_id appears in multiple tables/DBs,
    # we keep the record with the latest updated_at.
    identity_map: Dict[str, Dict[str, Any]] = {}
    internal_id_map: Dict[str, Dict[str, Any]] = {}  # job_id -> record (fallback)

    # Priority order: client_requirements > metaforge_requirements > pending_reviews > requirement_memory
    TABLE_PRIORITY = {
        "client_requirements": 10,
        "metaforge_requirements": 5,
        "pending_reviews": 3,
        "requirement_memory": 1,
    }

    for db_path in db_paths:
        conn = _open_ro_connection(db_path)
        if not conn:
            continue
        try:
            for tbl in ["client_requirements", "metaforge_requirements", "pending_reviews", "requirement_memory"]:
                try:
                    rows = conn.execute(f"SELECT * FROM {tbl} ORDER BY created_at ASC").fetchall()
                    tbl_priority = TABLE_PRIORITY.get(tbl, 1)
                    for row in rows:
                        try:
                            payload = json.loads(row["payload_json"])
                            row_keys = row.keys()

                            job_id_db = (
                                row["job_id"] if "job_id" in row_keys else
                                (row["client_jd_id"] if "client_jd_id" in row_keys else "")
                            )
                            job_id_raw = payload.get("job_id") or job_id_db or ""
                            created_at_db = row["created_at"] if "created_at" in row_keys else ""

                            # Rule 4: prefer updated_at if present (shows last meaningful change)
                            updated_at_db = ""
                            if "updated_at" in row_keys:
                                updated_at_db = str(row["updated_at"] or "")

                            # Field change history (Rule 3 para 6) — from both tables
                            field_change_history = []
                            if "field_change_history" in row_keys and row["field_change_history"]:
                                try:
                                    field_change_history = json.loads(row["field_change_history"]) or []
                                except Exception:
                                    pass

                            # Arrival timestamp from Outlook metadata
                            prov = payload.get("_provenance") if isinstance(payload.get("_provenance"), dict) else {}
                            arr_iso = (
                                prov.get("received_date_time") or
                                prov.get("receivedDateTime") or
                                payload.get("receivedDateTime") or
                                payload.get("received_date_time") or
                                payload.get("email_received_iso") or
                                payload.get("received_at") or
                                created_at_db or
                                payload.get("demand_received_date") or ""
                            )

                            # Rule 4: sort key is updated_at when present, else arrival time
                            sort_ts = updated_at_db or arr_iso or created_at_db or ""

                            # Determine the client_jd_id
                            client_jd = None
                            # 1. From the DB row directly (most reliable, set by identity engine)
                            if "client_jd_id" in row_keys and row["client_jd_id"]:
                                row_cjd = str(row["client_jd_id"]).strip()
                                if row_cjd and row_cjd.lower() not in ("none", "null", "not_found", ""):
                                    client_jd = row_cjd
                            # 2. Fall back to extracting from payload
                            if not client_jd:
                                client_jd = _extract_real_client_jd_id(payload, job_id_raw)

                            fmt_id = _format_internal_id(job_id_raw)

                            # Dynamic client resolution for idexcel.com emails
                            c_name = payload.get("requirement_from", "")
                            from_addr = (
                                payload.get("from") or
                                payload.get("client_poc") or
                                payload.get("client_lead_poc") or ""
                            )
                            if "idexcel" in str(c_name).lower() or "idexcel" in str(from_addr).lower():
                                subj = payload.get("subject") or payload.get("email_subject") or ""
                                body = payload.get("bodyText") or payload.get("body") or payload.get("email_body") or ""
                                cm = detect_client(subj, body, from_addr)
                                if cm:
                                    payload["requirement_from"] = cm.display_name
                                else:
                                    payload["requirement_from"] = "unresolved"

                            record = {
                                "raw_req_id": job_id_raw,
                                "fmt_id": fmt_id,
                                "client_jd_id": client_jd,
                                "arr_iso": arr_iso,
                                "updated_at": updated_at_db,
                                "sort_ts": sort_ts,
                                "source_db": os.path.basename(db_path),
                                "source_table": tbl,
                                "tbl_priority": tbl_priority,
                                "created_at": arr_iso or created_at_db,
                                "payload": payload,
                                "review_fields": row["review_fields"] if "review_fields" in row_keys else None,
                                "field_change_history": field_change_history,
                            }

                            # Rule 2 deduplication: group by client_jd_id, keep most recent
                            if client_jd:
                                existing = identity_map.get(client_jd)
                                if existing is None:
                                    identity_map[client_jd] = record
                                else:
                                    # Prefer higher-priority table, or later sort_ts
                                    if (tbl_priority > existing["tbl_priority"] or
                                            (tbl_priority == existing["tbl_priority"] and
                                             sort_ts > existing.get("sort_ts", ""))):
                                        # Merge field_change_history from both sources
                                        merged_hist = _merge_field_change_history(
                                            existing["field_change_history"],
                                            field_change_history,
                                        )
                                        record["field_change_history"] = merged_hist
                                        identity_map[client_jd] = record
                                    else:
                                        # Keep existing but merge field history
                                        merged_hist = _merge_field_change_history(
                                            existing["field_change_history"],
                                            field_change_history,
                                        )
                                        existing["field_change_history"] = merged_hist
                            else:
                                # No client_jd_id: fall back to internal job_id grouping
                                existing = internal_id_map.get(job_id_raw)
                                if existing is None or sort_ts > existing.get("sort_ts", ""):
                                    internal_id_map[job_id_raw] = record

                        except Exception:
                            continue
                except sqlite3.OperationalError:
                    pass
        finally:
            conn.close()

    # Merge both maps — client_jd_id grouped records take precedence
    merged_records: List[Dict[str, Any]] = list(identity_map.values())
    for job_id_raw, rec in internal_id_map.items():
        client_jd = rec.get("client_jd_id")
        if not client_jd or client_jd not in identity_map:
            merged_records.append(rec)

    # Sort chronologically to assign stable internal IDs
    merged_records.sort(key=lambda r: r.get("arr_iso") or r.get("created_at") or "")

    day_counters: Dict[str, int] = {}
    seen_ids: set = set()
    records: List[Dict[str, Any]] = []
    for r in merged_records:
        arr_str = r.get("arr_iso") or r.get("created_at") or ""
        date_part = arr_str[:10].replace("-", "/") if len(arr_str) >= 10 else "2026/09/30"

        if r["fmt_id"]:
            internal_id = r["fmt_id"]
            m = re.search(r"(\d{3,})$", internal_id)
            if m:
                day_counters[date_part] = max(day_counters.get(date_part, 0), int(m.group(1)))
        else:
            day_counters[date_part] = day_counters.get(date_part, 0) + 1
            internal_id = f"{date_part}-{day_counters[date_part]:03d}"

        r["req_id"] = internal_id

        if internal_id in seen_ids:
            continue
        seen_ids.add(internal_id)
        records.append(r)

    # Rule 4: Default sort is updated_at DESC (most recently changed at top).
    # Falls back to arr_iso if updated_at is missing (pre-migration records).
    def _sort_key(r: Dict[str, Any]) -> str:
        return r.get("sort_ts") or r.get("updated_at") or r.get("arr_iso") or r.get("created_at") or ""

    records.sort(key=_sort_key, reverse=True)
    return records


def fetch_status_history(config: dict, target_id: str) -> List[Dict[str, Any]]:
    rule = config.get("id_normalization_rule", {})
    target_norm = normalize_id(target_id, rule)
    if not target_norm:
        return []

    history = []
    db_paths = config.get("db_paths", [])
    for db_path in db_paths:
        if not os.path.exists(db_path):
            continue
        try:
            conn = sqlite3.connect(f"file:{os.path.abspath(db_path)}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT id, requirement_id, from_status, to_status, changed_at, source_email_id, changed_by "
                "FROM status_history WHERE requirement_id = ? ORDER BY id ASC",
                (target_norm,),
            ).fetchall()
            for r in rows:
                history.append(dict(r))
            conn.close()
            if history:
                break
        except Exception:
            continue
    return history


def fetch_field_change_history(config: dict, target_id: str) -> List[Dict[str, Any]]:
    """
    Fetch the field-level change history (Rule 3 para 6) for a requirement.
    Returns a list of {changed_at, source_email_id, changes: {field: {old, new}}} dicts.
    """
    rule = config.get("id_normalization_rule", {})
    target_norm = normalize_id(target_id, rule)
    if not target_norm:
        return []

    db_paths = config.get("db_paths", [])
    all_hist: List[Dict[str, Any]] = []

    for db_path in db_paths:
        if not os.path.exists(db_path):
            continue
        try:
            conn = sqlite3.connect(f"file:{os.path.abspath(db_path)}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row

            for tbl, id_col in [
                ("client_requirements", "client_jd_id"),
                ("metaforge_requirements", "client_jd_id"),
            ]:
                try:
                    row = conn.execute(
                        f"SELECT field_change_history FROM {tbl} WHERE {id_col} = ? LIMIT 1",
                        (target_norm,),
                    ).fetchone()
                    if row and row["field_change_history"]:
                        hist = json.loads(row["field_change_history"]) or []
                        all_hist = _merge_field_change_history(all_hist, hist)
                except sqlite3.OperationalError:
                    pass

            conn.close()
        except Exception as err:
            _LOG.error("Failed to fetch field change history from %s: %s", db_path, err)

    # Sort chronologically
    all_hist.sort(key=lambda x: x.get("changed_at", ""))
    return all_hist


def update_status_in_db(config: dict, target_id: str, new_status: str, changed_by: str = "USER") -> bool:
    """
    Update requirement status from the UI.

    Rule 3: Record the status change in field_change_history and append to status_history.
    Rule 4: Refresh updated_at so the record rises to the top of the list immediately.

    Updates BOTH databases:
      - client_requirements in processed_messages.db  (primary store)
      - metaforge_requirements in metaforge_requirements.db (secondary store)
    """
    rule = config.get("id_normalization_rule", {})
    target_norm = normalize_id(target_id, rule)
    if not target_norm:
        return False

    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).isoformat()
    new_st = new_status.strip().lower()

    db_paths = config.get("db_paths", [])
    updated = False

    for db_path in db_paths:
        if not os.path.exists(db_path):
            continue
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            # ── Ensure tables exist ──────────────────────────────────────────
            conn.execute(
                """CREATE TABLE IF NOT EXISTS status_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requirement_id TEXT NOT NULL,
                    from_status TEXT NOT NULL,
                    to_status TEXT NOT NULL,
                    changed_at TEXT NOT NULL,
                    source_email_id TEXT,
                    changed_by TEXT NOT NULL
                )"""
            )

            old_status = "open"
            did_update_any = False

            # ── 1. Update client_requirements (primary, Rule 3 + Rule 4) ────
            try:
                cr_row = conn.execute(
                    "SELECT client_jd_id, status, payload_json, field_change_history "
                    "FROM client_requirements WHERE client_jd_id = ? LIMIT 1",
                    (target_norm,),
                ).fetchone()
                if cr_row:
                    old_status = str(cr_row["status"] or "open").lower()
                    if old_status != new_st:
                        # Rule 3: Update payload json field
                        payload = json.loads(cr_row["payload_json"] or "{}")
                        payload["job_status"] = new_st

                        # Rule 3 para 6: Append to field_change_history
                        try:
                            fch = json.loads(cr_row["field_change_history"] or "[]") or []
                        except Exception:
                            fch = []
                        fch.append({
                            "changed_at": ts,
                            "source_email_id": "",
                            "changes": {
                                "job_status": {"old": old_status, "new": new_st}
                            },
                        })

                        # Rule 4: Refresh updated_at
                        conn.execute(
                            """UPDATE client_requirements
                               SET status = ?, payload_json = ?, updated_at = ?,
                                   field_change_history = ?
                               WHERE client_jd_id = ?""",
                            (
                                new_st,
                                json.dumps(payload, ensure_ascii=False),
                                ts,
                                json.dumps(fch, ensure_ascii=False),
                                target_norm,
                            ),
                        )
                        did_update_any = True
                        _LOG.info(
                            "UI status update: client_requirements client_jd_id=%s %s -> %s",
                            target_norm, old_status, new_st,
                        )
            except sqlite3.OperationalError:
                pass  # Table may not exist in this DB file

            # ── 2. Update metaforge_requirements (secondary) ─────────────────
            try:
                mf_row = conn.execute(
                    "SELECT job_id, payload_json FROM metaforge_requirements WHERE job_id = ? LIMIT 1",
                    (target_norm,),
                ).fetchone()
                if not mf_row:
                    # Scan by client_jd_id
                    rows = conn.execute(
                        "SELECT job_id, payload_json FROM metaforge_requirements"
                    ).fetchall()
                    for r in rows:
                        try:
                            p = json.loads(r["payload_json"])
                            if p.get("client_jd_id") == target_norm or p.get("job_id") == target_norm:
                                mf_row = r
                                break
                        except Exception:
                            continue

                if mf_row:
                    payload_mf = json.loads(mf_row["payload_json"] or "{}")
                    old_status_mf = str(payload_mf.get("job_status") or "open").lower()
                    if old_status_mf != new_st:
                        payload_mf["job_status"] = new_st
                        conn.execute(
                            "UPDATE metaforge_requirements SET payload_json = ?, updated_at = ? WHERE job_id = ?",
                            (json.dumps(payload_mf, ensure_ascii=False), ts, mf_row["job_id"]),
                        )
                        if not did_update_any:
                            old_status = old_status_mf
                        did_update_any = True
                        _LOG.info(
                            "UI status update: metaforge_requirements job_id=%s %s -> %s",
                            mf_row["job_id"], old_status_mf, new_st,
                        )
            except sqlite3.OperationalError:
                pass  # Table may not exist in this DB file

            # ── 3. Always write status_history entry (Rule 3 audit trail) ───
            if did_update_any or True:  # Always record the event
                try:
                    conn.execute(
                        "INSERT INTO status_history "
                        "(requirement_id, from_status, to_status, changed_at, source_email_id, changed_by) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (target_norm, old_status, new_st, ts, "", changed_by),
                    )
                except Exception:
                    pass

            conn.commit()
            conn.close()
            updated = updated or did_update_any

        except Exception as err:
            _LOG.error("Failed to update status in DB %s: %s", db_path, err)

    return updated


def get_requirement(config: dict, target_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve details for a specific requirement ID, including full history."""
    rule = config.get("id_normalization_rule", {})
    target_norm = normalize_id(target_id, rule)
    if not target_norm:
        return None

    records = fetch_all_records(config)
    for rec in records:
        req_id = rec.get("req_id") or ""
        raw_id = rec.get("raw_req_id") or ""
        client_jd = rec.get("client_jd_id") or ""

        if (target_norm in (req_id, raw_id, client_jd) or
                normalize_id(req_id, rule) == target_norm or
                normalize_id(raw_id, rule) == target_norm or
                normalize_id(client_jd, rule) == target_norm):
            # Enrich with full history for detail view
            rec["status_history"] = fetch_status_history(config, target_norm)
            # Also try to get field_change_history if not already populated
            if not rec.get("field_change_history"):
                rec["field_change_history"] = fetch_field_change_history(config, target_norm)
            return rec
    return None


def get_req_id_suggestions(config: dict, prefix: str, limit: int = 15) -> List[str]:
    """Retrieve autocomplete suggestion list for requirement IDs."""
    rule = config.get("id_normalization_rule", {})
    pfx_norm = normalize_id(prefix, rule)

    records = fetch_all_records(config)
    suggestions = []
    for rec in records:
        rid = rec["req_id"]
        if not pfx_norm or pfx_norm in rid:
            suggestions.append(rid)
            if len(suggestions) >= limit:
                break
    return suggestions
