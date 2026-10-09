"""
AI Few-Shot Prompt Supplement Generator (Part B3).
Provides per-client few-shot examples (e.g. LTTS, Accenture) and generic status rules
for AI parsing and classification.
Designed so adding new per-client examples requires zero restructuring.
"""

from __future__ import annotations

_CLIENT_FEW_SHOT_EXAMPLES: dict[str, str] = {
    "LTTS": """
--- CLIENT FEW-SHOT EXAMPLES: LTTS ---
Example 1 (Hold Request):
Email Subject: RE: Requirement for Java Lead (REQ-10293) - HOLD
Email Body: Hi team, please put requirement REQ-10293 on hold until further notice. Stop profile submissions immediately.
Extracted Status:
- raw_status: "Hold"
- job_status: "hold"
- req_id: "REQ-10293"

Example 2 (Reopen Request):
Email Subject: RE: Requirement for Java Lead (REQ-10293) - REOPEN
Email Body: Hi team, we are reopening requirement REQ-10293. Please resume sharing candidate profiles.
Extracted Status:
- raw_status: "Reopen"
- job_status: "open"
- req_id: "REQ-10293"
""",
    "Accenture": """
--- CLIENT FEW-SHOT EXAMPLES: ACCENTURE ---
Example 1 (Daily Snapshot Table with Hold Status):
Email Subject: Accenture Daily Open Requirements Snapshot - 29 Sep 2026
Email Body:
Req ID | Role Title | Location | Status
ACC-88391 | Python Developer | Remote | Active
ACC-77210 | DevOps Engineer | Bangalore | Hold
Extracted Requirements:
- Req ID ACC-88391 -> job_status: "open", raw_status: "Active"
- Req ID ACC-77210 -> job_status: "hold", raw_status: "Hold"

Example 2 (Daily Snapshot Table Reappearance after Multi-day Gap):
Email Subject: Accenture Daily Open Requirements Snapshot - 05 Oct 2026
Email Body:
Req ID | Role Title | Location | Status
ACC-77210 | DevOps Engineer | Bangalore | Active
Extracted Requirements:
- Req ID ACC-77210 (reappeared after gap) -> job_status: "open", raw_status: "Active" (reopened/active update)
""",
}


def get_prompt_supplement(client_name: str | None = None) -> str:
    """
    Generate prompt supplement for AI parser/classifier.
    Provides universal requirement status lifecycle rules and multi-client few-shot examples
    applicable to ALL allowlisted clients (Accenture, KPMG, Deloitte, LTTS, ITC Infotech, PwC, etc.).
    """
    general_guidance = """
--- UNIVERSAL REQUIREMENT STATUS LIFECYCLE GUIDANCE ---
1. Status Default: Requirements default to status "Open" unless explicit hold, closed, or reopen keywords appear.
2. Hold Signals: Words/phrases like "on hold", "kindly hold", "don't work", "dont work", "pause requirement", "stop sourcing", "stop profile submissions", or status column "Hold".
3. Closed Signals: Words/phrases like "closed", "cancel", "cancelled", "position filled", "requirement closed", or status column "Closed".
4. Reopen Signals: Words/phrases like "reopen", "re-open", "resume requirement", "resume sourcing", "active again", or status column "Active"/"Open".
5. Universal Client Rule: Status lifecycle tracking applies identically across ALL clients (Accenture, KPMG, Deloitte, LTTS, ITC Infotech, PwC, IDexcel, etc.). When a Req ID is present, status changes update the existing requirement record regardless of time gaps or prior status.
"""

    cname = (client_name or "").strip()
    all_examples = "\n\n".join(_CLIENT_FEW_SHOT_EXAMPLES.values())
    return f"{general_guidance}\n{all_examples}"
