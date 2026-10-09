/**
 * Date filtering and grouping for reports.
 * Outputs buckets compatible with charts and time-series.
 */

import type { ReportPeriodType } from './types';

export function isDateInRange(isoDate: string, startDate: string, endDate: string): boolean {
  const d = new Date(isoDate);
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
}

export function getBucketKey(isoDate: string, periodType: ReportPeriodType): string {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();

  switch (periodType) {
    case 'day':
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    case 'week': {
      const startOfWeek = new Date(d);
      const dow = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - dow + (dow === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      const wy = startOfWeek.getFullYear();
      const wm = startOfWeek.getMonth() + 1;
      const wd = startOfWeek.getDate();
      return `W ${wy}-${String(wm).padStart(2, '0')}-${String(wd).padStart(2, '0')}`;
    }
    case 'month':
      return `${y}-${String(m).padStart(2, '0')}`;
    case 'year':
      return String(y);
    default:
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}

/** Generate all bucket labels between start and end for the given period. */
export function getBucketLabelsBetween(
  startDate: string,
  endDate: string,
  periodType: ReportPeriodType,
): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const labels: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    labels.push(getBucketKey(cursor.toISOString(), periodType));
    switch (periodType) {
      case 'day':
        cursor.setDate(cursor.getDate() + 1);
        break;
      case 'week':
        cursor.setDate(cursor.getDate() + 7);
        break;
      case 'month':
        cursor.setMonth(cursor.getMonth() + 1);
        break;
      case 'year':
        cursor.setFullYear(cursor.getFullYear() + 1);
        break;
      default:
        cursor.setDate(cursor.getDate() + 1);
    }
  }
  return [...new Set(labels)].sort();
}
