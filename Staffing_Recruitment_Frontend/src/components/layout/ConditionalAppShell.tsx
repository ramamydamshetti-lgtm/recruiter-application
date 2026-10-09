'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AppShell from './AppShell';
import { AssignmentNotificationWatcher } from '@/components/notifications/AssignmentNotificationWatcher';
import { useAuth } from '@/lib/contexts/AuthContext';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/reset-password'];

function hasStoredAuth(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem('authUser');
    return !!(stored && JSON.parse(stored)?.id);
  } catch {
    return false;
  }
}

export function ConditionalAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, isLoading, refresh } = useAuth();
  const isPublicRoute = PUBLIC_PATHS.some((p) => pathname === p || pathname?.startsWith(`${p}/`));
  const isAuthenticated = currentUser || hasStoredAuth();

  useEffect(() => {
    if (!isPublicRoute && !isLoading) {
      if (!currentUser && hasStoredAuth()) {
        refresh();
      } else if (!currentUser && !hasStoredAuth()) {
        router.replace('/login');
      }
    }
  }, [isPublicRoute, isLoading, currentUser, router, refresh]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  // App routes: require auth; show nothing while redirecting
  if (!isLoading && !isAuthenticated) {
    return null;
  }

  return (
    <AppShell>
      <AssignmentNotificationWatcher />
      {children}
    </AppShell>
  );
}
