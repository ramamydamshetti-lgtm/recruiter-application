/**
 * Notice period options for job demands.
 * Clients often ask for immediate joiners (0-15/30 days) or specific notice periods.
 */

export type NoticePeriodOption = {
  value: string;
  label: string;
  /** Short label for chips/compact UI */
  shortLabel?: string;
  /** Days (for sorting/filtering) - null for "90+" or custom */
  days?: number;
  /** Whether this is an "immediate joiner" type (0-30 days) */
  isImmediate?: boolean;
};

/** Preset notice period options - ordered by typical client preference */
export const NOTICE_PERIOD_OPTIONS: NoticePeriodOption[] = [
  { value: 'immediate_0_15', label: 'Immediate (0-15 days)', shortLabel: '0-15 days', days: 15, isImmediate: true },
  { value: 'immediate_0_30', label: 'Immediate / 0-30 days', shortLabel: '0-30 days', days: 30, isImmediate: true },
  { value: '15_days', label: '15 days', shortLabel: '15 days', days: 15 },
  { value: '30_days', label: '30 days', shortLabel: '30 days', days: 30 },
  { value: '45_days', label: '45 days', shortLabel: '45 days', days: 45 },
  { value: '60_days', label: '60 days', shortLabel: '60 days', days: 60 },
  { value: '90_days', label: '90 days', shortLabel: '90 days', days: 90 },
  { value: '90_plus', label: '90+ days', shortLabel: '90+', days: undefined },
  { value: 'custom', label: 'Custom (specify days)', shortLabel: 'Custom' },
];

/** Get display label for stored value */
export function getNoticePeriodLabel(value: string, customDays?: number): string {
  if (value === 'custom' && customDays != null) {
    return `${customDays} days`;
  }
  const opt = NOTICE_PERIOD_OPTIONS.find((o) => o.value === value);
  return opt?.label ?? value;
}
