/** When true, copy/right-click protections are off (local debugging only). */
export function isContentProtectionDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_CONTENT_PROTECTION === 'true';
}

export function isEditableField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

/** Allow intentional UI drag-and-drop (tracker columns, email recipients, etc.). */
export function isDragAllowed(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.draggable) return true;
  return !!target.closest('[draggable="true"], [data-allow-drag="true"]');
}
