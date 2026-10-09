"""
Email Access-Control Validator and Filter Rules.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Optional

try:
    import pytz
    def _get_ist_tz():
        return pytz.timezone('Asia/Kolkata')
except ImportError:
    from zoneinfo import ZoneInfo
    def _get_ist_tz():
        return ZoneInfo('Asia/Kolkata')

_LOG = logging.getLogger(__name__)

import json
from pathlib import Path

def _load_allowed_domains() -> set[str]:
    rules_path = Path(__file__).resolve().parent / "config" / "pipeline_rules.json"
    if rules_path.exists():
        try:
            with open(rules_path, "r", encoding="utf-8") as f:
                rules = json.load(f)
                doms = rules.get("allowed_domains", [])
                if doms:
                    return set(doms)
        except Exception:
            pass
    return {
        "idexcel.com",
        "iexcel.co.in",
        "kpmg.com",
        "itcinfotech.com",
        "ltts.com",
        "eximietas.com",
    }

ALLOWED_CLIENT_DOMAINS = _load_allowed_domains()

ALLOWED_SENDER_EMAILS = {
    "rkarnam@metaforgeit.com",   # CEO exception
}


def validate_email_access(email_input: str) -> Dict[str, str]:
    """
    Decide whether an email address is ALLOWED or BLOCKED using strict allowlist rules.
    Returns dict with keys: 'email', 'decision', 'reason'.
    """
    if not email_input or not isinstance(email_input, str):
        return {
            "email": "",
            "decision": "BLOCKED",
            "reason": "invalid format"
        }

    # Rule 1: Normalize
    email = email_input.strip().lower()

    # Rule 2: Valid email format check (exactly one "@", non-empty local part and domain)
    if email.count("@") != 1:
        return {
            "email": email,
            "decision": "BLOCKED",
            "reason": "invalid format"
        }

    local_part, domain = email.split("@", 1)
    if not local_part or not domain or "." not in domain:
        return {
            "email": email,
            "decision": "BLOCKED",
            "reason": "invalid format"
        }

    # Rule 3: CEO Exception
    if email in ALLOWED_SENDER_EMAILS:
        return {
            "email": email,
            "decision": "ALLOWED",
            "reason": "CEO exception"
        }

    # Rule 4: Internal domain block (metaforgeit.com)
    if domain == "metaforgeit.com":
        return {
            "email": email,
            "decision": "BLOCKED",
            "reason": "internal domain blocked"
        }

    # Rule 5: Strict exact domain match
    if domain in ALLOWED_CLIENT_DOMAINS:
        return {
            "email": email,
            "decision": "ALLOWED",
            "reason": f"allowed domain: {domain}"
        }

    # Rule 6: Default BLOCKED
    return {
        "email": email,
        "decision": "BLOCKED",
        "reason": "domain not in allowlist"
    }


def is_sender_allowlisted(from_email: str) -> bool:
    """Boolean helper wrapping validate_email_access."""
    result = validate_email_access(from_email)
    allowed = result["decision"] == "ALLOWED"
    if not allowed:
        _LOG.info("Sender blocked by allowlist: %r (%s)", from_email, result["reason"])
    return allowed


_POSITION_COUNT_RX = re.compile(r"\b\d+\+?\s*(?:position|positions|opening|openings)\b", re.I)
_EXP_SKILL_RX = re.compile(
    r"\b(?:exp|experience)\s*[:\-]?\s*\d+|\d+\+?\s*(?:yrs?|years?)\b|\bmandatory\s+skills?\b|\brequired\s+skills?\b",
    re.I,
)


def has_requirement_structure(body: str) -> bool:
    """
    True only if the BODY (never the subject) contains concrete requirement details or status lifecycle signals.
    """
    blob = body or ""
    if _POSITION_COUNT_RX.search(blob):
        return True
    if _EXP_SKILL_RX.search(blob):
        return True
    try:
        from status_tracker import detect_status_keyword
        if detect_status_keyword("", blob) is not None:
            return True
    except Exception:
        pass
    if re.search(r"\b(?:req\s*id|job\s*posting\s*id|so\s*#?|acc|req|dltjp|rq)[\s\-_:]*#?\d+\b", blob, re.I):
        return True
    try:
        from requirement_classifier import FTE_JD_MARKERS
        if any(rx.search(blob) for rx in FTE_JD_MARKERS):
            return True
    except ImportError:
        pass
    return False


@dataclass(frozen=True)
class FilterResult:
    allowed: bool
    reason: str | None = None


def normalize_to_ist(received_date_time: str) -> str:
    """Convert all timestamps to Asia/Kolkata (IST) before processing."""
    try:
        if 'Z' in received_date_time:
            dt = datetime.fromisoformat(received_date_time.replace('Z', '+00:00'))
        else:
            dt = datetime.fromisoformat(received_date_time)
        
        ist_tz = _get_ist_tz()
        dt_ist = dt.astimezone(ist_tz)
        return dt_ist.isoformat()
    except Exception:
        return received_date_time


def apply_email_filter(from_email: str, body: str) -> FilterResult:
    """Main intake gate logic for pipeline."""
    validation = validate_email_access(from_email)
    if validation["decision"] != "ALLOWED":
        return FilterResult(allowed=False, reason=f"Sender blocked: {validation['reason']}")
    
    if not has_requirement_structure(body):
        return FilterResult(allowed=False, reason="Body lacks requirement structure")
        
    return FilterResult(allowed=True, reason="Passed sender allowlist and structure gate")
