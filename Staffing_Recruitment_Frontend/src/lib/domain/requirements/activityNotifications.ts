import type { RequirementActivityRow } from '@/lib/api/requirements';

function activityMetadata(row: RequirementActivityRow): Record<string, unknown> | null {
  if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
    return null;
  }
  return row.metadata as Record<string, unknown>;
}

/** True when the signed-in user created this submission activity. */
export function isOwnSubmissionActivity(
  row: RequirementActivityRow,
  currentUser: { id?: string; email?: string } | null | undefined,
): boolean {
  if (!currentUser || row.action !== 'submission.created') return false;

  const userId = String(currentUser.id ?? '').trim();
  const userEmail = String(currentUser.email ?? '').trim().toLowerCase();
  const meta = activityMetadata(row);

  const recruiterId = String(meta?.recruiterId ?? '').trim();
  if (userId && recruiterId && userId === recruiterId) return true;

  const actorId = String(row.actorId ?? '').trim();
  if (userId && actorId && userId === actorId) return true;

  const actorEmail = String(row.actorEmail ?? '').trim().toLowerCase();
  if (userEmail && actorEmail && userEmail === actorEmail) return true;

  return false;
}

export function buildSubmissionActivityNotificationMessage(
  rows: RequirementActivityRow[],
): string {
  if (rows.length === 1) {
    return rows[0]!.summary || 'A recruiter submitted a candidate.';
  }

  const names = rows
    .map((row) => String(activityMetadata(row)?.candidateName ?? '').trim())
    .filter(Boolean);
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length > 0) {
    return `${rows.length} candidates submitted: ${uniqueNames.join(', ')}`;
  }
  return `${rows.length} candidates submitted to this requirement.`;
}

export function batchSubmissionActivityDedupeKey(rows: RequirementActivityRow[]): string {
  return rows
    .map((row) => activityDedupeKey(row))
    .sort()
    .join('|');
}

const STORAGE_KEY = 'requirement_seen_activity_keys_v1';
const MAX_KEYS_PER_REQUIREMENT = 500;

type SeenStore = Record<string, string[]>;

function readStore(): SeenStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: SeenStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

export function requirementActivityScopeKey(
  userKey: string,
  requirementId: string,
): string {
  return `${userKey.trim()}:${requirementId.trim()}`;
}

export function activityDedupeKey(row: RequirementActivityRow): string {
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const submissionId = String(meta?.submissionId ?? '').trim();
  if (row.action === 'submission.created' && submissionId) {
    return `submission:${submissionId}`;
  }
  return `activity:${row.id}`;
}

export function getSeenActivityKeys(userKey: string, requirementId: string): Set<string> {
  const store = readStore();
  const scope = requirementActivityScopeKey(userKey, requirementId);
  const list = store[scope];
  return new Set(Array.isArray(list) ? list : []);
}

export function markActivitiesSeen(
  userKey: string,
  requirementId: string,
  rows: RequirementActivityRow[],
): void {
  if (!userKey.trim() || !requirementId.trim() || rows.length === 0) return;
  const store = readStore();
  const scope = requirementActivityScopeKey(userKey, requirementId);
  const existing = new Set(Array.isArray(store[scope]) ? store[scope] : []);
  for (const row of rows) {
    existing.add(activityDedupeKey(row));
  }
  const trimmed = [...existing].slice(-MAX_KEYS_PER_REQUIREMENT);
  store[scope] = trimmed;
  writeStore(store);
}

export function hasActivityNotificationSeed(userKey: string, requirementId: string): boolean {
  if (!userKey.trim() || !requirementId.trim()) return false;
  const store = readStore();
  const scope = requirementActivityScopeKey(userKey, requirementId);
  return Object.prototype.hasOwnProperty.call(store, scope);
}

export function filterUnseenActivities(
  userKey: string,
  requirementId: string,
  rows: RequirementActivityRow[],
): RequirementActivityRow[] {
  const seen = getSeenActivityKeys(userKey, requirementId);
  return rows.filter((row) => !seen.has(activityDedupeKey(row)));
}

export function isActivitySeen(
  userKey: string,
  requirementId: string,
  row: RequirementActivityRow,
): boolean {
  return getSeenActivityKeys(userKey, requirementId).has(activityDedupeKey(row));
}
