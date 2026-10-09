/** Matches internal MetaForge requirement codes (e.g. REQ-092, REQ-2026-02-19-001). */
const INTERNAL_REQUIREMENT_ID_RE = /^REQ-[A-Z0-9][\w-]*$/i;

export function isInternalRequirementId(value: string | null | undefined): boolean {
  const v = String(value ?? '').trim();
  return v.length > 0 && INTERNAL_REQUIREMENT_ID_RE.test(v);
}

export function sanitizeClientFacingCellValue(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  if (!v) return '';
  return isInternalRequirementId(v) ? '' : v;
}

/** Strip inline HTML tags/styles that may arrive from paste or rich-text sources. */
export function stripTrackerCellHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
