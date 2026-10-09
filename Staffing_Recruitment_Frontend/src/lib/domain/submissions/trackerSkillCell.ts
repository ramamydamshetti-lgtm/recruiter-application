/** Plain comma-separated skills text for all client submission trackers. */
export function formatTrackerSkillsPlain(skills: string | string[] | null | undefined): string {
  if (Array.isArray(skills)) {
    return skills.map((s) => String(s).trim()).filter(Boolean).join(', ');
  }
  const raw = String(skills ?? '').trim();
  if (!raw) return '';
  return raw
    .split(/[,;|/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}
