'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fetchMyActiveAssignments } from '@/lib/api/assignments';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import {
  assignmentDedupeKey,
  buildAssignmentNotificationMessage,
  filterRecentAssignments,
  filterUnseenAssignments,
  hasAssignmentNotificationSeed,
  markAssignmentsSeen,
} from '@/lib/domain/requirements/assignmentNotifications';
import { pushAppNotification } from '@/lib/notifications/pushAppNotification';
import { AUTH_SESSION_CLEARED } from '@/lib/auth/session';

const POLL_INTERVAL_MS = 30_000;

export function useAssignmentNotifications(enabled = true): void {
  const { currentUser } = useAuth();
  const { dispatch } = useNotifications();
  const router = useRouter();
  const inFlightRef = useRef(false);

  const userKey = String(currentUser?.id ?? currentUser?.email ?? '').trim();
  const userId = String(currentUser?.id ?? '').trim();

  const notifyAssignments = useCallback(
    (rows: Awaited<ReturnType<typeof fetchMyActiveAssignments>>) => {
      for (const row of rows) {
        const message = buildAssignmentNotificationMessage(row);
        pushAppNotification(dispatch, {
          dedupeKey: `assignment:${assignmentDedupeKey(row)}`,
          type: 'info',
          title: 'New work assigned',
          message,
          action: {
            label: 'Open My Work',
            onClick: () => router.push('/my-work'),
          },
        });
      }
    },
    [dispatch, router],
  );

  const isAssignableToNotify = useCallback(
    (row: Awaited<ReturnType<typeof fetchMyActiveAssignments>>[number]) => {
      if (!userId) return true;
      return row.assignerId !== userId;
    },
    [userId],
  );

  const checkAssignments = useCallback(async () => {
    if (!enabled || !userKey) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const rows = await fetchMyActiveAssignments();

      if (!hasAssignmentNotificationSeed(userKey)) {
        const fresh = filterRecentAssignments(rows).filter(isAssignableToNotify);
        markAssignmentsSeen(userKey, rows);
        if (fresh.length > 0) notifyAssignments(fresh);
        return;
      }

      const unseen = filterUnseenAssignments(userKey, rows).filter(isAssignableToNotify);
      if (unseen.length === 0) return;

      markAssignmentsSeen(userKey, unseen);
      notifyAssignments(unseen);
    } catch {
      // ignore transient network/auth errors during background polling
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, isAssignableToNotify, notifyAssignments, userKey]);

  useEffect(() => {
    if (!enabled || !userKey) return;

    void checkAssignments();
    const timer = window.setInterval(() => void checkAssignments(), POLL_INTERVAL_MS);

    const onAssignmentChanged = () => void checkAssignments();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkAssignments();
    };

    window.addEventListener('requirements-assignment-changed', onAssignmentChanged);
    window.addEventListener(AUTH_SESSION_CLEARED, onAssignmentChanged);
    window.addEventListener('focus', onAssignmentChanged);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('requirements-assignment-changed', onAssignmentChanged);
      window.removeEventListener(AUTH_SESSION_CLEARED, onAssignmentChanged);
      window.removeEventListener('focus', onAssignmentChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkAssignments, enabled, userKey]);
}
