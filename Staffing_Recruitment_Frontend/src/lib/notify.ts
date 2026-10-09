/**
 * App-wide user feedback via react-toastify (see `ToastContainer` in `app/layout.tsx`).
 * Prefer this over `window.alert` / `alert()` for non-blocking, accessible toasts.
 */
import { toast, type ToastContent, type ToastOptions } from 'react-toastify';

const base: ToastOptions = {
  position: 'top-right',
  autoClose: 4500,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

function merge(opts?: ToastOptions): ToastOptions {
  return { ...base, ...opts };
}

function compactTextMessage(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return normalized;

  // Keep toast copy short and status-centric.
  if (normalized.length <= 96) return normalized;

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0]?.trim() || normalized;
  const candidate = firstSentence.length >= 18 ? firstSentence : normalized;
  if (candidate.length <= 96) return candidate;
  return `${candidate.slice(0, 93).trimEnd()}...`;
}

function compactToastContent(message: ToastContent): ToastContent {
  if (typeof message === 'string') return compactTextMessage(message);
  return message;
}

export const notify = {
  success: (message: ToastContent, opts?: ToastOptions) =>
    toast.success(compactToastContent(message), merge(opts)),
  error: (message: ToastContent, opts?: ToastOptions) =>
    toast.error(compactToastContent(message), merge({ autoClose: 6000, ...opts })),
  info: (message: ToastContent, opts?: ToastOptions) =>
    toast.info(compactToastContent(message), merge(opts)),
  warning: (message: ToastContent, opts?: ToastOptions) =>
    toast.warning(compactToastContent(message), merge({ autoClose: 5500, ...opts })),
  /** Long or multi-line messages (same styling as info). */
  message: (message: ToastContent, opts?: ToastOptions) =>
    toast(compactToastContent(message), merge(opts)),
  dismiss: (toastId?: string | number) => toast.dismiss(toastId),
  /** Blocking confirmation — use only when a choice is required (e.g. destructive actions). */
  confirm: (message: string) => window.confirm(message),
};
