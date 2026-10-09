/** Preset submission clients — keep in sync with frontend SUBMISSION_CLIENTS. */
export const SUBMISSION_CLIENT_PRESETS = [
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

export const SUBMISSION_CLIENT_OTHER = 'other-custom';

const REQUIREMENT_FROM_CUSTOM = '__custom__';

export function labelForSubmissionClientSlug(slug: string | undefined | null): string | undefined {
  const normalized = String(slug ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  return SUBMISSION_CLIENT_PRESETS.find((c) => c.value === normalized)?.label;
}

function resolveRequirementStoredClientName(
  submittingTo?: string | null,
  clientLeadPoc?: string | null,
): string {
  const raw = (submittingTo ?? '').trim();
  if (!raw || raw === REQUIREMENT_FROM_CUSTOM) {
    return (clientLeadPoc ?? '').trim();
  }
  const bySlug = labelForSubmissionClientSlug(raw);
  if (bySlug) return bySlug;
  const byLabel = SUBMISSION_CLIENT_PRESETS.find(
    (c) => c.label.toLowerCase() === raw.toLowerCase(),
  );
  if (byLabel) return byLabel.label;
  if (raw.toLowerCase() === 'other') return (clientLeadPoc ?? '').trim();
  return raw;
}

/**
 * Client name for submission emails and tracker subtitles.
 * Uses the client selected on the submission form, not the requirement "Requirement From" field.
 */
export function resolveSubmissionEmailClientName(input: {
  submissionClientSlug: string;
  customClientName?: string;
  requirementSubmittingTo?: string | null;
  clientLeadPoc?: string | null;
}): string {
  const slug = input.submissionClientSlug.trim().toLowerCase();
  const custom = input.customClientName?.trim() ?? '';

  if (slug === SUBMISSION_CLIENT_OTHER) {
    return custom;
  }

  const presetLabel = labelForSubmissionClientSlug(slug);
  if (presetLabel) return presetLabel;

  return resolveRequirementStoredClientName(
    input.requirementSubmittingTo,
    input.clientLeadPoc,
  );
}
