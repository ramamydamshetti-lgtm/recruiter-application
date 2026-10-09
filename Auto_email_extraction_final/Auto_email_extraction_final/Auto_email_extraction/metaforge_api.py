"""
MetaForge integration: REST POST or local SQLite persistence.
Also owns daily sequence generation for job_id / client_jd_id.

IDENTITY RULES (enforced here, universal - not client-specific):
  Rule 1: Every requirement gets ONE unique ID, assigned once.
           Prefer the real client-provided req_id (client_jd_id) if present.
           Fall back to internal job_id (YYYY/MM/DD-NNN) only when no real ID exists.
  Rule 2: Same client_jd_id = same requirement, NEVER create a second row.
  Rule 3: On a repeat email for the same req_id, update ONLY the fields that
           actually changed; never overwrite existing data with blank/null.
           Record every field-level change with from/to/when.
  Rule 4: updated_at refreshed on every field change; default UI sort is
           most-recently-updated first.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import urljoin

import requests

if TYPE_CHECKING:
    from config import Settings

_LOG = logging.getLogger(__name__)

# Fields we track for field-level diff (Rule 3 / Rule 4)
_TRACKED_FIELDS = [
    "job_title", "location", "overall_experience", "notice_period",
    "number_of_positions", "yearly_budget", "monthly_budget",
    "mandatory_skills", "skills", "job_status", "priority",
    "experience_level", "employment_type", "client_poc",
    "requirement_from", "demand_received_date",
]


def _requirements_url(base: str) -> str:
    b = (base or "").strip().rstrip("/")
    if not b:
        return ""
    if b.lower().endswith("requirements") or b.lower().endswith("ingest-email"):
        return b
    return urljoin(b + "/", "api/internal/requirements/ingest-email")


class IdAllocator:
    """Thread-safe enough for single-process CLI: SQLite-backed daily sequences."""

    def __init__(self, db_path: str) -> None:
        self._path = db_path
        parent = Path(db_path).resolve().parent
        parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._path)
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS mf_sequences (
                name TEXT PRIMARY KEY,
                value INTEGER NOT NULL DEFAULT 0
            )"""
        )
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def _next(self, name: str) -> int:
        self._conn.execute(
            "INSERT INTO mf_sequences(name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING",
            (name,),
        )
        cur = self._conn.execute("SELECT value FROM mf_sequences WHERE name = ?", (name,))
        row = cur.fetchone()
        n = int(row[0]) + 1 if row else 1
        self._conn.execute("UPDATE mf_sequences SET value = ? WHERE name = ?", (n, name))
        self._conn.commit()
        return n

    def next_job_id(self, day: date | None = None) -> str:
        d_str = (day or date.today()).strftime("%Y/%m/%d")
        seq = self._next(f"job:{d_str}")
        return f"{d_str}-{seq:03d}"

    def next_client_jd_id(self, client_slug: str) -> str | None:
        """Returns None if no client-provided ID exists in source text (never fabricate placeholders)."""
        return None


