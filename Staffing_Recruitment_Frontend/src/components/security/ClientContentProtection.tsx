'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { addRequirementActivity } from '@/lib/api/requirements';
import { isContentProtectionDisabled, isDragAllowed, isEditableField } from '@/lib/security/contentProtection';

const BODY_CLASS = 'content-protected';

/**
 * Deters copying and right-click extraction in the authenticated app.
 * Not foolproof (screenshots, devtools, etc.) — pairs with server-side access control.
 */
export function ClientContentProtection() {
  const pathname = usePathname();

  useEffect(() => {
    if (isContentProtectionDisabled()) return;

    document.body.classList.add(BODY_CLASS);

    const requirementIdMatch = pathname?.match(/^\/requirements\/([^/]+)/);
    const requirementId = requirementIdMatch?.[1] ?? null;
    const lastLogAt: Record<string, number> = {};

    const logSecurityEvent = (action: string, summary: string, metadata?: Record<string, unknown>) => {
      if (!requirementId) return;
      const key = `${requirementId}:${action}`;
      const now = Date.now();
      if (now - (lastLogAt[key] ?? 0) < 5000) return;
      lastLogAt[key] = now;
      void addRequirementActivity(requirementId, {
        action,
        summary,
        metadata: { ...metadata, path: pathname, timestamp: new Date().toISOString() },
      }).catch(() => undefined);
    };

    const blockClipboard = (event: ClipboardEvent) => {
      event.preventDefault();
      logSecurityEvent(`security.${event.type}_blocked`, `${event.type} attempt blocked`, {
        type: event.type,
      });
    };

    const blockContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      logSecurityEvent('security.context_menu_blocked', 'Context menu blocked');
    };

    const blockSelectStart = (event: Event) => {
      if (isEditableField(event.target)) return;
      event.preventDefault();
    };

    const blockDragStart = (event: DragEvent) => {
      if (isEditableField(event.target) || isDragAllowed(event.target)) return;
      event.preventDefault();
    };

    const blockRestrictedKeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      const inField = isEditableField(event.target);

      if (mod && (key === 'c' || key === 'x' || key === 'a' || key === 'p' || key === 's' || key === 'u')) {
        if (inField && key === 'a') {
          return;
        }
        event.preventDefault();
        logSecurityEvent('security.keyboard_shortcut_blocked', 'Restricted keyboard shortcut blocked', {
          key,
        });
        return;
      }

      if (key === 'f12') {
        event.preventDefault();
        logSecurityEvent('security.devtools_shortcut_blocked', 'Developer tools shortcut blocked');
        return;
      }

      if (mod && event.shiftKey && (key === 'i' || key === 'j' || key === 'c')) {
        event.preventDefault();
        logSecurityEvent('security.devtools_shortcut_blocked', 'Developer tools shortcut blocked', {
          key,
        });
      }
    };

    document.addEventListener('copy', blockClipboard);
    document.addEventListener('cut', blockClipboard);
    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('selectstart', blockSelectStart);
    document.addEventListener('dragstart', blockDragStart);
    document.addEventListener('keydown', blockRestrictedKeys);

    return () => {
      document.body.classList.remove(BODY_CLASS);
      document.removeEventListener('copy', blockClipboard);
      document.removeEventListener('cut', blockClipboard);
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('selectstart', blockSelectStart);
      document.removeEventListener('dragstart', blockDragStart);
      document.removeEventListener('keydown', blockRestrictedKeys);
    };
  }, [pathname]);

  return null;
}
