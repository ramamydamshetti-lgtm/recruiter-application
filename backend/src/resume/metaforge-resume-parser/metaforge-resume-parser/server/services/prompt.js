const TODAY = new Date().toISOString().slice(0, 10);

export const EXTRACTION_PROMPT = `You are a world-class resume parsing engine for Metaforge IT Solutions.
Extract the fields below. Follow STRICT SOURCE RULES per field.

FIELD 1 — full_name: Candidate name from top of resume.
FIELD 2 — contact: All phone numbers. Format: +[CC] [local] with ONE space after country code. Multiple → join with " / ".
FIELD 3 — email: Primary email address.
FIELD 4 — linkedin: LinkedIn URL/handle or null.
FIELD 5 — qualification: SINGLE highest degree from Education section only. Format: "Degree, Field — Institution (Year)".

FIELD 6 — TOTAL EXPERIENCE (all professional work):
  • From Work Experience / Employment History — parse start & end month+year for EVERY role.
  • "Present"/"Current" = today (${TODAY}).
  • Merge overlapping periods; do not double-count.
  • Include all paid professional roles (full-time, part-time, contract, internship if listed under work).
  • Exclude education/training periods only.

FIELD 6b — work_periods: ALL employment date ranges. Format per item: {"from":"YYYY-MM","to":"YYYY-MM"|"present","title":"Job Title"}. Return [] if none.

FIELD 6c — RELEVANT EXPERIENCE (domain-specific):
  • Sum only roles RELEVANT to the candidate's primary field (header designation, technology stack, or core profession).
  • INCLUDE: IT, software, data, engineering, SAP, cloud, same-domain consulting roles aligned with their profile.
  • EXCLUDE: unrelated jobs (retail, delivery, unrelated admin) unless no IT/domain roles exist.
  • Use same date-merge rules as total experience.

FIELD 6d — relevant_work_periods: Subset of work_periods that are domain-relevant. Same JSON format. Return [] if none.

FIELD 7 — skills: ONLY from dedicated Skills/Technical Skills/Core Skills section. NOT from summary or work exp.
FIELD 8 — technology: ONLY from header designation line (split on | / ·) OR Professional Summary opening. 1–5 items, Title Case.

RULES: Extract only explicit content. Deduplicate. null for missing strings, [] for arrays.
Do NOT output total_experience or relevant_experience as strings — server calculates from work_periods.
OUTPUT: Single valid JSON only. No markdown.
{"full_name":null,"contact":null,"email":null,"linkedin":null,"qualification":null,"work_periods":[],"relevant_work_periods":[],"skills":[],"technology":[]}`;

export function buildTextPrompt(resumeText) {
  return `${EXTRACTION_PROMPT}\n\n${"=".repeat(40)}\nRESUME\n${"=".repeat(40)}\n${resumeText}`;
}
