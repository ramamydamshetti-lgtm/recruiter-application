import type { Dispatch } from 'react';
import type { NotificationAction } from '@/lib/contexts/NotificationContext';
import { notify } from '@/lib/notify';
import {
  isPopupNotificationShown,
  markPopupNotificationShown,
} from '@/lib/notifications/shownNotifications';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

type PushAppNotificationInput = {
  /** Stable id so the same alert is never popped twice (persisted in localStorage). */
  dedupeKey: string;
  type?: NotificationType;
  title: string;
  message: string;
  showToast?: boolean;
  showBell?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
};

/**
 * Show a one-time in-app alert (toast + optional bell entry).
 * User-initiated feedback (save success, validation errors) should use `notify.*` directly.
 */
export function pushAppNotification(
  dispatch: Dispatch<NotificationAction> | null | undefined,
  input: PushAppNotificationInput,
): boolean {
  const dedupeKey = input.dedupeKey.trim();
  if (!dedupeKey || isPopupNotificationShown(dedupeKey)) {
    return false;
  }

  markPopupNotificationShown(dedupeKey);

  const type = input.type ?? 'info';
  const message = input.message;
  const showToast = input.showToast !== false;
  const showBell = input.showBell !== false;

  if (showToast) {
    const toastOpts = { toastId: dedupeKey };
    switch (type) {
      case 'success':
        notify.success(message, toastOpts);
        break;
      case 'warning':
        notify.warning(message, toastOpts);
        break;
      case 'error':
        notify.error(message, toastOpts);
        break;
      default:
        notify.info(message, toastOpts);
        break;
    }
  }

  if (showBell && dispatch) {
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        type,
        title: input.title,
        message,
        ...(input.action ? { action: input.action } : {}),
      },
    });
  }

  return true;
}
