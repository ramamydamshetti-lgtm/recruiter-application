/** Matches internal MetaForge requirement codes (e.g. REQ-092, REQ-2026-02-19-001). */
const INTERNAL_REQUIREMENT_ID_RE = /^REQ-[A-Z0-9][\w-]*$/i;

export function isInternalRequirementId(value: string | null | undefined): boolean {
  const v = String(value ?? '').trim();
  return v.length > 0 && INTERNAL_REQUIREMENT_ID_RE.test(v);
}

/** Strip internal requirement IDs from values shown in client trackers and emails. */
export function sanitizeClientFacingCellValue(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  return isInternalRequirementId(v) ? '' : v;
}

/** Like sanitizeClientFacingCellValue but keeps leading/trailing spaces while editing. */
export function filterInternalRequirementIdFromCell(value: string | null | undefined): string {
  const raw = String(value ?? '');
  const trimmed = raw.trim();
  if (trimmed && isInternalRequirementId(trimmed)) return '';
  return raw;
}
