export type SubmissionDatePreset =
  | ''
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

export const SUBMISSION_DATE_PRESET_OPTIONS: Array<{ value: SubmissionDatePreset; label: string }> =
  [
    { value: '', label: 'All dates' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7', label: 'Last 7 Days' },
    { value: 'thisWeek', label: 'This Week' },
    { value: 'lastWeek', label: 'Last Week' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'thisYear', label: 'This Year' },
    { value: 'custom', label: 'Custom Range' },
  ];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function resolveSubmissionDateRange(
  preset: SubmissionDatePreset,
  customStart?: string,
  customEnd?: string,
): { start: Date; end: Date } | null {
  const now = new Date();
  if (!preset) return null;

  if (preset === 'custom') {
    const startRaw = customStart?.trim();
    const endRaw = customEnd?.trim();
    if (!startRaw && !endRaw) return null;
    const start = startRaw ? startOfDay(new Date(`${startRaw}T00:00:00`)) : new Date(0);
    const end = endRaw ? endOfDay(new Date(`${endRaw}T00:00:00`)) : endOfDay(now);
    return { start, end };
  }

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  switch (preset) {
    case 'today':
      return { start: todayStart, end: todayEnd };
    case 'yesterday': {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'last7': {
      const s = new Date(todayStart);
      s.setDate(s.getDate() - 6);
      return { start: s, end: todayEnd };
    }
    case 'thisWeek':
      return { start: startOfWeek(now), end: todayEnd };
    case 'lastWeek': {
      const thisWeekStart = startOfWeek(now);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setMilliseconds(-1);
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      return { start: lastWeekStart, end: lastWeekEnd };
    }
    case 'thisMonth': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(s), end: todayEnd };
    }
    case 'lastMonth': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(s), end: endOfDay(e) };
    }
    case 'thisYear': {
      const s = new Date(now.getFullYear(), 0, 1);
      return { start: startOfDay(s), end: todayEnd };
    }
    default:
      return null;
  }
}

export function submissionDateInRange(
  submittedOnIso: string,
  range: { start: Date; end: Date } | null,
): boolean {
  if (!range) return true;
  const t = new Date(submittedOnIso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= range.start.getTime() && t <= range.end.getTime();
}
