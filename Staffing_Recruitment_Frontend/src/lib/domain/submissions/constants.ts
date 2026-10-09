/** Sentinel for "Requirement From" / client dropdown — resolved to user-entered text on save. */
export const REQUIREMENT_FROM_CUSTOM = '__custom__';

export const SUBMISSION_CLIENTS = [
  { value: 'itc', label: 'ITC' },
  { value: 'kpmg', label: 'KPMG' },
  { value: 'ust', label: 'UST' },
  { value: 'ltts', label: 'LTTS / L&T' },
  { value: 'accenture', label: 'Accenture' },
  { value: 'qbruenax', label: 'Qbruenax' },
  { value: 'brillio', label: 'Brillio' },
  { value: 'happiest-minds', label: 'Happiest Minds' },
  { value: 'metaforge', label: 'Metaforge (Internal)' },
] as const;

/** Submission form: use universal tracker + free-text client name. */
export const SUBMISSION_CLIENT_OTHER = 'other-custom' as const;

export const SUBMISSION_CLIENT_OTHER_LABEL = 'Other/Custom' as const;

/** Preset companies plus "Other" for entering any new company or source. */
export const REQUIREMENT_FROM_SELECT_OPTIONS = [
  ...SUBMISSION_CLIENTS,
  { value: REQUIREMENT_FROM_CUSTOM, label: 'Other company / source…' },
] as const;

/** Display label for a stored submittingTo value (preset slug or custom free text). */
export function labelForSubmittingTo(stored: string | undefined | null): string {
  if (stored == null || stored === '') return '';
  if (stored === REQUIREMENT_FROM_CUSTOM) return 'Other';
  if (stored === SUBMISSION_CLIENT_OTHER) return SUBMISSION_CLIENT_OTHER_LABEL;
  const preset = SUBMISSION_CLIENTS.find((c) => c.value === stored);
  if (preset) return preset.label;
  return stored;
}
