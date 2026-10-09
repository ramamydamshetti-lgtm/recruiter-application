'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getSubmissions,
  addSubmission as apiAddSubmission,
  type SubmissionsQueryFilters,
} from '@/lib/api/submissions';
import type { Submission } from './types';
import { dedupeSubmissionsByCandidateRequirement } from './dedupe';
import { AUTH_SESSION_CHANGED, AUTH_SESSION_CLEARED, AUTH_TOKEN_KEY } from '@/lib/auth/session';

type AddSubmissionInput = Omit<Submission, 'id' | 'submittedOn'> & {
  id?: string;
  submittedOn?: string;
};

type SubmissionsStore = {
  submissions: Submission[];
  isLoading: boolean;
  error: string | null;
  findById: (id: string) => Submission | undefined;
  addSubmission: (input: AddSubmissionInput) => Promise<Submission>;
  refresh: (filters?: SubmissionsQueryFilters) => Promise<void>;
};

const Ctx = createContext<SubmissionsStore | null>(null);
const SUBMISSIONS_CACHE_TTL_MS = 10000;

export function SubmissionsProvider({ children }: { children: React.ReactNode }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, { ts: number; data: Submission[] }>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<Submission[]>>>(new Map());
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async (filters?: SubmissionsQueryFilters) => {
    const requestSeq = ++requestSeqRef.current;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setSubmissions([]);
      setIsLoading(false);
      return;
    }

    const key = JSON.stringify(filters ?? {});
    const now = Date.now();
    const cached = cacheRef.current.get(key);
    if (cached && now - cached.ts < SUBMISSIONS_CACHE_TTL_MS) {
      if (requestSeq === requestSeqRef.current) {
        setSubmissions(cached.data);
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      let promise = inFlightRef.current.get(key);
      if (!promise) {
        promise = getSubmissions(filters).finally(() => {
          inFlightRef.current.delete(key);
        });
        inFlightRef.current.set(key, promise);
      }
      const data = await promise;
      const sorted = dedupeSubmissionsByCandidateRequirement(data);
      cacheRef.current.set(key, { ts: Date.now(), data: sorted });
      if (requestSeq === requestSeqRef.current) {
        setSubmissions(sorted);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('app-metrics-refresh'));
        }
      }
    } catch (e) {
      if (requestSeq === requestSeqRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load submissions');
        setSubmissions([]);
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onCleared = () => {
      requestSeqRef.current += 1;
      cacheRef.current.clear();
      inFlightRef.current.clear();
      setSubmissions([]);
      setIsLoading(false);
    };
    const onChanged = () => {
      requestSeqRef.current += 1;
      cacheRef.current.clear();
      inFlightRef.current.clear();
      void refresh();
    };
    window.addEventListener(AUTH_SESSION_CLEARED, onCleared);
    window.addEventListener(AUTH_SESSION_CHANGED, onChanged);
    return () => {
      window.removeEventListener(AUTH_SESSION_CLEARED, onCleared);
      window.removeEventListener(AUTH_SESSION_CHANGED, onChanged);
    };
  }, [refresh]);

  const findById = useCallback(
    (id: string) => submissions.find((s) => s.id === id),
    [submissions],
  );

  const addSubmission = useCallback(async (input: AddSubmissionInput) => {
    const submission = await apiAddSubmission(input);
    cacheRef.current.clear();
    if (!submission?.id) {
      throw new Error('Invalid submission response from server');
    }
    const reasonFromInput =
      typeof (input as { rejectionReason?: unknown }).rejectionReason === 'string'
        ? String((input as { rejectionReason: string }).rejectionReason).trim() || null
        : null;
    const merged: Submission = {
      ...submission,
      rejectionReason: submission.rejectionReason ?? reasonFromInput ?? null,
    };
    setSubmissions((prev) => {
      const next = [merged, ...prev.filter((s) => s.id !== merged.id)];
      return dedupeSubmissionsByCandidateRequirement(next);
    });
    return merged;
  }, []);

  const value = useMemo<SubmissionsStore>(
    () => ({
      submissions,
      isLoading,
      error,
      findById,
      addSubmission,
      refresh,
    }),
    [submissions, isLoading, error, findById, addSubmission, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSubmissionsStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSubmissionsStore must be used within SubmissionsProvider');
  return ctx;
}
