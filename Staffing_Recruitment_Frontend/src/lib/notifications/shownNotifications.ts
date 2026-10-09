const STORAGE_KEY = 'app_shown_popup_notification_keys_v1';
const MAX_KEYS = 3000;

function readKeys(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeKeys(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-MAX_KEYS)));
  } catch {
    // ignore quota errors
  }
}

/** Whether a popup notification was already shown for this stable key. */
export function isPopupNotificationShown(dedupeKey: string): boolean {
  const key = dedupeKey.trim();
  if (!key) return false;
  return readKeys().includes(key);
}

/** Remember that a popup notification was shown (toast and/or bell). */
export function markPopupNotificationShown(dedupeKey: string): void {
  const key = dedupeKey.trim();
  if (!key) return;
  const keys = readKeys();
  if (keys.includes(key)) return;
  keys.push(key);
  writeKeys(keys);
}

export function markPopupNotificationsShown(dedupeKeys: string[]): void {
  const keys = readKeys();
  const set = new Set(keys);
  for (const raw of dedupeKeys) {
    const key = raw.trim();
    if (key) set.add(key);
  }
  writeKeys([...set]);
}
