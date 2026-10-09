import type { MyActiveAssignment } from '@/lib/api/assignments';

const STORAGE_KEY = 'recruiter_seen_assignment_keys_v1';
const MAX_KEYS = 1000;

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

export function assignmentScopeKey(userKey: string): string {
  return userKey.trim();
}

/** One notification per assignment event (re-assign after revoke updates assignedOn). */
export function assignmentDedupeKey(row: MyActiveAssignment): string {
  return `${row.id}:${row.assignedOn}`;
}

export function getSeenAssignmentKeys(userKey: string): Set<string> {
  const store = readStore();
  const scope = assignmentScopeKey(userKey);
  const list = store[scope];
  return new Set(Array.isArray(list) ? list : []);
}

export function markAssignmentsSeen(userKey: string, rows: MyActiveAssignment[]): void {
  if (!userKey.trim() || rows.length === 0) return;
  const store = readStore();
  const scope = assignmentScopeKey(userKey);
  const existing = new Set(Array.isArray(store[scope]) ? store[scope] : []);
  for (const row of rows) {
    existing.add(assignmentDedupeKey(row));
  }
  const trimmed = [...existing].slice(-MAX_KEYS);
  store[scope] = trimmed;
  writeStore(store);
}

export function hasAssignmentNotificationSeed(userKey: string): boolean {
  if (!userKey.trim()) return false;
  const store = readStore();
  const scope = assignmentScopeKey(userKey);
  return Object.prototype.hasOwnProperty.call(store, scope);
}

export function filterUnseenAssignments(
  userKey: string,
  rows: MyActiveAssignment[],
): MyActiveAssignment[] {
  const seen = getSeenAssignmentKeys(userKey);
  return rows.filter((row) => !seen.has(assignmentDedupeKey(row)));
}

/** Assignments from the last 48h are treated as fresh on first-time bootstrap. */
export function filterRecentAssignments(
  rows: MyActiveAssignment[],
  maxAgeMs = 48 * 60 * 60 * 1000,
): MyActiveAssignment[] {
  const cutoff = Date.now() - maxAgeMs;
  return rows.filter((row) => {
    const t = Date.parse(row.assignedOn);
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function buildAssignmentNotificationMessage(row: MyActiveAssignment): string {
  const assigner = row.assignerName?.trim() || 'A recruiter';
  const reqCode = row.requirementId?.trim() || 'a requirement';
  const job = row.jobTitle?.trim();
  const workLabel = job ? `${reqCode} (${job})` : reqCode;
  return `${assigner} assigned work to you: ${workLabel}. It is available on My Work.`;
}
