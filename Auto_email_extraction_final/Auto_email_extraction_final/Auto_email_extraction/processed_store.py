"""
Track processed Graph message IDs to avoid duplicate extraction and pipeline re-runs.
Uses the original ``processed`` table for legacy dump mode, and ``pipeline_state`` for
the MetaForge pipeline (skip on successful sync or explicit skip).

Rules 1-4 identity engine:
  Rule 1: Every requirement gets ONE stable ID (client_jd_id when available).
  Rule 2: Same ID = same requirement, never a second record.
  Rule 3: Only fields with a new non-blank value are updated; blank does NOT overwrite.
           Every field change is recorded in field_change_history.
  Rule 4: updated_at refreshed on every real change; default UI sort is newest first.
"""

from __future__ import annotations

import hashlib
import json as _json
import sqlite3
from pathlib import Path
from typing import Iterable

# Fields tracked for per-field change history (Rule 3 para 6)
_TRACKED_FIELDS: list[str] = [
    "job_title", "location", "overall_experience", "notice_period",
    "number_of_positions", "yearly_budget", "monthly_budget",
    "mandatory_skills", "skills", "job_status", "priority",
    "experience_level", "employment_type", "requirement_from",
    "demand_received_date", "work_mode", "budget_currency",
]


class ProcessedStore:
    """SQLite-backed store for Graph message IDs."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS processed (graph_id TEXT PRIMARY KEY, processed_at TEXT)"
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS pipeline_state (
                graph_id TEXT PRIMARY KEY,
                updated_at TEXT NOT NULL,
                state TEXT NOT NULL,
                detail TEXT
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS pending_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                graph_id TEXT NOT NULL,
                job_id TEXT NOT NULL,
                client_jd_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                review_fields TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
                created_at TEXT NOT NULL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS requirement_fingerprints (
                fingerprint TEXT PRIMARY KEY,
                graph_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS file_listener_state (
                fingerprint TEXT PRIMARY KEY,
                file_path TEXT NOT NULL,
                processed_at TEXT NOT NULL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS requirement_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requirement_from TEXT NOT NULL,
                job_title_norm TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                source_graph_id TEXT,
                created_at TEXT NOT NULL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS filtered_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                graph_id TEXT NOT NULL,
                subject TEXT,
                from_email TEXT,
                reason TEXT NOT NULL,
                stage TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS client_requirements (
                client_jd_id TEXT PRIMARY KEY,
                requirement_from TEXT NOT NULL,
                status TEXT NOT NULL,
                details_hash TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                field_change_history TEXT
            )"""
        )
        # Migration: add field_change_history column if missing (preserves all data)
        try:
            existing_cols = {
                r[1] for r in self._conn.execute(
                    "PRAGMA table_info(client_requirements)"
                ).fetchall()
            }
            if "field_change_history" not in existing_cols:
                self._conn.execute(
                    "ALTER TABLE client_requirements ADD COLUMN field_change_history TEXT"
                )
        except Exception:
            pass
        self._conn.execute(
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
        self._conn.commit()

    def record_status_change(
        self,
        *,
        requirement_id: str,
        from_status: str,
        to_status: str,
        source_email_id: str | None = None,
        changed_by: str = "RULE_ENGINE",
    ) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT INTO status_history
               (requirement_id, from_status, to_status, changed_at, source_email_id, changed_by)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (requirement_id, from_status, to_status, ts, source_email_id or "", changed_by),
        )
        self._conn.commit()

    def get_status_history(self, requirement_id: str) -> list[dict]:
        cur = self._conn.execute(
            """SELECT id, requirement_id, from_status, to_status, changed_at, source_email_id, changed_by
               FROM status_history
               WHERE requirement_id = ?
               ORDER BY id ASC""",
            (requirement_id,),
        )
        rows = cur.fetchall()
        return [
            {
                "id": r[0],
                "requirement_id": r[1],
                "from_status": r[2],
                "to_status": r[3],
                "changed_at": r[4],
                "source_email_id": r[5],
                "changed_by": r[6],
            }
            for r in rows
        ]

    def find_requirement_by_conversation_id(self, conversation_id: str) -> tuple[str, dict] | None:
        import json

        cid = str(conversation_id or "").strip()
        if not cid:
            return None
        # Search in requirement_memory first or client_requirements
        cur = self._conn.execute(
            """SELECT payload_json FROM requirement_memory ORDER BY created_at DESC"""
        )
        for (payload_str,) in cur.fetchall():
            try:
                p = json.loads(payload_str)
                prov = p.get("_provenance", {})
                if (
                    prov.get("conversation_id") == cid
                    or prov.get("graph_message_id") == cid
                    or p.get("graphMessageId") == cid
                ):
                    req_id = p.get("client_jd_id") or p.get("job_id") or ""
                    return req_id, p
            except Exception:
                continue

        cur = self._conn.execute(
            """SELECT client_jd_id, payload_json FROM client_requirements"""
        )
        for cjd, payload_str in cur.fetchall():
            try:
                p = json.loads(payload_str)
                prov = p.get("_provenance", {})
                if (
                    prov.get("conversation_id") == cid
                    or prov.get("graph_message_id") == cid
                    or p.get("graphMessageId") == cid
                ):
                    return cjd, p
            except Exception:
                continue
        return None

    def find_requirement_by_req_id(self, req_id: str) -> tuple[str, dict] | None:
        import json

        rid = str(req_id or "").strip()
        if not rid:
            return None
        cur = self._conn.execute(
            """SELECT payload_json FROM client_requirements WHERE client_jd_id = ? LIMIT 1""",
            (rid,),
        )
        row = cur.fetchone()
        if row:
            try:
                p = json.loads(row[0])
                return rid, p
            except Exception:
                pass
        cur = self._conn.execute(
            """SELECT payload_json FROM requirement_memory ORDER BY created_at DESC"""
        )
        for (payload_str,) in cur.fetchall():
            try:
                p = json.loads(payload_str)
                if p.get("client_jd_id") == rid or p.get("job_id") == rid:
                    return rid, p
            except Exception:
                continue
        return None

    def update_requirement_status(
        self,
        *,
        requirement_id: str,
        new_status: str,
        source_email_id: str | None = None,
        changed_by: str = "RULE_ENGINE",
    ) -> bool:
        import json
        from datetime import datetime, timezone

        req_info = self.find_requirement_by_req_id(requirement_id)
        if not req_info:
            return False

        cjd, payload = req_info
        old_status = payload.get("job_status", "open")
        norm_new_status = "open" if new_status.lower() in ("reopen", "re-open", "resume", "reactivate") else new_status.lower()
        if old_status.lower() == norm_new_status.lower():
            return True

        payload["job_status"] = norm_new_status
        payload_str = json.dumps(payload, ensure_ascii=False)
        new_hash = self._compute_requirement_details_hash(payload)
        now = datetime.now(timezone.utc).isoformat()

        self._conn.execute(
            """UPDATE client_requirements
               SET status = ?, details_hash = ?, payload_json = ?, updated_at = ?
               WHERE client_jd_id = ?""",
            (norm_new_status, new_hash, payload_str, now, cjd),
        )

        mf_db = Path(__file__).resolve().parent / "data" / "metaforge_requirements.db"
        if mf_db.exists():
            try:
                conn_mf = sqlite3.connect(mf_db)
                job_id = payload.get("job_id")
                cur_mf = conn_mf.execute("SELECT job_id, payload_json FROM metaforge_requirements")
                for r_jid, r_pstr in cur_mf.fetchall():
                    try:
                        p_obj = json.loads(r_pstr)
                        if p_obj.get("client_jd_id") == cjd or p_obj.get("job_id") == job_id or r_jid == job_id:
                            p_obj["job_status"] = norm_new_status
                            conn_mf.execute("UPDATE metaforge_requirements SET payload_json = ? WHERE job_id = ?", (json.dumps(p_obj, ensure_ascii=False), r_jid))
                    except Exception:
                        pass
                conn_mf.commit()
                conn_mf.close()
            except Exception as ex:
                _LOG.warning("Failed to update metaforge_requirements.db status: %s", ex)

        self.record_status_change(
            requirement_id=cjd,
            from_status=old_status,
            to_status=norm_new_status,
            source_email_id=source_email_id,
            changed_by=changed_by,
        )
        self._conn.commit()
        return True


    def log_filtered(
        self,
        *,
        graph_id: str,
        subject: str | None = None,
        from_email: str | None = None,
        reason: str,
        stage: str,
    ) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT INTO filtered_log
               (graph_id, subject, from_email, reason, stage, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (graph_id, subject or "", from_email or "", reason, stage, ts),
        )
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> ProcessedStore:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    # --- Legacy dump mode (mark every exported message) ---

    def is_processed(self, graph_id: str) -> bool:
        cur = self._conn.execute(
            "SELECT 1 FROM processed WHERE graph_id = ? LIMIT 1", (graph_id,)
        )
        return cur.fetchone() is not None

    def mark(self, graph_id: str) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            "INSERT OR REPLACE INTO processed (graph_id, processed_at) VALUES (?, ?)",
            (graph_id, ts),
        )
        self._conn.commit()

    def mark_many(self, ids: Iterable[str]) -> None:
        for i in ids:
            self.mark(i)

    # --- MetaForge pipeline states ---

    def pipeline_get_state(self, graph_id: str) -> str | None:
        cur = self._conn.execute(
            "SELECT state FROM pipeline_state WHERE graph_id = ? LIMIT 1",
            (graph_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return str(row[0] or "").strip().lower() or None

    def pipeline_should_skip(self, graph_id: str) -> bool:
        state = self.pipeline_get_state(graph_id)
        # terminal or handoff-complete states should not be re-enqueued
        return state in {"synced", "skipped", "pending_sync", "pending_review"}

    def pipeline_clear_stale_inflight(self, max_age_seconds: int = 1800) -> int:
        """Drop queued/processing rows stuck longer than max_age_seconds so they can be re-enqueued."""
        from datetime import datetime, timezone

        cutoff = datetime.now(timezone.utc).timestamp() - max_age_seconds
        rows = self._conn.execute(
            """SELECT graph_id, updated_at, state FROM pipeline_state
               WHERE state IN ('queued', 'processing')"""
        ).fetchall()
        cleared = 0
        for graph_id, updated_at, state in rows:
            try:
                ts = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if ts.timestamp() >= cutoff:
                    continue
            except Exception:
                pass
            self._conn.execute(
                "DELETE FROM pipeline_state WHERE graph_id = ? AND state = ?",
                (graph_id, state),
            )
            cleared += 1
        if cleared:
            self._conn.commit()
        return cleared

    def pipeline_pending_sync_with_memory(self, limit: int = 5) -> list[tuple[str, str]]:
        cur = self._conn.execute(
            """SELECT ps.graph_id, rm.payload_json
               FROM pipeline_state ps
               JOIN requirement_memory rm ON rm.source_graph_id = ps.graph_id
               WHERE ps.state = 'pending_sync'
               ORDER BY ps.updated_at ASC
               LIMIT ?""",
            (max(1, limit),),
        )
        return [(str(gid), str(payload)) for gid, payload in cur.fetchall()]

    def pipeline_mark_queued(self, graph_id: str, detail: str | None = None) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO pipeline_state (graph_id, updated_at, state, detail)
               VALUES (?, ?, 'queued', ?)""",
            (graph_id, ts, (detail or "")[:2000]),
        )
        self._conn.commit()

    def pipeline_mark_processing(self, graph_id: str, detail: str | None = None) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO pipeline_state (graph_id, updated_at, state, detail)
               VALUES (?, ?, 'processing', ?)""",
            (graph_id, ts, (detail or "")[:2000]),
        )
        self._conn.commit()

    def pipeline_mark_pending_sync(self, graph_id: str, detail: str | None = None) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO pipeline_state (graph_id, updated_at, state, detail)
               VALUES (?, ?, 'pending_sync', ?)""",
            (graph_id, ts, (detail or "")[:2000]),
        )
        self._conn.commit()

    def pipeline_mark_pending_review(self, graph_id: str, detail: str | None = None) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO pipeline_state (graph_id, updated_at, state, detail)
               VALUES (?, ?, 'pending_review', ?)""",
            (graph_id, ts, (detail or "")[:2000]),
        )
        self._conn.commit()

    def add_pending_review(
        self,
        *,
        graph_id: str,
        job_id: str,
        client_jd_id: str,
        payload_json: str,
        review_fields: str,
    ) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT INTO pending_reviews
               (graph_id, job_id, client_jd_id, payload_json, review_fields, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'PENDING_REVIEW', ?)""",
            (graph_id, job_id, client_jd_id, payload_json, review_fields, ts),
        )
        self._conn.commit()

    def pipeline_mark_skipped(self, graph_id: str, reason: str) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO pipeline_state (graph_id, updated_at, state, detail)
               VALUES (?, ?, 'skipped', ?)""",
            (graph_id, ts, reason[:2000] if reason else ""),
        )
        self._conn.commit()

    def pipeline_mark_synced(self, graph_id: str, detail: str | None = None) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO pipeline_state (graph_id, updated_at, state, detail)
               VALUES (?, ?, 'synced', ?)""",
            (graph_id, ts, (detail or "")[:2000]),
        )
        self._conn.commit()

    # --- Cross-message dedupe ---

    def requirement_fingerprint_exists(
        self,
        *,
        requirement_from: str,
        job_title: str,
        location: str,
        budget_period: str,
        hours: int = 24,
    ) -> bool:
        from datetime import datetime, timedelta, timezone

        fp = self._make_requirement_fingerprint(
            requirement_from=requirement_from,
            job_title=job_title,
            location=location,
            budget_period=budget_period,
        )
        threshold = (datetime.now(timezone.utc) - timedelta(hours=max(1, hours))).isoformat()
        cur = self._conn.execute(
            """SELECT 1 FROM requirement_fingerprints
               WHERE fingerprint = ? AND created_at >= ?
               LIMIT 1""",
            (fp, threshold),
        )
        return cur.fetchone() is not None

    def add_requirement_fingerprint(
        self,
        *,
        graph_id: str,
        requirement_from: str,
        job_title: str,
        location: str,
        budget_period: str,
    ) -> None:
        from datetime import datetime, timezone

        fp = self._make_requirement_fingerprint(
            requirement_from=requirement_from,
            job_title=job_title,
            location=location,
            budget_period=budget_period,
        )
        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO requirement_fingerprints (fingerprint, graph_id, created_at)
               VALUES (?, ?, ?)""",
            (fp, graph_id, ts),
        )
        self._conn.commit()

    # --- File listener dedupe ---

    def is_file_event_processed(self, fingerprint: str) -> bool:
        cur = self._conn.execute(
            "SELECT 1 FROM file_listener_state WHERE fingerprint = ? LIMIT 1",
            (fingerprint,),
        )
        return cur.fetchone() is not None

    def mark_file_event_processed(self, *, fingerprint: str, file_path: str) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """INSERT OR REPLACE INTO file_listener_state (fingerprint, file_path, processed_at)
               VALUES (?, ?, ?)""",
            (fingerprint, file_path, ts),
        )
        self._conn.commit()

    # --- Requirement historical memory for autofill ---

    def add_requirement_memory(
        self,
        *,
        requirement_from: str,
        job_title: str,
        payload_json: str,
        source_graph_id: str | None = None,
    ) -> None:
        from datetime import datetime, timezone

        ts = datetime.now(timezone.utc).isoformat()
        title_norm = str(job_title or "").strip().lower()
        req_from = str(requirement_from or "").strip().lower()
        self._conn.execute(
            """INSERT INTO requirement_memory
               (requirement_from, job_title_norm, payload_json, source_graph_id, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (req_from, title_norm, payload_json, source_graph_id, ts),
        )
        self._conn.commit()

    def get_requirement_memory_candidates(
        self,
        *,
        requirement_from: str,
        job_title: str,
        limit: int = 20,
    ) -> list[str]:
        req_from = str(requirement_from or "").strip().lower()
        title_norm = str(job_title or "").strip().lower()
        if not req_from:
            return []
        if title_norm:
            cur = self._conn.execute(
                """SELECT payload_json FROM requirement_memory
                   WHERE requirement_from = ? AND job_title_norm = ?
                   ORDER BY created_at DESC
                   LIMIT ?""",
                (req_from, title_norm, max(1, limit)),
            )
            rows = [str(r[0]) for r in cur.fetchall()]
            if rows:
                return rows
        cur = self._conn.execute(
            """SELECT payload_json FROM requirement_memory
               WHERE requirement_from = ?
               ORDER BY created_at DESC
               LIMIT ?""",
            (req_from, max(1, limit)),
        )
        return [str(r[0]) for r in cur.fetchall()]

    @staticmethod
    def _make_requirement_fingerprint(
        *,
        requirement_from: str,
        job_title: str,
        location: str,
        budget_period: str,
    ) -> str:
        raw = "|".join(
            [
                str(requirement_from or "").strip().lower(),
                str(job_title or "").strip().lower(),
                str(location or "").strip().lower(),
                str(budget_period or "").strip().lower(),
            ]
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _compute_requirement_details_hash(self, payload: dict) -> str:
        """Hash key fields to detect details/status changes (Rules 4 & 5)."""
        import json
        import hashlib

        details = {
            "job_title": str(payload.get("job_title") or "").strip().lower(),
            "location": str(payload.get("location") or "").strip().lower(),
            "overall_experience": str(payload.get("overall_experience") or "").strip().lower(),
            "notice_period": str(payload.get("notice_period") or "").strip().lower(),
            "number_of_positions": payload.get("number_of_positions"),
            "yearly_budget": payload.get("yearly_budget"),
            "monthly_budget": payload.get("monthly_budget"),
            "mandatory_skills": payload.get("mandatory_skills"),
            "skills": payload.get("skills"),
            "job_status": str(payload.get("job_status") or "open").strip().lower(),
            "priority": str(payload.get("priority") or "").strip().lower(),
        }
        blob = json.dumps(details, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    def _find_existing_client_requirement(self, client_jd_id: str) -> tuple[str, str, str, str] | None:
        """
        Search for existing stored requirement by client_jd_id across client_requirements,
        pending_reviews, and metaforge_requirements.db.
        Returns (req_id, status, details_hash, payload_json) or None.
        """
        cjd = str(client_jd_id or "").strip()
        if not cjd or cjd.lower() in ("none", "null", "not_found"):
            return None

        # 1. Check client_requirements table
        try:
            cur = self._conn.execute(
                "SELECT client_jd_id, status, details_hash, payload_json FROM client_requirements WHERE client_jd_id = ? LIMIT 1",
                (cjd,),
            )
            row = cur.fetchone()
            if row:
                try:
                    p = json.loads(row[3])
                    int_id = str(p.get("job_id") or row[0])
                except Exception:
                    int_id = str(row[0])
                return (int_id, str(row[1]), str(row[2]), str(row[3]))
        except Exception:
            pass

        # 2. Check pending_reviews table
        try:
            cur = self._conn.execute(
                "SELECT job_id, status, payload_json FROM pending_reviews WHERE client_jd_id = ? LIMIT 1",
                (cjd,),
            )
            row = cur.fetchone()
            if row:
                p_str = str(row[2])
                try:
                    p_dict = json.loads(p_str)
                    d_hash = self._compute_requirement_details_hash(p_dict)
                except Exception:
                    d_hash = ""
                return (str(row[0]), str(row[1]), d_hash, p_str)
        except Exception:
            pass

        # 3. Check metaforge_requirements.db
        mf_db = self.path.parent / "metaforge_requirements.db"
        if mf_db.exists():
            try:
                conn_mf = sqlite3.connect(f"file:{mf_db.resolve()}?mode=ro", uri=True)
                conn_mf.row_factory = sqlite3.Row
                rows = conn_mf.execute("SELECT job_id, payload_json FROM metaforge_requirements").fetchall()
                for r in rows:
                    try:
                        p = json.loads(r["payload_json"])
                        if p.get("client_jd_id") == cjd or p.get("client_jd_id_override") == cjd:
                            d_hash = self._compute_requirement_details_hash(p)
                            st = str(p.get("job_status") or "open").lower()
                            conn_mf.close()
                            return (str(r["job_id"]), st, d_hash, r["payload_json"])
                    except Exception:
                        continue
                conn_mf.close()
            except Exception:
                pass

        return None

    # ---------------------------------------------------------------------------
    # Field-level diff helpers (Rule 3 para 6)
    # ---------------------------------------------------------------------------

    @staticmethod
    def _field_diff(old_payload: dict, new_payload: dict) -> dict:
        """
        Return {field: {old, new}} for every tracked field that genuinely changed.
        Fields where new_payload has None/blank are EXCLUDED:
        blank never overwrites existing data (Rule 3 para 4).
        """
        changes: dict = {}
        for field in _TRACKED_FIELDS:
            old_val = old_payload.get(field)
            new_val = new_payload.get(field)
            # Only update if new value is genuinely provided (not None/blank/empty list)
            if new_val is None or new_val == "" or new_val == []:
                continue
            old_norm = str(old_val).strip().lower() if old_val is not None else ""
            new_norm = str(new_val).strip().lower()
            if old_norm != new_norm:
                changes[field] = {"old": old_val, "new": new_val}
        return changes

    @staticmethod
    def _merge_payload(existing: dict, new_payload: dict) -> dict:
        """
        Selective merge implementing Rule 3:
        - Non-blank new values overwrite stored values.
        - Blank/null/empty-list new values leave stored values untouched.
        - _provenance dicts are deep-merged, not replaced entirely.
        """
        merged = dict(existing)
        for key, new_val in new_payload.items():
            if key.startswith("_"):
                if key == "_provenance" and isinstance(new_val, dict) and isinstance(merged.get("_provenance"), dict):
                    merged["_provenance"] = {**merged["_provenance"], **new_val}
                else:
                    merged[key] = new_val
                continue
            if new_val is None or new_val == "" or new_val == []:
                # Rule 3 para 4: blank never overwrites existing data
                continue
            merged[key] = new_val
        return merged

    def get_field_change_history(self, requirement_id: str) -> list[dict]:
        """Return the field-level change history for a requirement (Rule 3 para 6)."""
        cjd = str(requirement_id or "").strip()
        if not cjd:
            return []
        cur = self._conn.execute(
            "SELECT field_change_history FROM client_requirements WHERE client_jd_id = ? LIMIT 1",
            (cjd,),
        )
        row = cur.fetchone()
        if not row or not row[0]:
            return []
        try:
            return _json.loads(row[0]) or []
        except Exception:
            return []

    def evaluate_client_requirement_action(
        self,
        *,
        client_jd_id: str,
        requirement_from: str,
        payload: dict,
    ) -> tuple[str, dict | None]:
        """
        Evaluate identity and lifecycle for requirements with a unique Req ID (Rules 1-4).

        Rule 1: Use client_jd_id as the stable unique identity (never changes).
        Rule 2: Same ID already exists -> never create a second record.
        Rule 3: Only update fields with genuinely new non-blank values;
                blank values leave existing data untouched.
                Record every field change in field_change_history.
        Rule 4: Refresh updated_at on every real change.

        Returns ("CREATE", payload), ("UPDATE", merged_payload), or ("SKIP", existing_payload).
        """
        from datetime import datetime, timezone

        cjd = str(client_jd_id or "").strip()
        if not cjd or cjd.lower() in ("none", "null", "not_found"):
            return "CREATE", payload

        new_status = str(payload.get("job_status") or "open").strip().lower()
        now = datetime.now(timezone.utc).isoformat()

        stored_rec = self._find_existing_client_requirement(cjd)
        if not stored_rec:
            # Rule 1: Req ID never seen before -> CREATE new record
            payload_str = _json.dumps(payload, ensure_ascii=False)
            new_hash = self._compute_requirement_details_hash(payload)
            self._conn.execute(
                """INSERT INTO client_requirements
                   (client_jd_id, requirement_from, status, details_hash,
                    payload_json, created_at, updated_at, field_change_history)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (cjd, requirement_from, new_status, new_hash,
                 payload_str, now, now, _json.dumps([])),
            )
            self._conn.commit()
            return "CREATE", payload

        stored_id, stored_status, stored_hash, stored_payload_str = stored_rec

        # Rule 2: Req ID already exists -> never create second record
        try:
            old_payload = _json.loads(stored_payload_str)
        except Exception:
            old_payload = {}

        # Rule 3: Field-level diff — only consider fields with real new values
        field_changes = self._field_diff(old_payload, payload)
        status_changed = (stored_status.lower() != new_status.lower())

        if not field_changes and not status_changed:
            # True duplicate: same ID, nothing changed -> SKIP
            return "SKIP", old_payload

        # Rule 3: Selective merge — blank fields in new email keep old values
        merged = self._merge_payload(old_payload, payload)
        # Rule 1: The original job_id (internal ID) never changes
        merged["job_id"] = old_payload.get("job_id") or payload.get("job_id") or ""
        merged["client_jd_id"] = cjd

        # Rule 4: Update status in the dedicated status_history table
        if status_changed:
            self.record_status_change(
                requirement_id=stored_id,
                from_status=stored_status,
                to_status=new_status,
                source_email_id=str(payload.get("graphMessageId") or ""),
                changed_by="RULE_ENGINE",
            )
            merged["job_status"] = new_status

        # Rule 3 para 6: Append this event to the field_change_history
        try:
            existing_hist_row = self._conn.execute(
                "SELECT field_change_history FROM client_requirements WHERE client_jd_id = ?",
                (cjd,)
            ).fetchone()
            existing_hist = _json.loads(
                (existing_hist_row[0] if existing_hist_row and existing_hist_row[0] else "[]")
            )
        except Exception:
            existing_hist = []

        if field_changes or status_changed:
            all_changes = dict(field_changes)
            if status_changed and "job_status" not in all_changes:
                all_changes["job_status"] = {"old": stored_status, "new": new_status}
            existing_hist.append({
                "changed_at": now,
                "source_email_id": str(payload.get("graphMessageId") or ""),
                "changes": all_changes,
            })

        new_hash = self._compute_requirement_details_hash(merged)
        merged_str = _json.dumps(merged, ensure_ascii=False)
        hist_str = _json.dumps(existing_hist, ensure_ascii=False)

        # Rule 4: Update the record; updated_at is refreshed now
        self._conn.execute(
            """UPDATE client_requirements
               SET status = ?, details_hash = ?, payload_json = ?,
                   updated_at = ?, field_change_history = ?
               WHERE client_jd_id = ?""",
            (new_status, new_hash, merged_str, now, hist_str, cjd),
        )
        self._conn.commit()
        return "UPDATE", merged

