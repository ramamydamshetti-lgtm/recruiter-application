/** Persist in-progress recruiter form data across page reload only (sessionStorage). */

const DRAFT_PREFIX = 'mf_form_draft_';
const INSTANCE_PREFIX = `${DRAFT_PREFIX}instance_`;

export type FormDraftKind = 'requirement_create' | 'candidate_entry';

/** @deprecated Legacy localStorage key — cleared on session start. */
export function requirementCreateDraftKey(userId: string): string {
  return `${DRAFT_PREFIX}requirement_create_${userId}`;
}

/** @deprecated Legacy localStorage key — cleared on session start. */
export function candidateEntryDraftKey(userId: string, requirementId?: string): string {
  const scope = requirementId?.trim() || 'general';
  return `${DRAFT_PREFIX}candidate_entry_${userId}_${scope}`;
}

function instanceMetaKey(kind: FormDraftKind, userId: string, scope?: string): string {
  const normalizedScope = scope?.trim() || '';
  return `${INSTANCE_PREFIX}${kind}_${userId}${normalizedScope ? `_${normalizedScope}` : ''}`;
}

function draftDataKey(
  kind: FormDraftKind,
  userId: string,
  instanceId: string,
  scope?: string,
): string {
  const normalizedScope = scope?.trim() || '';
  return `${DRAFT_PREFIX}${kind}_${userId}${normalizedScope ? `_${normalizedScope}` : ''}_${instanceId}`;
}

function newInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function reloadFlagKey(kind: FormDraftKind, userId: string, scope?: string): string {
  const normalizedScope = scope?.trim() || '';
  return `${DRAFT_PREFIX}reload_${kind}_${userId}${normalizedScope ? `_${normalizedScope}` : ''}`;
}

/** Set immediately before the browser reloads the tab (not fired on SPA navigation). */
export function markFormDraftReloadPending(
  kind: FormDraftKind,
  userId: string,
  scope?: string,
): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(reloadFlagKey(kind, userId, scope), '1');
}

/** Used on unmount to avoid clearing a draft that is about to be restored after reload. */
export function isFormDraftReloadPending(
  kind: FormDraftKind,
  userId: string,
  scope?: string,
): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(reloadFlagKey(kind, userId, scope)) === '1';
}

/** Clear reload intent after draft values have been applied (survives React Strict Mode remount). */
export function acknowledgeFormDraftReload(
  kind: FormDraftKind,
  userId: string,
  scope?: string,
): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(reloadFlagKey(kind, userId, scope));
}

function removeLegacyDraft(kind: FormDraftKind, userId: string, scope?: string): void {
  if (typeof localStorage === 'undefined') return;
  if (kind === 'requirement_create') {
    localStorage.removeItem(requirementCreateDraftKey(userId));
    return;
  }
  localStorage.removeItem(candidateEntryDraftKey(userId, scope));
}

/**
 * Starts or resumes a form draft session.
 * - Reload: restore the in-progress draft for this form context.
 * - Navigate (new visit): discard the previous draft and open a blank form.
 */
export function beginFormDraftSession(
  kind: FormDraftKind,
  userId: string,
  scope?: string,
): { draftKey: string; shouldRestore: boolean } {
  removeLegacyDraft(kind, userId, scope);

  const metaKey = instanceMetaKey(kind, userId, scope);
  const existingInstance = sessionStorage.getItem(metaKey);
  const reloadPending = isFormDraftReloadPending(kind, userId, scope);

  if (reloadPending && existingInstance) {
    return {
      draftKey: draftDataKey(kind, userId, existingInstance, scope),
      shouldRestore: true,
    };
  }

  acknowledgeFormDraftReload(kind, userId, scope);

  if (existingInstance) {
    removeFormDraft(draftDataKey(kind, userId, existingInstance, scope));
  }

  const instanceId = newInstanceId();
  sessionStorage.setItem(metaKey, instanceId);

  return {
    draftKey: draftDataKey(kind, userId, instanceId, scope),
    shouldRestore: false,
  };
}

/** Clears draft data after successful submit. */
export function endFormDraftSession(kind: FormDraftKind, userId: string, scope?: string): void {
  const metaKey = instanceMetaKey(kind, userId, scope);
  const instanceId = sessionStorage.getItem(metaKey);
  if (instanceId) {
    removeFormDraft(draftDataKey(kind, userId, instanceId, scope));
  }
  sessionStorage.removeItem(metaKey);
}

function mountKeyStorage(kind: FormDraftKind, scope?: string): string {
  const normalizedScope = scope?.trim() || '';
  return `${DRAFT_PREFIX}mount_${kind}${normalizedScope ? `_${normalizedScope}` : ''}`;
}

/** Call from “Create / Add” navigation so the form remounts blank (not a reload). */
export function bumpFormMountKey(kind: FormDraftKind, scope?: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(mountKeyStorage(kind, scope), String(Date.now()));
}

export function readFormMountKey(kind: FormDraftKind, scope?: string): string {
  if (typeof window === 'undefined') return '0';
  return sessionStorage.getItem(mountKeyStorage(kind, scope)) ?? 'initial';
}

export function readFormDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeFormDraft(key: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota or private mode */
  }
}

export function removeFormDraft(key: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(key);
}

/** Cleared on logout so drafts do not leak between users. */
export function clearAllFormDrafts(): void {
  if (typeof window === 'undefined') return;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(DRAFT_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(DRAFT_PREFIX)) {
      sessionStorage.removeItem(key);
    }
  }
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** True when persisted values differ from empty defaults (ignore auto-generated ids). */
export function hasMeaningfulDraftValues<T extends Record<string, unknown>>(
  values: T,
  defaults: T,
  ignoreKeys: (keyof T)[] = [],
): boolean {
  const ignore = new Set(ignoreKeys);
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    if (ignore.has(key)) continue;
    const current = values[key];
    const baseline = defaults[key];
    if (Array.isArray(current) && Array.isArray(baseline)) {
      if (current.length > 0) return true;
      continue;
    }
    if (typeof current === 'number' && typeof baseline === 'number' && current !== baseline) {
      return true;
    }
    if (isNonEmptyString(current) && current !== baseline) return true;
  }
  return false;
}
