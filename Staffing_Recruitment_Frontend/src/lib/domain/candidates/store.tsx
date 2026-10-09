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
  getCandidates,
  getJobDemands,
  getCandidateSubmissions,
  submitCandidate as apiSubmitCandidate,
} from '@/lib/api/candidates';
import type { Candidate, CandidateSubmission, JobDemand } from './types';
import { dedupeCandidateSubmissionsByCandidateRequirement } from '@/lib/domain/submissions/dedupe';
import { findSubmissionForJd } from '@/lib/domain/submissions/workflow';
import {
  isClientSubmittedStatus,
  isLeadReviewStatus,
  submissionStageFromStatus,
} from '@/lib/domain/submissions/status';

function normalizeTech(raw?: string) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function normalizePhone(v: string) {
  return v.replace(/\s+/g, '').trim();
}

function isRealEmail(v: string | null | undefined) {
  const email = normalizeEmail(String(v ?? ''));
  return Boolean(email && email.includes('@') && !email.endsWith('@entry.local'));
}

function sameCandidateIdentity(a: Candidate | undefined, b: Candidate | undefined) {
  if (!a || !b) return false;
  if (a.id === b.id) return true;
  const aEmail = normalizeEmail(a.email ?? '');
  const bEmail = normalizeEmail(b.email ?? '');
  if (isRealEmail(aEmail) && isRealEmail(bEmail) && aEmail === bEmail) return true;
  const aPhone = normalizePhone(a.phone ?? '');
  const bPhone = normalizePhone(b.phone ?? '');
  return Boolean(aPhone && bPhone && aPhone === bPhone);
}

type CandidatesStore = {
  jobDemands: JobDemand[];
  candidates: Candidate[];
  submissions: CandidateSubmission[];
  isLoading: boolean;
  error: string | null;

  hasSubmissionForJd: (candidateId: string, jdId: string) => boolean;
  isSubmittedToClientForJd: (candidateId: string, jdId: string) => boolean;
  getSubmissionStageForJd: (candidateId: string, jdId: string) => 'none' | 'lead' | 'client';

  submitCandidate: (input: {
    candidate: Omit<Candidate, 'id' | 'createdAt' | 'technologies'> & {
      skillsRaw?: string;
      technologiesRaw?: string;
    };
    jdId: string;
    submittedBy: { id: string; name: string; email: string };
    submission?: Omit<
      CandidateSubmission,
      'id' | 'candidateId' | 'jdId' | 'submittedBy' | 'submittedOn' | 'status'
    > & { submissionDate?: string };
    resumeFile?: File | null;
    existingCandidateId?: string;
    resumeOptional?: boolean;
    submissionStage?: 'lead' | 'client';
  }) => Promise<{ candidate: Candidate; submission: CandidateSubmission }>;

  refresh: () => Promise<void>;
};

const Ctx = createContext<CandidatesStore | null>(null);
const CANDIDATES_CACHE_TTL_MS = 15000;

