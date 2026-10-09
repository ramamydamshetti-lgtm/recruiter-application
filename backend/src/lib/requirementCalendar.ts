/**
 * Calendar-day boundaries for requirement email ingestion (Graph fetch, DB filters,
 * REQ-YYYY-MM-DD IDs, dedupe). Defaults to Asia/Kolkata; override REQUIREMENT_CALENDAR_TZ.
 */

export function getRequirementCalendarTz(): string {
  const tz = (
    process.env.REQUIREMENT_CALENDAR_TZ ||
    process.env.REQUIREMENT_EMAIL_CALENDAR_TZ ||
    'Asia/Kolkata'
  ).trim();
  return tz || 'Asia/Kolkata';
}

/** YYYY-MM-DD for instant `d` in IANA `timeZone`. */
export function calendarDateInTimeZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

/** Next civil calendar day as YYYY-MM-DD (UTC date arithmetic on components). */
export function addCalendarDayYmd(ymd: string): string {
  const parts = ymd.split('-').map((x) => parseInt(x, 10));
  const y = parts[0] ?? 1970;
  const mo = parts[1] ?? 1;
  const da = parts[2] ?? 1;
  const next = new Date(Date.UTC(y, mo - 1, da + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * First UTC instant when civil date `ymd` (YYYY-MM-DD) begins in `timeZone`.
 */
export function startOfZonedCalendarDay(ymd: string, timeZone: string): Date {
  const parts = ymd.split('-').map((x) => parseInt(x, 10));
  const y = parts[0] ?? 1970;
  const mo = parts[1] ?? 1;
  const da = parts[2] ?? 1;
  let lo = Date.UTC(y, mo - 1, da - 1, 0, 0, 0);
  let hi = Date.UTC(y, mo - 1, da + 2, 0, 0, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midCal = calendarDateInTimeZone(new Date(mid), timeZone);
    if (midCal < ymd) lo = mid + 1;
    else hi = mid;
  }
  return new Date(lo);
}

export function zonedCalendarDayRangeForInstant(
  anchor: Date,
  timeZone: string,
): { start: Date; end: Date; ymd: string } {
  const ymd = calendarDateInTimeZone(anchor, timeZone);
  const start = startOfZonedCalendarDay(ymd, timeZone);
  const nextYmd = addCalendarDayYmd(ymd);
  const end = startOfZonedCalendarDay(nextYmd, timeZone);
  return { start, end, ymd };
}