def send_to_metaforge(payload: dict[str, Any], settings: Settings) -> None:
    """
    Dispatch payload according to METAFORGE_MODE (api | sqlite).
    Strips internal _provenance before external send if desired - API receives full JSON;
    adjust here if MetaForge rejects unknown keys.
    """
    mode = settings.metaforge_mode
    if mode == "sqlite":
        _sqlite_upsert(payload, settings.metaforge_sqlite_path)
        _LOG.info("Stored requirement %s in SQLite", payload.get("job_id"))
        return

    endpoint = getattr(settings, "metaforge_requirements_endpoint", "").strip().strip("/")
    if endpoint:
        url = urljoin(settings.metaforge_api_url.rstrip("/") + "/", endpoint)
    else:
        url = _requirements_url(settings.metaforge_api_url)
    if not url:
        # Fail-safe behavior: when API mode is configured but URL is missing,
        # keep pipeline productive by persisting to local SQLite.
        _sqlite_upsert(payload, settings.metaforge_sqlite_path)
        _LOG.warning(
            "METAFORGE_API_URL missing in api mode; stored requirement %s in SQLite fallback",
            payload.get("job_id"),
        )
        return

    headers = {"Content-Type": "application/json"}
    import os

    key = os.environ.get("METAFORGE_API_KEY", "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
        headers["x-internal-api-key"] = key

    body = {k: v for k, v in payload.items() if not str(k).startswith("_")}
    # Let the API assign REQ-YYYY-MM-DD-001, 002 on the live DB (ignore local allocator ids).
    body.pop("job_id", None)
    body.pop("client_jd_id", None)
    body["pipeline_extracted"] = True
    r = requests.post(url, json=body, headers=headers, timeout=120)
    if r.status_code >= 400:
        _LOG.error("MetaForge API error %s: %s", r.status_code, r.text[:500])
        r.raise_for_status()
    try:
        resp_json = r.json()
    except Exception:
        resp_json = {}
    data = resp_json.get("data") if isinstance(resp_json, dict) else {}
    if isinstance(data, dict) and data.get("ignored"):
        reason = str(data.get("reason") or "ignored by API")
        _LOG.error("MetaForge API ignored requirement %s: %s", payload.get("job_id"), reason)
        raise RuntimeError(f"MetaForge API ignored payload: {reason}")
    if isinstance(data, dict) and data.get("deduped") and not data.get("requirementId"):
        reason = str(data.get("reason") or "duplicate")
        _LOG.warning("MetaForge API deduped requirement %s: %s", payload.get("job_id"), reason)
    _LOG.info("Posted requirement %s to MetaForge API", payload.get("job_id"))


def post_recruitment_payload(
    payload: dict[str, Any],
    settings: Settings,
    *,
    endpoint_path: str = "requirements",
) -> None:
    """
    POST mapped payload to recruitment app endpoint.
    Uses METAFORGE_API_URL as base URL.
    """
    base = (settings.metaforge_api_url or "").rstrip("/")
    if not base:
        raise RuntimeError("METAFORGE_API_URL is required for recruitment API posting")
    endpoint = endpoint_path.strip().lstrip("/")
    url = f"{base}/{endpoint}"
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("METAFORGE_API_KEY", "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    body = {k: v for k, v in payload.items() if not str(k).startswith("_")}
    r = requests.post(url, json=body, headers=headers, timeout=120)
    if r.status_code >= 400:
        _LOG.error("Recruitment API error %s: %s", r.status_code, r.text[:500])
        r.raise_for_status()
    _LOG.info("Posted requirement %s to recruitment endpoint %s", payload.get("job_id"), endpoint)


# ---------------------------------------------------------------------------
# SQLite persistence - enforces Rules 1-4
# ---------------------------------------------------------------------------

def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Create/migrate metaforge_requirements table. ALTER TABLE ADD COLUMN preserves existing data."""
    conn.execute(
        """CREATE TABLE IF NOT EXISTS metaforge_requirements (
            job_id           TEXT PRIMARY KEY,
            payload_json     TEXT NOT NULL,
            created_at       TEXT NOT NULL,
            client_jd_id     TEXT,
            updated_at       TEXT,
            field_change_history TEXT
        )"""
    )
    # Migrate older tables that lack the new columns (safe - preserves all existing data)
    existing_cols = {r[1] for r in conn.execute("PRAGMA table_info(metaforge_requirements)").fetchall()}
    for col, ddl in [
        ("client_jd_id",         "TEXT"),
        ("updated_at",           "TEXT"),
        ("field_change_history", "TEXT"),
    ]:
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE metaforge_requirements ADD COLUMN {col} {ddl}")
    # Index for fast client_jd_id lookups (Rule 2)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_mf_req_client_jd_id ON metaforge_requirements(client_jd_id)"
    )
    conn.commit()


def _field_diff(old_payload: dict, new_payload: dict) -> dict:
    """
    Return a dict of field: {old_val, new_val} for every tracked field that genuinely changed.
    Fields where new_payload has None/blank are EXCLUDED - blank never counts as a change (Rule 3 para 4).
    """
    changes: dict = {}
    for field in _TRACKED_FIELDS:
        old_val = old_payload.get(field)
        new_val = new_payload.get(field)
        # Only update if new value is genuinely provided (not None/blank)
        if new_val is None or new_val == "" or new_val == []:
            continue
        old_norm = str(old_val).strip().lower() if old_val is not None else ""
        new_norm = str(new_val).strip().lower()
        if old_norm != new_norm:
            changes[field] = {"old": old_val, "new": new_val}
    return changes


def _merge_payload(existing: dict, new_payload: dict) -> dict:
    """
    Selective merge implementing Rule 3:
    - Non-blank new values overwrite stored values.
    - Blank/null new values leave stored values untouched.
    - _provenance dicts are deep-merged, not replaced entirely.
    """
    merged = dict(existing)
    for key, new_val in new_payload.items():
        if key.startswith("_"):
            # Always propagate provenance / internal metadata
            if key == "_provenance" and isinstance(new_val, dict) and isinstance(merged.get("_provenance"), dict):
                merged["_provenance"] = {**merged["_provenance"], **new_val}
            else:
                merged[key] = new_val
            continue
        if new_val is None or new_val == "" or new_val == []:
            # Rule 3 para 4: do NOT overwrite existing data with blank
            continue
        merged[key] = new_val
    return merged


def _sqlite_upsert(payload: dict[str, Any], db_path: str) -> None:
    """
    Identity-aware upsert into metaforge_requirements.

    Rule 1: client_jd_id is the stable identity key when present; job_id is the fallback.
    Rule 2: If a row with this client_jd_id already exists, route to update path - never duplicate.
    Rule 3: Field-level selective merge with change history recorded per event.
    Rule 4: updated_at refreshed on every real change.
    """
    parent = os.path.dirname(os.path.abspath(db_path))
    if parent:
        os.makedirs(parent, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn)

    now = datetime.now(timezone.utc).isoformat()
    cjd = str(payload.get("client_jd_id") or "").strip()
    job_id = str(payload.get("job_id") or "").strip()

    existing_row = None

    # Rule 2a: look up by client_jd_id first (preferred stable identity)
    if cjd and cjd.lower() not in ("none", "null", "not_found", ""):
        row = conn.execute(
            "SELECT job_id, payload_json, field_change_history "
            "FROM metaforge_requirements WHERE client_jd_id = ? LIMIT 1",
            (cjd,),
        ).fetchone()
        if row:
            existing_row = row

    # Rule 2b: fall back to job_id lookup for requirements without a real client ID
    if existing_row is None and job_id:
        row = conn.execute(
            "SELECT job_id, payload_json, field_change_history "
            "FROM metaforge_requirements WHERE job_id = ? LIMIT 1",
            (job_id,),
        ).fetchone()
        if row:
            existing_row = row

    if existing_row is not None:
        # --- UPDATE PATH (Rules 2-4) ---
        stored_job_id = existing_row["job_id"]
        try:
            old_payload = json.loads(existing_row["payload_json"])
        except Exception:
            old_payload = {}

        # Compute field-level diff BEFORE merging
        changes = _field_diff(old_payload, payload)
        if not changes:
            # Nothing actually changed - true duplicate, skip (Rule 2)
            _LOG.debug("DEDUP: client_jd_id=%s is unchanged - skipping", cjd or job_id)
            conn.close()
            return

        # Rule 3: merge - keep existing values for any field not mentioned in new email
        merged = _merge_payload(old_payload, payload)
        # Always keep the original job_id (Rule 1: ID never changes)
        merged["job_id"] = stored_job_id
        if cjd:
            merged["client_jd_id"] = cjd

        # Append to field change history (Rule 3 para 6)
        try:
            history = json.loads(existing_row["field_change_history"] or "[]")
        except Exception:
            history = []
        history.append({
            "changed_at": now,
            "source_email_id": str(payload.get("graphMessageId") or ""),
            "changes": changes,
        })

        conn.execute(
            """UPDATE metaforge_requirements
               SET payload_json = ?, updated_at = ?, field_change_history = ?, client_jd_id = ?
               WHERE job_id = ?""",
            (
                json.dumps(merged, ensure_ascii=False),
                now,
                json.dumps(history, ensure_ascii=False),
                cjd or stored_job_id,
                stored_job_id,
            ),
        )
        _LOG.info(
            "UPSERT-UPDATE job_id=%s client_jd_id=%s changed_fields=%s",
            stored_job_id, cjd, list(changes.keys()),
        )
    else:
        # --- CREATE PATH (Rule 1) ---
        conn.execute(
            """INSERT INTO metaforge_requirements
               (job_id, payload_json, created_at, client_jd_id, updated_at, field_change_history)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                job_id,
                json.dumps(payload, ensure_ascii=False),
                now,
                cjd if cjd else None,
                now,
                json.dumps([], ensure_ascii=False),
            ),
        )
        _LOG.info("UPSERT-CREATE job_id=%s client_jd_id=%s", job_id, cjd)

    conn.commit()
    conn.close()


# Backward compatibility alias for any code that imports _sqlite_insert directly
_sqlite_insert = _sqlite_upsert
