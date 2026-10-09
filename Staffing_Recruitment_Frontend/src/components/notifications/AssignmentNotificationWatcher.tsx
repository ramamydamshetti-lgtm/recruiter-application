'use client';

import { useAssignmentNotifications } from '@/lib/hooks/useAssignmentNotifications';

/** Polls for new requirement assignments and surfaces one-time in-app + toast alerts. */
export function AssignmentNotificationWatcher() {
  useAssignmentNotifications(true);
  return null;
}
