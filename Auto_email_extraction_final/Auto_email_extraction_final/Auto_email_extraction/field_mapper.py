"""
Map extracted AI fields + email metadata to MetaForge application payload shape.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from models import DashboardRequirement24


@dataclass(frozen=True)
class EmailContext:
    """Graph-derived fields needed for MetaForge mapping."""

    graph_message_id: str
    internet_message_id: str
    to_emails: list[str]
    cc_emails: list[str]
    from_email: str
    from_name: str


_LPA_RE = re.compile(
    r"(?P<low>\d+(?:\.\d+)?)\s*(?:-|to|–|—)?\s*(?P<high>\d+(?:\.\d+)?)?\s*lpa",
    re.IGNORECASE,
)
_LPM_RE = re.compile(
    r"(?P<low>\d+(?:\.\d+)?)\s*(?:-|to|–|—)?\s*(?P<high>\d+(?:\.\d+)?)?\s*lpm",
    re.IGNORECASE,
)
_USD_RE = re.compile(
    r"\$\s*(?P<n>\d+(?:\.\d+)?)\s*(?:/hr|per hour)?",
    re.IGNORECASE,
)
_EUR_RE = re.compile(r"(?i)\b(?:€|eur)\s*(?P<n>\d+(?:\.\d+)?)")
_INR_RE = re.compile(r"(?i)\b(?:₹|inr)\s*(?P<n>\d+(?:\.\d+)?)")
_SKILL_LINE_RE = re.compile(r"(?im)^\s*(?:skill|skills|mandatory skills?)\s*[:\-]\s*(.+)$")
_EXP_RE = re.compile(r"(?i)\b(\d{1,2}\s*[-–]\s*\d{1,2}|\d{1,2}\+?)\s*(?:years?|yrs?)\b")
_JD_SECTION_RE = re.compile(
    r"(?is)(?:job description\s*[:\-]\s*)(?P<jd>.+?)(?:\n\s*qualifications?\s*[:\-]|\Z)"
)

_MANDATORY_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\bbiw\b", "BIW (Body-in-White) design experience"),
    (r"\bnx\b|\bsiemens nx\b|\bnx cad\b", "CAD modeling using Siemens NX (NX CAD)"),
    (r"doors?\s*(?:&|and)?\s*closures?\b|\bdoor mechanisms?\b", "Automotive Doors & Closures domain knowledge"),
    (r"\bdaimler\b", "Daimler design methodology experience"),
    (r"assembly\b.*\b(joining|elements?)|\bjoining elements?\b", "Assembly design & joining elements creation"),
    (r"concept (?:proposal|design)|packaging study", "Concept design & packaging study"),
    (r"interference (?:check|checking)", "Interference checking"),
)

_CORE_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"master section", "Master section creation & validation"),
    (r"benchmark", "Benchmarking"),
    (r"styling validation", "Styling validation"),
    (r"door mechanisms?", "Door mechanisms"),
    (r"\bglass\b", "Glass systems"),
    (r"hinges?\b|handles?\b", "Hinges & handles"),
    (r"cost reduction", "Cost reduction techniques"),
    (r"weight reduction|weight optimization", "Weight optimization"),
    (r"cross functional|cft", "Cross-functional collaboration (CFT)"),
    (r"change management", "Change management"),
    (r"\bsimulation\b", "Simulation awareness"),
    (r"\bmanufacturing\b", "Manufacturing awareness"),
    (r"vehicle integration", "Vehicle integration understanding"),
    (r"corrosion", "Corrosion protection awareness"),
)


def _type_of_demand(jd_count: int | None) -> str:
    """
    Demand type is based on number of JDs in the requirement, not openings.
    1 JD => Single, 2-9 JDs => Multiple, 10+ JDs => Bulk.
    """
    if jd_count is None or jd_count < 1:
        return "Single"
    if jd_count == 1:
        return "Single"
    if 2 <= jd_count <= 9:
        return "Multiple"
    return "Bulk"


def _norm_priority(p: str | None) -> str | None:
    if not p or str(p).strip().lower() in ("unknown", "none", "null", ""):
        return None
    u = str(p).strip().upper()
    if u in ("HIGH", "MEDIUM", "LOW"):
        return u
    return None


def _norm_employment(t: str | None) -> str:
    if not t:
        return "full-time"
    s = str(t).strip().lower()
    if s in ("full-time", "full time", "permanent", "fte", "full-time"):
        return "full-time"
    if s in ("contract", "contractor", "c2h", "c2c"):
        return "contract"
    return s if s in ("full-time", "contract") else "full-time"


def _norm_work_mode(w: str | None) -> str:
    if not w:
        return "unknown"
    s = str(w).strip().lower()
    if re.search(r"\b[1-4]\s*days?\b", s) or re.search(r"\b[1-4]\s*days?\s*(?:work\s*)?(?:from\s*|in\s*|at\s*)?office\b", s) or "hybrid" in s or "partially" in s:
        return "hybrid"
    if s in ("on-site", "on site", "onsite", "office"):
        return "on-site"
    if s in ("remote", "wfh", "work from home"):
        return "remote"
    if s in ("hybrid",):
        return "hybrid"
    return "unknown"


def _norm_experience_level(level: str | None) -> str:
    if not level:
        return "unknown"
    s = str(level).strip().lower()
    if s in ("entry level", "entry"):
        return "junior"
    if s in ("mid level", "mid", "mid senior", "mid-senior", "midsenior"):
        return "mid senior"
    if s in ("senior level", "senior", "lead", "expert"):
        return "senior"
    if s in ("expert level", "expert"):
        return "senior"
    if s == "unknown":
        return "unknown"
    return "unknown"


def _align_experience_level_with_overall(exp_level: str, overall_exp: str | None) -> str:
    """Ensure experience_level is aligned with overall_experience (e.g. 9+ years is Senior, not Mid Senior)."""
    if not overall_exp:
        return exp_level
    m = re.search(r"(\d{1,2})\s*\+?", str(overall_exp))
    if m:
        try:
            years = int(m.group(1))
            if years >= 8 and str(exp_level).lower() in ("mid senior", "mid-senior", "junior", "unknown"):
                return "Senior"
            elif years <= 3 and str(exp_level).lower() in ("senior", "mid senior"):
                return "Junior"
            elif 4 <= years <= 7 and str(exp_level).lower() in ("junior", "senior"):
                return "Mid Senior"
        except ValueError:
            pass
    return exp_level


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    parts = re.split(r"[,\n;/|]+", text)
    return [p.strip() for p in parts if p.strip()]


def _norm_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _infer_experience_level_from_text(text: str) -> str:
    m = _EXP_RE.search(text or "")
    if not m:
        return "unknown"
    raw = m.group(1).replace(" ", "")
    try:
        if "-" in raw:
            lo = float(raw.split("-", 1)[0])
        elif "+" in raw:
            lo = float(raw.replace("+", ""))
        else:
            lo = float(raw)
    except ValueError:
        return "unknown"
    if lo < 3:
        return "junior"
    if lo < 7:
        return "mid"
    return "senior"


def _infer_overall_experience(text: str, level: str) -> str:
    m = _EXP_RE.search(text or "")
    if m:
        return f"{m.group(1)} years".replace("  ", " ").strip()
    if level == "junior":
        return "2-4 years"
    if level == "mid senior":
        return "4-7 years"
    if level == "senior":
        return "7+ years"
    return "3-6 years"


def _extract_skills_from_text(text: str) -> tuple[str | None, str | None]:
    if not text:
        return None, None
    mandatory: list[str] = []
    skills: list[str] = []
    low_text = text.lower()

    # JD-focused parsing for richer extraction quality.
    jd_match = _JD_SECTION_RE.search(text)
    jd_block = jd_match.group("jd") if jd_match else text
    jd_low = jd_block.lower()

    # Explicit "Skill:" line
    for m in _SKILL_LINE_RE.finditer(text):
        for token in re.split(r",|/|\|", m.group(1)):
            t = token.strip(" .-")
            if t:
                # explicit "Skill:" lines are typically strict filters in client mails
                mandatory.append(t)
                skills.append(t)

    # Pattern-based extraction for automotive JD-style emails.
    for pat, label in _MANDATORY_PATTERNS:
        if re.search(pat, jd_low, re.IGNORECASE):
            mandatory.append(label)

    for pat, label in _CORE_PATTERNS:
        if re.search(pat, jd_low, re.IGNORECASE):
            skills.append(label)

    # Job description bullet-ish lines and strong requirements
    for ln in jd_block.splitlines():
        s = ln.strip().strip("-*")
        if not s:
            continue
        low = s.lower()
        if len(s) > 120:
            continue
        if any(k in low for k in ("must", "mandatory", "should have", "hands on", "strong in")):
            mandatory.append(s)
        if any(
            k in low
            for k in (
                "python",
                "java",
                "aws",
                "azure",
                "sap",
                "sql",
                "react",
                "databricks",
                "pyspark",
                "nx",
                "biw",
                "cad",
                "closures",
                "door",
                "daimler",
                "interference",
                "packaging",
                "benchmark",
                "styling",
            )
        ):
            skills.append(s)

    def _dedup(xs: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for x in xs:
            k = x.lower()
            if k not in seen:
                seen.add(k)
                out.append(x)
        return out

    # Remove overlap so "skills" acts as core/nice-to-have list.
    dedup_m = _dedup(mandatory)
    dedup_s = [x for x in _dedup(skills) if x.lower() not in {m.lower() for m in dedup_m}]

    # If still empty, run pattern checks against full body as fallback.
    if not dedup_m:
        for pat, label in _MANDATORY_PATTERNS:
            if re.search(pat, low_text, re.IGNORECASE):
                dedup_m.append(label)
    if not dedup_s:
        for pat, label in _CORE_PATTERNS:
            if re.search(pat, low_text, re.IGNORECASE):
                dedup_s.append(label)

    m_out = "; ".join(dedup_m[:12]) if dedup_m else None
    s_out = "; ".join(dedup_s[:20]) if dedup_s else None
    return m_out, s_out


def parse_budget_fields(budget_text: str | None) -> dict[str, Any]:
    """
    Derive display budget and optional INR LPA numeric range from free text.
    """
    raw = (budget_text or "").strip()
    out: dict[str, Any] = {
        "budget_display": raw or None,
        "budget_currency": None,
        "budget_inr_lpa_min": None,
        "budget_inr_lpa_max": None,
        "budget_inr_lpm_min": None,
        "budget_inr_lpm_max": None,
        "budget_period": None,
    }
    if not raw:
        return out

    m = _LPA_RE.search(raw)
    if m:
        low = float(m.group("low"))
        high_s = m.group("high")
        high = float(high_s) if high_s else low
        out["budget_currency"] = "INR"
        out["budget_inr_lpa_min"] = int(min(low, high) * 100000)
        out["budget_inr_lpa_max"] = int(max(low, high) * 100000)
        out["budget_period"] = "yearly"
        return out

    m_lpm = _LPM_RE.search(raw)
    if m_lpm:
        low = float(m_lpm.group("low"))
        high_s = m_lpm.group("high")
        high = float(high_s) if high_s else low
        out["budget_currency"] = "INR"
        out["budget_inr_lpm_min"] = int(min(low, high) * 100000)
        out["budget_inr_lpm_max"] = int(max(low, high) * 100000)
        out["budget_period"] = "monthly"
        return out

    m2 = _USD_RE.search(raw)
    if m2:
        out["budget_currency"] = "USD"
        out["budget_display"] = f"USD {m2.group('n')}"
        return out

    m3 = _EUR_RE.search(raw)
    if m3:
        out["budget_currency"] = "EUR"
        out["budget_display"] = f"EUR {m3.group('n')}"
        return out

    m4 = _INR_RE.search(raw)
    if m4:
        out["budget_currency"] = "INR"
        out["budget_display"] = f"INR {m4.group('n')}"
        return out

    return out


def map_to_ui_payload(validated_item: dict[str, Any], email_metadata: dict[str, Any]) -> dict[str, Any]:
    """
    Translate validated requirement into UI-facing JSON shape.
    """
    loc_list = _as_list(validated_item.get("location"))
    mand = _as_list(validated_item.get("mandatory_skills"))
    additional = _as_list(validated_item.get("soft_skills") or validated_item.get("skills"))
    budget_min = validated_item.get("yearly_budget_min")
    budget_max = validated_item.get("yearly_budget_max")
    monthly_budget_min = validated_item.get("monthly_budget_min")
    monthly_budget_max = validated_item.get("monthly_budget_max")
    budget_raw = str(validated_item.get("budget") or "")
    budget_bits = parse_budget_fields(budget_raw)
    if budget_min is not None or budget_max is not None:
        budget_bits["budget_currency"] = budget_bits.get("budget_currency") or "INR"
    if monthly_budget_min is not None or monthly_budget_max is not None:
        budget_bits["budget_currency"] = budget_bits.get("budget_currency") or "INR"

    raw_pos = validated_item.get("number_of_positions")
    if raw_pos is not None:
        try:
            n_positions = int(raw_pos)
        except (TypeError, ValueError):
            n_positions = None
    else:
        n_positions = None

    from_email = str(email_metadata.get("from_email") or "").strip()
    to_emails = _as_list(email_metadata.get("to_emails"))
    cc_emails = _as_list(email_metadata.get("cc_emails"))
    
    # Internal POC is derived from To recipients (internal company staff)
    internal_poc_str = "; ".join(to_emails) if to_emails else None

    # Client POC (CC) must ONLY include external client domain addresses, excluding internal company staff (@metaforgeit.com)
    internal_domains = {"metaforgeit.com", "metaforge.com", "metaforge.co"}
    client_poc_parts: list[str] = []
    poc_seen: set[str] = set()
    for em in cc_emails:
        norm = _norm_text(em)
        domain = norm.split("@")[-1] if "@" in norm else ""
        if norm and norm not in poc_seen and domain not in internal_domains:
            poc_seen.add(norm)
            client_poc_parts.append(em)

    NOISE_SKILLS = {
        "mobile no", "mobile number", "phone", "email id", "email address",
        "applicant location", "applicant name", "candidate name", "preferred location",
        "current org", "vendor", "sl. no", "sl no", "s.no", "total exp", "relevant exp",
        "notice period", "monthly billing rates", "billing rates"
    }
    mand = [s for s in mand if str(s).strip().lower() not in NOISE_SKILLS]
    additional = [s for s in additional if str(s).strip().lower() not in NOISE_SKILLS]

    if monthly_budget_min is not None or monthly_budget_max is not None:
        if monthly_budget_min is not None and monthly_budget_max is not None and monthly_budget_min != monthly_budget_max:
            monthly_budget_val = f"₹{monthly_budget_min:,} - ₹{monthly_budget_max:,}"
        else:
            mval = monthly_budget_max if monthly_budget_max is not None else monthly_budget_min
            monthly_budget_val = f"₹{mval:,}"
    else:
        monthly_budget_val = None

    raw_exp_level = _norm_experience_level(str(validated_item.get("experience_level") or "")).replace("-", " ").title()
    overall_exp = str(validated_item.get("experience") or "").strip() or None
    final_exp_level = _align_experience_level_with_overall(raw_exp_level, overall_exp)
    p_val = _norm_priority(validated_item.get("priority"))

    payload = {
        "job_id": str(email_metadata.get("job_id") or f"REQ-{email_metadata.get('date')}-{email_metadata.get('count')}"),
        "demand_received_date": email_metadata.get("date"),
        "internal_poc_email": internal_poc_str,
        "internal_poc": internal_poc_str,
        "requirement_from": email_metadata.get("requirement_from") or validated_item.get("client_name") or "Other",
        "client_jd_id": str(email_metadata.get("client_jd_id") or ""),
        "client_lead_poc_email": from_email or None,
        "client_poc_emails": "; ".join(client_poc_parts) if client_poc_parts else None,
        "job_title": str(validated_item.get("job_title") or "").strip() or None,
        "job_status": "open",
        "closed_date": None,
        "type_of_demand": "single" if (n_positions == 1 or n_positions is None) else ("multiple" if n_positions < 10 else "bulk"),
        "priority": p_val.lower() if p_val else "unknown",
        "number_of_positions": n_positions,
        "experience_level": final_exp_level,
        "employment_type": _norm_employment(str(validated_item.get("employment_type") or "")).replace("-", " ").title(),
        "budget_currency": budget_bits.get("budget_currency"),
        "yearly_budget": budget_max if budget_max is not None else budget_min,
        "monthly_budget": monthly_budget_val,
        "work_mode": _norm_work_mode(str(validated_item.get("work_mode") or "")).title(),
        "location": ", ".join(loc_list) if loc_list else None,
        "overall_experience": overall_exp,
        "notice_period": str(validated_item.get("notice_period") or "").strip() or None,
        "mandatory_skills": mand,
        "skills": additional,
    }
    return DashboardRequirement24.model_validate(payload).model_dump(mode="json")


def check_ui_readiness(validated_item: dict[str, Any]) -> dict[str, Any]:
    """
    Flag fields for manual review when extraction confidence is low.
    """
    review_required: list[str] = []
    c_val = validated_item.get("confidence")
    if c_val is None:
        c_val = validated_item.get("overall_confidence")
    overall_conf = float(c_val if c_val is not None else 1.0)
    if overall_conf < 0.50:
        review_required.append("overall_confidence")

    if validated_item.get("is_classifier_uncertain") or validated_item.get("classifier_uncertain"):
        review_required.append("classifier_uncertain")

    if validated_item.get("reconciliation_status") == "conflict_review_flagged" or (
        validated_item.get("processing_note") and "Reconciliation conflict" in str(validated_item.get("processing_note"))
    ):
        review_required.append("table_reconciliation_conflict")

    if (
        validated_item.get("client_key") == "idexcel_unresolved"
        or validated_item.get("requirement_from") in ("unresolved", "Idexcel (client not identified)", "Idexcel")
        or validated_item.get("idexcel_unresolved")
        or (validated_item.get("processing_note") and "idexcel.com" in str(validated_item.get("processing_note")))
    ):
        review_required.append("idexcel_client_unresolved")

    field_conf = validated_item.get("field_confidence")
    if not isinstance(field_conf, dict):
        field_conf = {}

    jt_conf = field_conf.get("job_title")
    if jt_conf is None:
        jt_conf = overall_conf
    try:
        jt_conf_float = float(jt_conf)
    except (TypeError, ValueError):
        jt_conf_float = overall_conf

    if jt_conf_float < 0.5 or not str(validated_item.get("job_title") or "").strip():
        review_required.append("job_title")

    # Budget is optional in initial client JDs; do not block auto-sync if budget is omitted
    if not validated_item.get("yearly_budget_max") and not validated_item.get("monthly_budget_max"):
        review_required.append("budget_not_provided")

    critical_blocks = [
        f for f in review_required
        if f in {
            "job_title",
            "classifier_uncertain",
            "overall_confidence",
            "table_reconciliation_conflict",
            "idexcel_client_unresolved",
        }
    ]

    return {
        "is_ready_for_auto_sync": len(critical_blocks) == 0,
        "review_fields": sorted(set(review_required)),
    }


def is_internal_domain(email: str | None) -> bool:
    """Check if an email address belongs to the internal company domain."""
    if not email:
        return False
    e = email.strip().lower()
    if "@" not in e:
        return False
    domain = e.rsplit("@", 1)[-1]
    internal_domains = ("metaforgeit.com",)
    return any(domain == d or domain.endswith("." + d) for d in internal_domains)


def derive_experience_level_from_text_or_years(exp_text: str | None, exp_level_raw: str | None) -> str | None:
    """
    Rule 4: Shared, client-agnostic experience-level classifier.
    Maps numeric experience to level consistently:
      >= 12 yrs -> Expert Level
      >= 8 yrs  -> Senior Level
      >= 5 yrs  -> Mid-Senior Level
      >= 2 yrs  -> Mid Level
      < 2 yrs   -> Junior Level / Entry Level
    Never contradicts a stated number. Returns None if no experience is stated.
    """
    text = f"{exp_text or ''} {exp_level_raw or ''}".strip().lower()
    if not text:
        return None

    m = re.search(r"(\d{1,2})\s*(?:-|to|–|—|\+)?\s*(\d{1,2})?", text)
    if m:
        try:
            val1 = int(m.group(1))
            val2 = int(m.group(2)) if m.group(2) else val1
            avg_yrs = (val1 + val2) / 2.0
            if avg_yrs >= 12:
                return "Expert Level"
            elif avg_yrs >= 8:
                return "Senior Level"
            elif avg_yrs >= 5:
                return "Mid-Senior Level"
            elif avg_yrs >= 2:
                return "Mid Level"
            else:
                return "Junior Level"
        except ValueError:
            pass

    if "expert" in text:
        return "Expert Level"
    elif "senior" in text or "lead" in text:
        return "Senior Level"
    elif "mid-senior" in text or "mid senior" in text:
        return "Mid-Senior Level"
    elif "mid" in text:
        return "Mid Level"
    elif "junior" in text or "entry" in text:
        return "Junior Level"

    return None


def _norm_work_mode(w: str | None, body_text: str = "") -> str | None:
    """
    Rule 5: Work mode classification based on actual wording.
    Phrasings like 'X days from office', 'X days RTO', 'hybrid' -> Hybrid
    'remote', 'work from home', 'wfh' -> Remote
    'on-site', 'onsite', 'in office', '100% office' -> On-site
    Returns None if not stated in text (no fabricated defaults!).
    """
    text = f"{w or ''} {body_text or ''}".lower()
    if not text.strip():
        return None

    if (
        re.search(r"\b[1-4]\s*days?\b", text)
        or re.search(r"\b[1-4]\s*days?\s*(?:work\s*)?(?:from\s*|in\s*|at\s*)?(?:office|site|rto)\b", text)
        or "hybrid" in text
        or "partially" in text
    ):
        return "Hybrid"

    if any(k in text for k in ("remote", "wfh", "work from home", "home based")):
        return "Remote"

    if any(
        k in text
        for k in (
            "on-site",
            "onsite",
            "on site",
            "in office",
            "client location",
            "100% office",
            "5 days office",
            "5 days from office",
            "all 5 days",
        )
    ):
        return "On-site"

    return None


def extract_min_max_experience(exp_text: str | None) -> tuple[int | None, int | None]:
    """Rule 3: Preserve experience ranges as min/max numbers."""
    if not exp_text:
        return None, None
    m = re.search(r"(\d{1,2})\s*(?:-|to|–|—)\s*(\d{1,2})", exp_text)
    if m:
        try:
            return int(m.group(1)), int(m.group(2))
        except ValueError:
            pass
    m_plus = re.search(r"(\d{1,2})\s*\+", exp_text)
    if m_plus:
        try:
            val = int(m_plus.group(1))
            return val, None
        except ValueError:
            pass
    m_single = re.search(r"\b(\d{1,2})\b", exp_text)
    if m_single:
        try:
            val = int(m_single.group(1))
            return val, val
        except ValueError:
            pass
    return None, None


def map_to_metaforge(
    extracted: dict[str, Any],
    *,
    ctx: EmailContext,
    client_display_name: str,
    job_id: str,
    client_jd_id: str,
    body_text: str = "",
    internal_poc_default: str = "offshore demands",
    jd_count: int = 1,
    demand_received_date: date | None = None,
    email_subject: str = "",
    email_body_plain: str = "",
    email_body_html: str = "",
    email_received_iso: str = "",
) -> dict[str, Any]:
    """
    Build the MetaForge-ready dict from one extracted requirement row, strictly adhering to Rules 1-10.
    """
    d = demand_received_date or date.today()
    demand_date_str = d.isoformat()

    # Rule 1: Headcount / Number of positions (None if not specified)
    n_pos = extracted.get("number_of_positions")
    n_int = None
    if n_pos is not None:
        try:
            n_int = int(n_pos)
        except (TypeError, ValueError):
            n_int = None

    fallback_mand, fallback_skills = _extract_skills_from_text(body_text)
    extracted_mand_list = _as_list(extracted.get("mandatory_skills"))
    extracted_soft_list = _as_list(extracted.get("soft_skills") or extracted.get("skills"))
    if not extracted_mand_list and fallback_mand:
        extracted_mand_list = _as_list(fallback_mand)
    if not extracted_soft_list and fallback_skills:
        extracted_soft_list = _as_list(fallback_skills)

    job_title = str(extracted.get("job_title") or "").strip() or None

    experience_raw = str(extracted.get("experience") or "").strip() or None
    exp_level = derive_experience_level_from_text_or_years(
        experience_raw, str(extracted.get("experience_level") or "")
    )

    requirement_from = (client_display_name or "").strip() or "Other"

    # Rule 6 & Rule 7: To/Cc vs POC and Domain-based check
    # client_poc must NEVER be assigned an internal company domain address
    client_poc = None
    client_lead_poc = None

    if ctx.from_email and not is_internal_domain(ctx.from_email):
        client_poc = ctx.from_email
        client_lead_poc = ctx.from_email

    if not client_poc and ctx.cc_emails:
        for cc in ctx.cc_emails:
            if cc and not is_internal_domain(cc):
                client_poc = cc
                client_lead_poc = cc
                break

    if not client_poc and ctx.to_emails:
        for to_addr in ctx.to_emails:
            if to_addr and not is_internal_domain(to_addr):
                client_poc = to_addr
                client_lead_poc = to_addr
                break

    to_join = ", ".join(ctx.to_emails) if ctx.to_emails else ""
    cc_join = ", ".join(ctx.cc_emails) if ctx.cc_emails else ""

    return format_metaforge_requirement(
        job_id=job_id,
        demand_received_date=demand_date_str,
        internal_poc=internal_poc_default,
        requirement_from=requirement_from,
        client_jd_id=client_jd_id,
        client_lead_poc=client_lead_poc or "",
        client_poc=client_poc or "",
        job_title=job_title or "",
        experience=experience_raw or "",
        location=_as_list(extracted.get("location"))[0] if _as_list(extracted.get("location")) else "",
        notice_period=extracted.get("notice_period") or "",
        number_of_positions=n_int,
        mandatory_skills=extracted_mand_list,
        skills=extracted_soft_list,
        body_text=body_text,
        extracted=extracted,
        email_subject=email_subject,
        email_body_plain=email_body_plain,
        email_body_html=email_body_html,
        email_received_iso=email_received_iso,
        email_to=to_join,
        email_cc=cc_join,
    )


def format_metaforge_requirement(
    *,
    job_id: str,
    demand_received_date: str,
    internal_poc: str,
    requirement_from: str,
    client_jd_id: str,
    client_lead_poc: str,
    client_poc: str,
    job_title: str,
    experience: str,
    location: str,
    notice_period: str,
    number_of_positions: int | None,
    mandatory_skills: list[str],
    skills: list[str],
    body_text: str,
    extracted: dict[str, Any],
    email_subject: str = "",
    email_body_plain: str = "",
    email_body_html: str = "",
    email_received_iso: str = "",
    email_to: str = "",
    email_cc: str = "",
) -> dict[str, Any]:
    """
    Format requirement into MetaForge dictionary payload with zero fabricated defaults.
    """
    # Rule 1 & Rule 3: Budget min/max and currency (None if not stated)
    budget_currency = None
    yearly_budget: int | None = None
    yearly_budget_min: int | None = None
    yearly_budget_max: int | None = None
    monthly_budget: int | None = None
    monthly_budget_min: int | None = None
    monthly_budget_max: int | None = None

    parsed_b = parse_budget_fields(str(extracted.get("budget") or body_text or ""))
    if extracted.get("yearly_budget_max") is not None or extracted.get("yearly_budget_min") is not None or parsed_b.get("budget_inr_lpa_max") is not None:
        budget_currency = str(parsed_b.get("budget_currency") or "INR")

    if extracted.get("yearly_budget_min") is not None:
        yearly_budget_min = int(extracted["yearly_budget_min"])
    elif parsed_b.get("budget_inr_lpa_min") is not None:
        yearly_budget_min = int(parsed_b["budget_inr_lpa_min"])

    if extracted.get("yearly_budget_max") is not None:
        yearly_budget_max = int(extracted["yearly_budget_max"])
    elif parsed_b.get("budget_inr_lpa_max") is not None:
        yearly_budget_max = int(parsed_b["budget_inr_lpa_max"])

    yearly_budget = yearly_budget_max if yearly_budget_max is not None else yearly_budget_min

    if extracted.get("monthly_budget_min") is not None:
        monthly_budget_min = int(extracted["monthly_budget_min"])
    elif parsed_b.get("budget_inr_lpm_min") is not None:
        monthly_budget_min = int(parsed_b["budget_inr_lpm_min"])

    if extracted.get("monthly_budget_max") is not None:
        monthly_budget_max = int(extracted["monthly_budget_max"])
    elif parsed_b.get("budget_inr_lpm_max") is not None:
        monthly_budget_max = int(parsed_b["budget_inr_lpm_max"])

    monthly_budget = monthly_budget_max if monthly_budget_max is not None else monthly_budget_min

    # Rule 4: Experience level alignment
    exp_level = derive_experience_level_from_text_or_years(
        experience, str(extracted.get("experience_level") or "")
    )
    exp_min, exp_max = extract_min_max_experience(experience)

    # Rule 1: Employment type (None if not stated)
    emp_type_raw = extracted.get("employment_type")
    employment_type = None
    if emp_type_raw:
        s_emp = str(emp_type_raw).strip().lower()
        if "full" in s_emp or "permanent" in s_emp:
            employment_type = "Full Time"
        elif "contract" in s_emp or "c2h" in s_emp:
            employment_type = "Contract"

    # Rule 5: Work mode classification
    work_mode = _norm_work_mode(extracted.get("work_mode"), body_text)

    # Rule 1: Priority (None if not stated)
    raw_p = extracted.get("priority")
    priority = None
    if raw_p and str(raw_p).strip().upper() in ("HIGH", "MEDIUM", "LOW"):
        priority = str(raw_p).strip().upper()
    elif "high priority" in body_text.lower() or "urgent" in body_text.lower() or "p1" in body_text.lower():
        priority = "HIGH"
    elif "medium priority" in body_text.lower() or "p2" in body_text.lower():
        priority = "MEDIUM"
    elif "low priority" in body_text.lower() or "p3" in body_text.lower():
        priority = "LOW"

    # Demand type
    demand_type = "single"
    if number_of_positions is not None:
        if number_of_positions >= 10:
            demand_type = "bulk"
        elif number_of_positions >= 2:
            demand_type = "multiple"

    raw_st = (extracted.get("job_status") or extracted.get("raw_status") or "").strip().lower()
    if raw_st in ("hold", "on hold", "kindly hold", "paused", "pause"):
        job_status = "hold"
    elif raw_st in ("closed", "close", "cancel", "cancelled", "filled"):
        job_status = "closed"
    elif raw_st in ("reopen", "re-open", "resumed", "resume", "active"):
        job_status = "open"
    elif not raw_st or raw_st in ("none", "null"):
        from status_tracker import detect_status_keyword
        status_kw = detect_status_keyword(email_subject, body_text)
        job_status = status_kw if status_kw else "open"
    else:
        job_status = raw_st

    result: dict[str, Any] = {
        "pipeline_extracted": True,
        "job_id": job_id,
        "demand_received_date": demand_received_date,
        "internal_poc": internal_poc,
        "requirement_from": requirement_from,
        "client_jd_id": client_jd_id,
        "client_lead_poc": client_lead_poc,
        "client_poc": client_poc,
        "job_title": job_title or None,
        "job_status": job_status,
        "confidence": float(extracted.get("confidence") or 1.0),
        "closed_date": None,
        "type_of_demand": demand_type,
        "priority": priority,
        "number_of_positions": number_of_positions,
        "experience_level": exp_level,
        "employment_type": employment_type,
        "budget_currency": budget_currency,
        "yearly_budget": yearly_budget,
        "yearly_budget_min": yearly_budget_min,
        "yearly_budget_max": yearly_budget_max,
        "monthly_budget": monthly_budget,
        "monthly_budget_min": monthly_budget_min,
        "monthly_budget_max": monthly_budget_max,
        "work_mode": work_mode,
        "location": location or None,
        "overall_experience": experience or None,
        "overall_experience_min": exp_min,
        "overall_experience_max": exp_max,
        "notice_period": notice_period or None,
        "mandatory_skills": mandatory_skills,
        "skills": skills,
    }

    subj = str(email_subject or "").strip()
    if subj:
        result["subject"] = subj
    plain_arc = str(email_body_plain or "").strip()
    html_arc = str(email_body_html or "").strip()
    if plain_arc:
        result["bodyText"] = plain_arc
    elif str(body_text or "").strip():
        result["bodyText"] = str(body_text).strip()
    if html_arc:
        result["bodyHtml"] = html_arc
    rdt = str(email_received_iso or "").strip()
    if rdt:
        result["receivedDateTime"] = rdt
    fe = str(client_lead_poc or "").strip()
    if fe:
        result["from"] = fe
    tos = str(email_to or "").strip()
    if tos:
        result["to"] = tos
    ccs = str(email_cc or "").strip()
    if ccs:
        result["cc"] = ccs
    if extracted.get("processing_note"):
        result["processing_note"] = extracted["processing_note"]
    if extracted.get("reconciliation_status"):
        result["reconciliation_status"] = extracted["reconciliation_status"]

    return result