export function CandidatesProvider({ children }: { children: React.ReactNode }) {
  const [jobDemands, setJobDemands] = useState<JobDemand[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [submissions, setSubmissions] = useState<CandidateSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<{
    ts: number;
    data: { demands: JobDemand[]; candidates: Candidate[]; submissions: CandidateSubmission[] };
  } | null>(null);
  const inFlightRef = useRef<Promise<{
    demands: JobDemand[];
    candidates: Candidate[];
    submissions: CandidateSubmission[];
  }> | null>(null);
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current;
    const token = localStorage.getItem('token');
    if (!token) {
      setJobDemands([]);
      setCandidates([]);
      setSubmissions([]);
      setIsLoading(false);
      return;
    }

    const now = Date.now();
    const cached = cacheRef.current;
    if (cached && now - cached.ts < CANDIDATES_CACHE_TTL_MS) {
      if (requestSeq === requestSeqRef.current) {
        setJobDemands(cached.data.demands);
        setCandidates(cached.data.candidates);
        setSubmissions(cached.data.submissions);
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (!inFlightRef.current) {
        inFlightRef.current = Promise.all([
          getJobDemands(),
          getCandidates(),
          getCandidateSubmissions(),
        ]).then(([demands, candidatesData, submissionsData]) => ({
          demands,
          candidates: candidatesData,
          submissions: submissionsData,
        })).finally(() => {
          inFlightRef.current = null;
        });
      }
      const payload = await inFlightRef.current;
      cacheRef.current = { ts: Date.now(), data: payload };
      if (requestSeq === requestSeqRef.current) {
        setJobDemands(payload.demands);
        setCandidates(payload.candidates);
        setSubmissions(dedupeCandidateSubmissionsByCandidateRequirement(payload.submissions));
      }
    } catch (e) {
      if (requestSeq === requestSeqRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load candidates');
        setJobDemands([]);
        setCandidates([]);
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

  const matchCandidateIdentity = useCallback(
    (candidateId: string, otherCandidateId: string) => {
      const candidate = candidates.find((c) => c.id === candidateId);
      const other = candidates.find((c) => c.id === otherCandidateId);
      return sameCandidateIdentity(candidate, other);
    },
    [candidates],
  );

  const findJdSubmission = useCallback(
    (candidateId: string, jdId: string) =>
      findSubmissionForJd(submissions, candidateId, jdId, (otherId) =>
        matchCandidateIdentity(candidateId, otherId),
      ),
    [submissions, matchCandidateIdentity],
  );

  const isSubmittedToClientForJd = useCallback(
    (candidateId: string, jdId: string) => {
      const row = findJdSubmission(candidateId, jdId);
      return row ? isClientSubmittedStatus(row.status) : false;
    },
    [findJdSubmission],
  );

  const getSubmissionStageForJd = useCallback(
    (candidateId: string, jdId: string): 'none' | 'lead' | 'client' =>
      submissionStageFromStatus(findJdSubmission(candidateId, jdId)?.status),
    [findJdSubmission],
  );

  const hasSubmissionForJd = useCallback(
    (candidateId: string, jdId: string) => isSubmittedToClientForJd(candidateId, jdId),
    [isSubmittedToClientForJd],
  );

  const submitCandidate = useCallback(
    async (input: {
      candidate: Omit<Candidate, 'id' | 'createdAt' | 'technologies'> & {
        skillsRaw?: string;
        technologiesRaw?: string;
      };
      jdId: string;
      submittedBy: { id: string; name: string; email: string };
      submission?: Omit<
        CandidateSubmission,
        'id' | 'candidateId' | 'jdId' | 'submittedBy' | 'submittedOn' | 'status'
      > & { submissionDate?: string };
      resumeFile?: File | null;
      existingCandidateId?: string;
      resumeOptional?: boolean;
      submissionStage?: 'lead' | 'client';
    }) => {
      const result = await apiSubmitCandidate(input);
      cacheRef.current = null;
      setCandidates((prev) => [
        result.candidate,
        ...prev.filter((c) => c.id !== result.candidate.id),
      ]);
      setSubmissions((prev) =>
        dedupeCandidateSubmissionsByCandidateRequirement([result.submission, ...prev]),
      );
      return result;
    },
    [],
  );

  const value = useMemo<CandidatesStore>(
    () => ({
      jobDemands,
      candidates,
      submissions,
      isLoading,
      error,
      hasSubmissionForJd,
      isSubmittedToClientForJd,
      getSubmissionStageForJd,
      submitCandidate,
      refresh,
    }),
    [
      jobDemands,
      candidates,
      submissions,
      isLoading,
      error,
      hasSubmissionForJd,
      isSubmittedToClientForJd,
      getSubmissionStageForJd,
      submitCandidate,
      refresh,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCandidatesStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCandidatesStore must be used within CandidatesProvider');
  return ctx;
}
