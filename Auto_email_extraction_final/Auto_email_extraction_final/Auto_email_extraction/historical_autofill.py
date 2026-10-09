"""
Historical autofill for missing requirement fields using previously synced payloads.
"""

from __future__ import annotations

import json
from typing import Any

from processed_store import ProcessedStore

_FILLABLE_FIELDS: tuple[str, ...] = (
    "internal_poc",
    "client_poc",
    "work_mode",
    "location",
    "overall_experience",
    "notice_period",
    "priority",
    "employment_type",
    "budget_currency",
    "yearly_budget",
    "monthly_budget",
    "mandatory_skills",
    "skills",
)
_DEFAULT_AUTOFILL_CONFIDENCE = 0.65


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        v = value.strip().lower()
        return v in {"", "n/a", "na", "unknown", "not provided", "not specified"}
    if isinstance(value, list):
        return len([x for x in value if str(x).strip()]) == 0
    return False


def _pick_best_memory(candidates: list[dict[str, Any]], current_title: str) -> dict[str, Any] | None:
    if not candidates:
        return None
    t = (current_title or "").strip().lower()
    if not t:
        return candidates[0]
    for c in candidates:
        ct = str(c.get("job_title") or "").strip().lower()
        if ct and (ct == t or t in ct or ct in t):
            return c
    return candidates[0]


def autofill_from_history(payload: dict[str, Any], store: ProcessedStore) -> dict[str, Any]:
    req_from = str(payload.get("requirement_from") or "").strip()
    title = str(payload.get("job_title") or "").strip()
    raw_candidates = store.get_requirement_memory_candidates(
        requirement_from=req_from,
        job_title=title,
        limit=20,
    )
    parsed: list[dict[str, Any]] = []
    for raw in raw_candidates:
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                parsed.append(obj)
        except Exception:
            continue
    best = _pick_best_memory(parsed, title)
    if not best:
        return payload

    output = dict(payload)
    backfilled_fields: list[str] = []
    for k in _FILLABLE_FIELDS:
        if _is_missing(output.get(k)) and not _is_missing(best.get(k)):
            output[k] = best.get(k)
            backfilled_fields.append(k)

    if backfilled_fields:
        output.setdefault("_provenance", {})
        if isinstance(output["_provenance"], dict):
            output["_provenance"]["historical_autofill_fields"] = backfilled_fields
        output["autofillMeta"] = {
            "source": "historical_memory",
            "fields": [
                {"field": f, "confidence": _DEFAULT_AUTOFILL_CONFIDENCE}
                for f in backfilled_fields
            ],
        }
    return output
