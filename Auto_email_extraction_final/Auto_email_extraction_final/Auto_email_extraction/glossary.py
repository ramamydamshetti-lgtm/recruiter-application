"""
Centralized Term Glossary & Canonical Field Normalizer.
Only maps terms/acronyms present in source text; never infers missing values.
"""

from __future__ import annotations

from typing import Any

# Canonical Field Name Alias Mapping
FIELD_ALIASES: dict[str, str] = {
    # Notice Period
    "np": "notice_period",
    "notice": "notice_period",
    "notice period": "notice_period",
    "joining time": "notice_period",
    "join time": "notice_period",
    "buyout": "notice_period",

    # Experience / YOE
    "yoe": "experience",
    "exp": "experience",
    "experience": "experience",
    "overall exp": "experience",
    "overall experience": "experience",
    "years of experience": "experience",

    # Work Mode
    "wfh": "work_mode",
    "work mode": "work_mode",
    "work from home": "work_mode",
    "onsite": "work_mode",
    "on site": "work_mode",
    "hybrid": "work_mode",
    "remote": "work_mode",

    # Employment Type
    "c2h": "employment_type",
    "c2c": "employment_type",
    "fte": "employment_type",
    "full time": "employment_type",
    "full-time": "employment_type",
    "contract": "employment_type",
    "subcon": "employment_type",

    # Budget / CTC
    "ctc": "budget",
    "lpa": "budget",
    "budget": "budget",
    "pay rate": "budget",
    "hourly rate": "budget",
    "bill rate": "budget",

    # Skills
    "primary skills": "mandatory_skills",
    "must have": "mandatory_skills",
    "mandatory skills": "mandatory_skills",
    "secondary skills": "soft_skills",
    "nice to have": "soft_skills",
    "preferred skills": "soft_skills",
    "soft skills": "soft_skills",
}

# Canonical Value Mappings for Value Normalization
WORK_MODE_MAP: dict[str, str] = {
    "wfh": "Remote",
    "work from home": "Remote",
    "remote": "Remote",
    "onsite": "On-site",
    "on site": "On-site",
    "office": "On-site",
    "hybrid": "Hybrid",
}

EMPLOYMENT_TYPE_MAP: dict[str, str] = {
    "c2h": "Contract",
    "c2c": "Contract",
    "contract": "Contract",
    "contractor": "Contract",
    "subcon": "Contract",
    "fte": "Full-time",
    "full time": "Full-time",
    "full-time": "Full-time",
    "permanent": "Full-time",
}

BUDGET_UNIT_MAP: dict[str, str] = {
    "lpa": "LPA",
    "lakh": "LPA",
    "lakhs": "LPA",
    "inr": "INR",
    "usd": "USD",
    "eur": "EUR",
    "per month": "Monthly",
    "pm": "Monthly",
}


class TermGlossary:
    """Centralized glossary manager for canonical term mapping."""

    @staticmethod
    def get_canonical_field(term: str) -> str | None:
        """Map raw term/alias to canonical field name if present."""
        if not term:
            return None
        return FIELD_ALIASES.get(term.strip().lower())

    @staticmethod
    def normalize_work_mode(value: str | None) -> str | None:
        """Map raw work mode term to canonical value if present; otherwise return None."""
        if not value or not str(value).strip():
            return None
        val_str = str(value).strip().lower()
        import re
        # "N days from office" / "N days in office" where N is 1 to 4 is HYBRID
        if re.search(r"\b[1-4]\s*days?\b", val_str) or re.search(r"\b[1-4]\s*days?\s*(?:work\s*)?(?:from\s*|in\s*|at\s*)?office\b", val_str):
            return "Hybrid"
        if "hybrid" in val_str or "partially" in val_str:
            return "Hybrid"
        if "5 days" in val_str or "fully on-site" in val_str or "onsite" in val_str or "on site" in val_str:
            return "On-site"
        if "wfh" in val_str or "remote" in val_str or "work from home" in val_str:
            return "Remote"
        return WORK_MODE_MAP.get(val_str)

    @staticmethod
    def normalize_employment_type(value: str | None) -> str | None:
        """Map raw employment type term to canonical value if present; otherwise return None."""
        if not value or not str(value).strip():
            return None
        return EMPLOYMENT_TYPE_MAP.get(str(value).strip().lower())

    @staticmethod
    def normalize_budget_unit(value: str | None) -> str | None:
        """Map raw budget string to canonical currency/unit if present; otherwise return None."""
        if not value or not str(value).strip():
            return None
        val_lower = str(value).strip().lower()
        for k, unit in BUDGET_UNIT_MAP.items():
            if k in val_lower:
                return unit
        return None

    @classmethod
    def get_prompt_supplement(cls) -> str:
        """
        Generate additive glossary instructions for LLM extraction prompt.
        """
        field_to_aliases: dict[str, list[str]] = {}
        for alias, field in FIELD_ALIASES.items():
            field_to_aliases.setdefault(field, []).append(alias)

        lines = ["Additional recognized terminology (may overlap with terms above):"]
        for field, aliases in field_to_aliases.items():
            alias_str = ", ".join(aliases)
            lines.append(f"- {field}: {alias_str}")
        return "\n".join(lines)

