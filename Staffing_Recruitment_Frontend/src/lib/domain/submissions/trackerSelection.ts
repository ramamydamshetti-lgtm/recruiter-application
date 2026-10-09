import {
  SUBMISSION_CLIENT_OTHER,
  SUBMISSION_CLIENTS,
  labelForSubmittingTo,
} from './constants';

export function isUniversalTrackerClient(client: string | undefined | null): boolean {
  return client === SUBMISSION_CLIENT_OTHER;
}

export function isPresetSubmissionClient(client: string | undefined | null): boolean {
  if (!client) return false;
  return SUBMISSION_CLIENTS.some((c) => c.value === client);
}

/** Display label for submission client dropdown / tracker header context. */
export function resolveSubmissionClientLabel(
  client: string | undefined | null,
  customClientName?: string,
): string {
  if (isUniversalTrackerClient(client)) {
    return customClientName?.trim() || labelForSubmittingTo(client);
  }
  return labelForSubmittingTo(client);
}

/** Email / UI tracker document title for universal and preset clients. */
export function universalTrackerDocumentTitle(customClientName: string): string {
  const name = customClientName.trim() || 'Client';
  return `${name} — Submission Tracker`;
}
