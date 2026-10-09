"""
Typed contracts for AI parser output.
Priority 3 — Strict Schema & Evidence Rules.
"""

from __future__ import annotations

from enum import Enum
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from glossary import TermGlossary


class ExtractionMethodEnum(str, Enum):
    REGEX = "regex"
    AI = "ai"
    AI_SEMANTIC = "ai_semantic"
    HYBRID_REGEX_AI = "hybrid_regex_ai"
    REGEX_ANCHOR = "regex_anchor"
    NOT_FOUND = "not_found"


class EmploymentType(str, Enum):
    FULL_TIME = "Full-time"
    CONTRACT = "Contract"
    UNKNOWN = "Unknown"


class ExperienceLevel(str, Enum):
    ENTRY = "Entry Level"
    JUNIOR = "Junior Level"
    MID = "Mid Level"
    MID_SENIOR = "Mid-Senior Level"
    SENIOR = "Senior Level"
    EXPERT = "Expert Level"
    UNKNOWN = "Unknown"


class WorkMode(str, Enum):
    ON_SITE = "On-site"
    REMOTE = "Remote"
    HYBRID = "Hybrid"
    UNKNOWN = "Unknown"


class Priority(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "unknown"


class RequirementItem(BaseModel):
    """Single extracted requirement from one email with strict schema enforcement."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    job_title: str | None = None
    number_of_positions: int | None = Field(default=None, ge=1)
    experience_level: ExperienceLevel | None = None
    employment_type: EmploymentType | None = None
    work_mode: WorkMode | None = None
    location: list[str] | None = None
    yearly_budget_min: int | None = Field(default=None, ge=0)
    yearly_budget_max: int | None = Field(default=None, ge=0)
    monthly_budget_min: int | None = Field(default=None, ge=0)
    monthly_budget_max: int | None = Field(default=None, ge=0)
    mandatory_skills: list[str] | None = None
    soft_skills: list[str] | None = Field(default=None, alias="skills")

    # Legacy & metadata fields
    req_id: str | None = None
    raw_status: str | None = None
    budget: str | None = None
    experience: str | None = None
    overall_experience: str | None = None
    notice_period: str | None = None
    engagement_type: str | None = None
    contract_duration: str | None = None
    priority: Priority | None = None
    client_name: str | None = None
    confidence: float = Field(default=1.0, ge=0, le=1)

    field_confidence: dict[str, float] = Field(default_factory=dict)
    field_sources: dict[str, str] = Field(default_factory=dict)
    field_evidence_quotes: dict[str, str] = Field(default_factory=dict)
    field_extraction_method: dict[str, ExtractionMethodEnum] = Field(default_factory=dict)

    @field_validator("job_title", mode="before")
    @classmethod
    def clean_title(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text if text else None

    @field_validator(
        "experience",
        "notice_period",
        "client_name",
        "engagement_type",
        "contract_duration",
        "budget",
        "overall_experience",
        mode="before",
    )
    @classmethod
    def coerce_optional_strings(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if not text or text.lower() in {"none", "null", "n/a", "not provided"}:
            return None
        return text

    @field_validator("location", "mandatory_skills", "soft_skills", mode="before")
    @classmethod
    def normalize_list_fields(cls, value: object) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, list):
            res = [str(v).strip() for v in value if str(v).strip()]
            return res if res else None
        text = str(value).strip()
        if not text or text.lower() in {"none", "null", "n/a"}:
            return None
        parts = re.split(r"[,\n;/|]+", text)
        res = [p.strip() for p in parts if p.strip()]
        return res if res else None

    @field_validator("employment_type", mode="before")
    @classmethod
    def normalize_employment_type(cls, value: object) -> str | None:
        if value is None:
            return None
        s = str(value).strip().lower()
        if not s or s in {"none", "null", "n/a", "unknown"}:
            return None
        res = TermGlossary.normalize_employment_type(s)
        if res == "Full-time":
            return EmploymentType.FULL_TIME.value
        if res == "Contract":
            return EmploymentType.CONTRACT.value
        return None

    @field_validator("work_mode", mode="before")
    @classmethod
    def normalize_work_mode(cls, value: object) -> str | None:
        if value is None:
            return None
        s = str(value).strip().lower()
        if not s or s in {"none", "null", "n/a", "unknown"}:
            return None
        res = TermGlossary.normalize_work_mode(s)
        if res == "On-site":
            return WorkMode.ON_SITE.value
        if res == "Remote":
            return WorkMode.REMOTE.value
        if res == "Hybrid":
            return WorkMode.HYBRID.value
        return None

    @field_validator("experience_level", mode="before")
    @classmethod
    def normalize_experience_level(cls, value: object) -> str | None:
        if value is None:
            return None
        s = str(value).strip().lower()
        if not s or s in {"none", "null", "n/a", "unknown"}:
            return None
        if s in {"entry", "entry level", "junior", "fresher", "junior level"}:
            return ExperienceLevel.ENTRY.value
        if s in {"mid", "mid level", "intermediate"}:
            return ExperienceLevel.MID.value
        if s in {"mid-senior", "mid senior", "mid-senior level"}:
            return ExperienceLevel.MID_SENIOR.value
        if s in {"senior", "senior level"}:
            return ExperienceLevel.SENIOR.value
        if s in {"expert", "expert level", "lead", "principal"}:
            return ExperienceLevel.EXPERT.value
        return None

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: object) -> str | None:
        if value is None:
            return None
        s = str(value).strip().upper()
        if not s or s in {"NONE", "NULL", "N/A", "UNKNOWN"}:
            return None
        if "HIGH" in s:
            return Priority.HIGH.value
        if "MEDIUM" in s:
            return Priority.MEDIUM.value
        if "LOW" in s:
            return Priority.LOW.value
        return None

    @field_validator(
        "yearly_budget_min",
        "yearly_budget_max",
        "monthly_budget_min",
        "monthly_budget_max",
        mode="before",
    )
    @classmethod
    def parse_budget_lakh_to_int(cls, value: object) -> int | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return int(value)
        text = str(value).strip().lower()
        if not text or text in {"none", "null", "n/a"}:
            return None
        m = re.search(r"(\d+(?:\.\d+)?)", text)
        if not m:
            return None
        n = float(m.group(1))
        if "lakh" in text or "lpa" in text:
            return int(n * 100000)
        return int(n)

    @field_validator("field_confidence", mode="before")
    @classmethod
    def normalize_field_confidence(cls, value: object) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, float] = {}
        for k, v in value.items():
            try:
                out[str(k)] = max(0.0, min(1.0, float(v)))
            except (TypeError, ValueError):
                continue
        return out

    @field_validator("field_sources", mode="before")
    @classmethod
    def normalize_field_sources(cls, value: object) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, str] = {}
        for k, v in value.items():
            key = str(k or "").strip()
            val = str(v or "").strip()
            if key and val:
                out[key] = val
        return out

    @field_validator("field_evidence_quotes", mode="before")
    @classmethod
    def normalize_field_evidence_quotes(cls, value: object) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, str] = {}
        for k, v in value.items():
            key = str(k or "").strip()
            val = str(v or "").strip()
            if key:
                out[key] = val
        return out

    @field_validator("field_extraction_method", mode="before")
    @classmethod
    def validate_field_extraction_method(cls, value: object) -> dict[str, ExtractionMethodEnum]:
        if not isinstance(value, dict):
            return {}
        out: dict[str, ExtractionMethodEnum] = {}
        allowed = {e.value for e in ExtractionMethodEnum}
        for k, v in value.items():
            key = str(k or "").strip()
            val = str(v or "").strip().lower()
            if not val:
                continue
            if val not in allowed:
                raise ValueError(
                    f"Invalid extraction method '{v}' for field '{k}'. "
                    f"Allowed values are: {sorted(list(allowed))}"
                )
            out[key] = ExtractionMethodEnum(val)
        return out


class RequirementParseResult(BaseModel):
    """Validated parser response envelope with extra='forbid'."""

    model_config = ConfigDict(extra="forbid")

    requirements: list[RequirementItem] = Field(default_factory=list)
    overall_confidence: float = Field(default=0.0, ge=0, le=1)
    multi_requirement_note: str | None = None
    is_multi_role: bool = False
    processing_note: str | None = None


class DashboardRequirement24(BaseModel):
    """Strict 24-field schema for dashboard payload."""

    model_config = ConfigDict(extra="forbid")

    job_id: str
    demand_received_date: str | None = None
    internal_poc_email: str | None = None
    internal_poc: str | None = None
    sla: str | None = None
    requirement_from: str
    client_jd_id: str
    client_lead_poc_email: str | None = None
    client_poc_emails: str | None = None
    job_title: str | None = None
    job_status: str = "open"
    closed_date: str | None = None
    type_of_demand: Literal["single", "multiple", "bulk"] = "single"
    priority: Literal["high", "medium", "low", "unknown"] = "unknown"
    number_of_positions: int | None = Field(default=None, ge=1)
    experience_level: str | None = None
    employment_type: str | None = None
    budget_currency: Literal["INR", "USD", "EUR"] | None = None
    yearly_budget: int | str | None = Field(default=None)
    monthly_budget: int | str | None = Field(default=None)
    work_mode: str | None = None
    location: str | None = None
    overall_experience: str | None = None
    notice_period: str | None = None
    mandatory_skills: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)


def to_strict_json_schema(model_cls: type[BaseModel]) -> dict[str, Any]:
    """
    Generate an OpenAI Strict Structured Outputs JSON schema from a Pydantic model.
    - Sets additionalProperties: False on all objects.
    - Ensures required includes all properties for every object.
    - Recursively processes $defs/definitions.
    """
    schema = model_cls.model_json_schema()
    return _make_schema_strict(schema)


def _make_schema_strict(schema: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(schema, dict):
        return schema

    s = dict(schema)

    if "$defs" in s and isinstance(s["$defs"], dict):
        s["$defs"] = {k: _make_schema_strict(v) for k, v in s["$defs"].items()}
    if "definitions" in s and isinstance(s["definitions"], dict):
        s["definitions"] = {k: _make_schema_strict(v) for k, v in s["definitions"].items()}

    if s.get("type") == "object" or "properties" in s:
        s["type"] = "object"
        s["additionalProperties"] = False
        props = s.get("properties", {})
        s["properties"] = {k: _make_schema_strict(v) for k, v in props.items()}
        s["required"] = list(props.keys())

    if s.get("type") == "array" and "items" in s:
        if isinstance(s["items"], dict):
            s["items"] = _make_schema_strict(s["items"])

    for key in ("anyOf", "oneOf", "allOf"):
        if key in s and isinstance(s[key], list):
            s[key] = [_make_schema_strict(v) for v in s[key]]

    return s


def verify_evidence_quotes(
    item: RequirementItem,
    raw_text: str,
) -> RequirementItem:
    """
    Post-extraction evidence verification.
    Verifies that quotes in `field_evidence_quotes` actually exist in `raw_text`.
    If an evidence quote is hallucinated/not found in raw_text:
    - Clears the unverified evidence quote
    - Penalizes field confidence
    - Flags the field source as 'unverified_ai'
    """
    if not raw_text:
        return item

    norm_raw = re.sub(r"\s+", " ", raw_text.lower()).strip()

    evidence_quotes = dict(item.field_evidence_quotes or {})
    confidence_map = dict(item.field_confidence or {})
    sources_map = dict(item.field_sources or {})
    method_map = dict(item.field_extraction_method or {})

    for field, quote in list(evidence_quotes.items()):
        if not quote or str(quote).strip() == "":
            continue

        norm_quote = re.sub(r"\s+", " ", str(quote).lower()).strip()

        # Exact match or normalized substring match
        if norm_quote in norm_raw:
            continue

        # Partial token match for multi-word quotes
        words = norm_quote.split()
        if len(words) >= 3:
            snippet = " ".join(words[:min(10, len(words))])
            if snippet in norm_raw:
                continue

        # Hallucinated / unverified evidence quote
        evidence_quotes[field] = ""
        if field in confidence_map:
            confidence_map[field] = round(max(0.0, float(confidence_map[field]) * 0.5), 2)
        if sources_map.get(field) not in {"not_found", "unverified_ai"}:
            sources_map[field] = "unverified_ai"

    item.field_evidence_quotes = evidence_quotes
    item.field_confidence = confidence_map
    item.field_sources = sources_map
    item.field_extraction_method = method_map
    return item

