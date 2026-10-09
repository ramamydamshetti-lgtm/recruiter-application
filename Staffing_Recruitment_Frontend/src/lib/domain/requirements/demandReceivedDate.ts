/** Demand received date may be today or up to this many prior calendar days. */
export const DEMAND_RECEIVED_MAX_PAST_DAYS = 2;

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Min/max YYYY-MM-DD for `<input type="date">` in the user's local calendar. */
export function getDemandReceivedDateBounds(
  maxPastDays = DEMAND_RECEIVED_MAX_PAST_DAYS,
  anchor = new Date(),
): { min: string; max: string } {
  const today = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() - maxPastDays);
  return { min: formatLocalYmd(minDate), max: formatLocalYmd(today) };
}

export function isDemandReceivedDateAllowed(
  value: string,
  maxPastDays = DEMAND_RECEIVED_MAX_PAST_DAYS,
  anchor = new Date(),
): boolean {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const { min, max } = getDemandReceivedDateBounds(maxPastDays, anchor);
  return trimmed >= min && trimmed <= max;
}

export const DEMAND_RECEIVED_DATE_ERROR =
  'Demand Received Date must be today or within the previous 2 days.';
