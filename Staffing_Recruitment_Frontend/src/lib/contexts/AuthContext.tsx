'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '@/lib/api/auth';
import { AUTH_SESSION_CHANGED, AUTH_SESSION_CLEARED, AUTH_TOKEN_KEY } from '@/lib/auth/session';
import { getRecruiters } from '@/lib/api/recruiters';
import type { Recruiter } from '@/lib/domain/requirements/types';

type AuthContextValue = {
  currentUser: Recruiter | null;
  recruiters: Recruiter[];
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Recruiter | null>(null);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refreshInFlightRef = React.useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = React.useRef(0);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 1200) return;
    lastRefreshAtRef.current = now;
    const task = (async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        let user = null;
        let recruiterList: Recruiter[] = [];

        if (token) {
          // Only fetch user data if token exists
          user = await getCurrentUser().catch(() => null);

          // Only fetch recruiters if token exists
          try {
            recruiterList = await getRecruiters();
          } catch (_error) {
            recruiterList = [];
          }
        }

        setCurrentUser(user);
        setRecruiters(Array.isArray(recruiterList) ? recruiterList : []);
      } catch (error) {
        console.error('Failed to refresh auth context:', error);
        setCurrentUser(null);
        setRecruiters([]);
      } finally {
        setIsLoading(false);
      }
    })();
    refreshInFlightRef.current = task;
    try {
      await task;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onSessionChange = () => {
      lastRefreshAtRef.current = 0;
      void refresh();
    };
    window.addEventListener(AUTH_SESSION_CHANGED, onSessionChange);
    window.addEventListener(AUTH_SESSION_CLEARED, onSessionChange);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED, onSessionChange);
      window.removeEventListener(AUTH_SESSION_CLEARED, onSessionChange);
    };
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      recruiters,
      isLoading,
      refresh,
    }),
    [currentUser, recruiters, isLoading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
