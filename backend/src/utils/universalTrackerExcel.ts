export const UNIVERSAL_TRACKER_HEADERS = [
  'Sl.No',
  'Vendor Name',
  'Position / Title',
  'Skill',
  'Resume Sent Date (DDMMYY)',
  'Full Name',
  'Last Full Time Qualification',
  'Mobile No',
  'Mail ID',
  'NP (Days)',
  'Total Exp',
  'Relevant Exp',
  'Current Location',
  'Job Location',
  'Current Organization',
  'Current CTC',
  'Expected CTC',
  'Rate per Month',
] as const;

export type UniversalTrackerHeader = (typeof UNIVERSAL_TRACKER_HEADERS)[number];

export type UniversalTrackerRow = Record<UniversalTrackerHeader, string>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseUniversalTrackerRows(raw: unknown): UniversalTrackerRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: UniversalTrackerRow[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const row = {} as UniversalTrackerRow;
    for (const h of UNIVERSAL_TRACKER_HEADERS) {
      const v = item[h];
      row[h] = v == null ? '' : String(v).trim();
    }
    out.push(row);
  }
  return out;
}
