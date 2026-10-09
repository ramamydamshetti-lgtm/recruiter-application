'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageBackNav } from '@/components/ui/PageBackNav';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterBar } from '@/components/ui/FilterBar';
import { useCandidatesStore } from '@/lib/domain/candidates/store';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getRequirementAssignments, type RequirementAssignmentRow } from '@/lib/api/requirements';
import {
  canUserWorkOnRequirement,
  getRequirementWorkBlockReason,
} from '@/lib/domain/requirements/workPermissions';
import { RequirementViewOnlyBanner } from '@/components/requirements/RequirementViewOnlyBanner';
import type { Candidate } from '@/lib/domain/candidates/types';
import { addRequirementActivity } from '@/lib/api/requirements';
import { searchCandidates } from '@/lib/api/candidates';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import {
  filterIndexedCandidatesByExperience,
  indexCandidatesByExperience,
  isCustomExperienceFilterActive,
  parseCustomExperienceBound,
  type ExperienceRangeFilter,
} from '@/lib/utils/formatCandidateTotalExperience';
import { displayCandidateTotalExperience } from '@/lib/utils/candidateExperienceInput';
import { formatCandidateSubmissionDate, displayCandidateRepositoryNumber } from '@/lib/domain/candidates/submissionDate';

const REPOSITORY_DISPLAY_LIMIT = 150;
const CUSTOM_EXPERIENCE_DEBOUNCE_MS = 400;
const REPO_REQUIREMENT_STORAGE_KEY = 'candidate_repo_requirement_id';

type CandidatePeriodFilter = '' | 'week' | '1m' | '3m' | '6m' | '1y';

const CANDIDATE_PERIOD_OPTIONS: Array<{ value: CandidatePeriodFilter; label: string }> = [
  { value: '', label: 'All time' },
  { value: 'week', label: 'Week' },
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: 'Year' },
];

function periodCutoff(filter: CandidatePeriodFilter): Date | null {
  if (!filter) return null;
  const d = new Date();
  if (filter === 'week') d.setDate(d.getDate() - 7);
  else if (filter === '1m') d.setMonth(d.getMonth() - 1);
  else if (filter === '3m') d.setMonth(d.getMonth() - 3);
  else if (filter === '6m') d.setMonth(d.getMonth() - 6);
  else if (filter === '1y') d.setFullYear(d.getFullYear() - 1);
  return d;
}

function recruiterDisplay(c: Candidate): string {
  return c.createdBy?.name?.trim() || c.createdBy?.email?.trim() || 'Unknown recruiter';
}

export function CandidateRepositoryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { candidates, isLoading, jobDemands, refresh, hasSubmissionForJd, getSubmissionStageForJd } = useCandidatesStore();
  const { requirements, refresh: refreshRequirements } = useRequirementsStore();
  const { currentUser } = useAuth();
  const [assignRows, setAssignRows] = useState<RequirementAssignmentRow[]>([]);
  const [q, setQ] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<ExperienceRangeFilter>('');
  const [periodFilter, setPeriodFilter] = useState<CandidatePeriodFilter>('');
  const [customExpMin, setCustomExpMin] = useState('');
  const [customExpMax, setCustomExpMax] = useState('');
  const [searchRows, setSearchRows] = useState<Candidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPeriodRecruiter, setSelectedPeriodRecruiter] = useState<string | null>(null);
  const requirementIdFromUrl = searchParams.get('requirementId')?.trim() || '';
  const requirementId = requirementIdFromUrl;
  const isRequirementSelectMode = !!requirementId;
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [revealedContactId, setRevealedContactId] = useState<string | null>(null);

  const activeRequirement = useMemo(
    () => jobDemands.find((j) => j.id === requirementId),
    [jobDemands, requirementId],
  );
  const linkedRequirement = useMemo(
    () => (requirementId ? requirements.find((r) => r.id === requirementId) : undefined),
    [requirements, requirementId],
  );
  const activeAssigneeIds = useMemo(
    () =>
      new Set(
        assignRows.filter((row) => row.status === 'ACTIVE').map((row) => row.recruiterId),
      ),
    [assignRows],
  );
  const workBlockReason = isRequirementSelectMode
    ? getRequirementWorkBlockReason(linkedRequirement, currentUser?.id, { activeAssigneeIds })
    : null;
  const canWorkOnRequirement = isRequirementSelectMode
    ? canUserWorkOnRequirement(linkedRequirement, currentUser?.id, { activeAssigneeIds })
    : true;

  useEffect(() => {
    void refreshRequirements({ limit: 500 });
  }, [refreshRequirements]);

  useEffect(() => {
    if (!requirementId) {
      setAssignRows([]);
      return;
    }
    void getRequirementAssignments(requirementId)
      .then(setAssignRows)
      .catch(() => setAssignRows([]));
  }, [requirementId]);

  useEffect(() => {
    if (requirementIdFromUrl && typeof window !== 'undefined') {
      sessionStorage.setItem(REPO_REQUIREMENT_STORAGE_KEY, requirementIdFromUrl);
    }
  }, [requirementIdFromUrl]);

  useEffect(() => {
    const raw = searchParams.get('selectIds')?.trim();
    if (!raw || !requirementId) return;
    const ids = raw
      .split(',')
      .map((s) => decodeURIComponent(s).trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    setSelectedCandidateIds(new Set(ids.filter((id) => !hasSubmissionForJd(id, requirementId))));
  }, [searchParams, requirementId, hasSubmissionForJd]);

  useEffect(() => {
    if (!requirementId) return;
    setSelectedCandidateIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => !hasSubmissionForJd(id, requirementId)));
      return next.size === prev.size ? prev : next;
    });
  }, [requirementId, hasSubmissionForJd]);

  const maskEmail = (email: string | null | undefined) => {
    const raw = String(email ?? '').trim();
    if (!raw || !raw.includes('@')) return '—';
    const [local, domain] = raw.split('@');
    const safeLocal =
      local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}`;
    return `${safeLocal}@${domain}`;
  };

  const maskPhone = (phone: string | null | undefined) => {
    const raw = String(phone ?? '').trim();
    if (!raw) return '—';
    const digits = raw.replace(/\D+/g, '');
    if (digits.length <= 4) return '****';
    return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
  };

  const technologySummary = (c: Candidate) => {
    const tech = Array.isArray(c.technologies) && c.technologies.length > 0
      ? c.technologies
      : Array.isArray(c.skills)
        ? c.skills
        : [];
    if (!tech.length) return '—';
    return tech.slice(0, 3).join(', ');
  };

  const totalExperienceLabel = (c: Candidate) => displayCandidateTotalExperience(c);

  const isContactVisible = (candidateId: string) => revealedContactId === candidateId;
  const toggleContactVisibility = async (candidate: Candidate) => {
    const candidateId = candidate.id;
    const willReveal = revealedContactId !== candidateId;
    setRevealedContactId((prev) => (prev === candidateId ? null : candidateId));
    if (willReveal && requirementId) {
      try {
        await addRequirementActivity(requirementId, {
          action: 'security.contact_revealed',
          summary: `Sensitive contact viewed for candidate ${candidate.name}`,
          metadata: {
            candidateId: candidate.id,
            candidateName: candidate.name,
            source: 'candidate_repository',
          },
        });
      } catch {
        // Best effort only
      }
    }
  };

  useEffect(() => {
    if (isLoading) return;
    const raw = searchParams.get('candidate');
    if (!raw) return;
    const decoded = decodeURIComponent(raw).trim();
    if (!decoded) return;
    const lower = decoded.toLowerCase();
    const match = candidates.find((c) => c.name.trim().toLowerCase() === lower);
    if (match) {
      router.replace(`/candidates/${match.id}`);
    }
  }, [isLoading, searchParams, candidates, router]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setSearchRows([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    let active = true;
    const handle = setTimeout(() => {
      void searchCandidates({ query, limit: 200 })
        .then((rows) => {
          if (!active) return;
          setSearchRows(rows);
        })
        .catch(() => {
          if (!active) return;
          setSearchRows([]);
        })
        .finally(() => {
          if (!active) return;
          setIsSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [q]);

  const debouncedCustomExpMin = useDebouncedValue(customExpMin, CUSTOM_EXPERIENCE_DEBOUNCE_MS);
  const debouncedCustomExpMax = useDebouncedValue(customExpMax, CUSTOM_EXPERIENCE_DEBOUNCE_MS);

  const appliedCustomExperienceBounds = useMemo(
    () => ({
      minYears: parseCustomExperienceBound(debouncedCustomExpMin),
      maxYears: parseCustomExperienceBound(debouncedCustomExpMax),
    }),
    [debouncedCustomExpMin, debouncedCustomExpMax],
  );

  const isCustomExperiencePending =
    experienceFilter === 'custom' &&
    (customExpMin !== debouncedCustomExpMin || customExpMax !== debouncedCustomExpMax);

  const experienceFilterActive =
    (experienceFilter !== '' && experienceFilter !== 'custom') ||
    (experienceFilter === 'custom' && isCustomExperienceFilterActive(appliedCustomExperienceBounds));

  const periodFilterActive = periodFilter !== '';
  const hasActiveFilters = q.trim().length > 0 || experienceFilterActive || periodFilterActive;

  useEffect(() => {
    if (!periodFilterActive) {
      setSelectedPeriodRecruiter(null);
    }
  }, [periodFilterActive]);

  const indexedCandidates = useMemo(() => indexCandidatesByExperience(candidates), [candidates]);
  const indexedSearchRows = useMemo(() => indexCandidatesByExperience(searchRows), [searchRows]);

  const { candidateRows, totalFilteredCount, filteredRowsForStats } = useMemo(() => {
    const query = q.trim();
    const source = query ? indexedSearchRows : indexedCandidates;
    const bounds = experienceFilter === 'custom' ? appliedCustomExperienceBounds : undefined;
    const byExperience = filterIndexedCandidatesByExperience(source, experienceFilter, bounds);
    const cutoff = periodCutoff(periodFilter);
    const filtered = cutoff
      ? byExperience.filter((c) => {
          const ts = Date.parse(c.createdAt);
          return Number.isFinite(ts) && ts >= cutoff.getTime();
        })
      : byExperience;
    const recruiterFiltered =
      selectedPeriodRecruiter && periodFilterActive
        ? filtered.filter((c) => recruiterDisplay(c) === selectedPeriodRecruiter)
        : filtered;
    const totalFilteredCount = recruiterFiltered.length;
    const limited =
      hasActiveFilters && recruiterFiltered.length > REPOSITORY_DISPLAY_LIMIT
        ? recruiterFiltered.slice(0, REPOSITORY_DISPLAY_LIMIT)
        : hasActiveFilters
          ? recruiterFiltered
          : recruiterFiltered.slice(0, 10);
    return { candidateRows: limited, totalFilteredCount, filteredRowsForStats: filtered };
  }, [
    appliedCustomExperienceBounds,
    experienceFilter,
    hasActiveFilters,
    indexedCandidates,
    indexedSearchRows,
    periodFilter,
    q,
    selectedPeriodRecruiter,
  ]);

  const candidatePeriodStats = useMemo(() => {
    const recruiterCounts = new Map<string, number>();
    for (const c of filteredRowsForStats) {
      const recruiter = recruiterDisplay(c);
      recruiterCounts.set(recruiter, (recruiterCounts.get(recruiter) ?? 0) + 1);
    }
    return {
      total: filteredRowsForStats.length,
      recruiters: Array.from(recruiterCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }, [filteredRowsForStats]);

  const onToggleCandidate = (candidateId: string, checked: boolean) => {
    if (requirementId && hasSubmissionForJd(candidateId, requirementId)) return;
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  };

  const onToggleAllCandidates = (checked: boolean) => {
    setSelectedCandidateIds(() => {
      if (!checked) return new Set();
      return new Set(
        candidateRows
          .filter((c) => !requirementId || !hasSubmissionForJd(c.id, requirementId))
          .map((c) => c.id),
      );
    });
  };

  const selectedCount = selectedCandidateIds.size;
  const selectableCandidateCount = requirementId
    ? candidateRows.filter((c) => !hasSubmissionForJd(c.id, requirementId)).length
    : candidateRows.length;

  return (
    <div className="space-y-6">
      <PageBackNav />
      <PageHeader
        title="Candidate Repository"
        subtitle={
          isRequirementSelectMode
            ? 'Select one or more candidates from your internal database to submit to this requirement'
            : 'All candidates from internal database and requirement-linked submissions'
        }
      />

      {isRequirementSelectMode && workBlockReason ? (
        <RequirementViewOnlyBanner message={workBlockReason} />
      ) : null}

      {isRequirementSelectMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          <span>
            Selecting for:{' '}
            <strong>
              {activeRequirement?.jdCode || requirementId}
              {activeRequirement?.jobTitle ? ` — ${activeRequirement.jobTitle}` : ''}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedCandidateIds(new Set());
              router.push('/candidates');
            }}
            className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950 dark:text-emerald-300"
          >
            Change requirement
          </button>
        </div>
      ) : null}

      <FilterBar
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder={
          isRequirementSelectMode
            ? 'Search by name, email, phone, skills, technology, company, or candidate id'
            : 'Search by name, email, phone, skills, technology, company, location, or candidate id'
        }
        right={
          <div className="flex w-full flex-col gap-2 md:w-auto">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">Submitted period</span>
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value as CandidatePeriodFilter)}
                  className="h-11 min-w-[9rem] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm transition outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
                  aria-label="Filter by submitted period"
                >
                  {CANDIDATE_PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">Total experience</span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={experienceFilter}
                    onChange={(e) => {
                      const next = e.target.value as ExperienceRangeFilter;
                      setExperienceFilter(next);
                      if (next !== 'custom') {
                        setCustomExpMin('');
                        setCustomExpMax('');
                      }
                    }}
                    className="h-11 min-w-[11rem] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm transition outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
                    aria-label="Filter by total experience"
                  >
                    <option value="">All experience</option>
                    <option value="custom">Custom range</option>
                    <option value="0-2">0–2 years</option>
                    <option value="2-5">2–5 years</option>
                    <option value="5-8">5–8 years</option>
                    <option value="8-10">8–10 years</option>
                    <option value="10+">10+ years</option>
                  </select>
                  {experienceFilter === 'custom' ? (
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor="exp-min-years">
                        Minimum years of experience
                      </label>
                      <input
                        id="exp-min-years"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={customExpMin}
                        onChange={(e) => setCustomExpMin(e.target.value)}
                        placeholder="Min"
                        className="h-11 w-20 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm transition outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
                      />
                      <span className="text-sm text-gray-500 dark:text-zinc-400">–</span>
                      <label className="sr-only" htmlFor="exp-max-years">
                        Maximum years of experience
                      </label>
                      <input
                        id="exp-max-years"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={customExpMax}
                        onChange={(e) => setCustomExpMax(e.target.value)}
                        placeholder="Max"
                        className="h-11 w-20 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm transition outline-none focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
                      />
                      <span className="text-sm text-gray-600 dark:text-zinc-400">yrs</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        }
      />

      {periodFilterActive ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-100">
          <button
            type="button"
            onClick={() => setSelectedPeriodRecruiter(null)}
            className={`rounded-full px-2.5 py-1 font-semibold transition ${
              selectedPeriodRecruiter
                ? 'text-indigo-800 hover:bg-white/70 hover:text-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-950/60'
                : 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
            }`}
            title="Show all recruiters in selected period"
          >
            Total in selected period: {candidatePeriodStats.total}
          </button>
          {candidatePeriodStats.recruiters.map((row) => (
            <button
              key={row.name}
              type="button"
              onClick={() => setSelectedPeriodRecruiter((current) => (current === row.name ? null : row.name))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                selectedPeriodRecruiter === row.name
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm dark:border-indigo-400 dark:bg-indigo-500'
                  : 'border-indigo-200 bg-white text-indigo-800 hover:border-indigo-400 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/60'
              }`}
              title={`Show candidates created by ${row.name}`}
            >
              {row.name}: {row.count}
            </button>
          ))}
        </div>
      ) : null}

      {isRequirementSelectMode ? (
        <div className="space-y-3">
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-950">
            <div className={periodFilterActive ? 'max-h-[650px] overflow-auto' : 'overflow-x-auto'}>
              <table className="w-full text-left text-sm">
                <thead className={`${periodFilterActive ? 'sticky top-0 z-10 ' : ''}border-b border-gray-200 bg-gray-50 text-xs tracking-wide text-gray-600 uppercase dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300`}>
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectableCandidateCount > 0 && selectedCount === selectableCandidateCount}
                        onChange={(e) => onToggleAllCandidates(e.target.checked)}
                        disabled={!canWorkOnRequirement || selectableCandidateCount === 0}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                        aria-label="Select all candidates on this page"
                      />
                    </th>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Technology</th>
                    <th className="px-4 py-3">Total Experience</th>
                    <th className="px-4 py-3">Created By</th>
                    <th className="px-4 py-3">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateRows.map((c: Candidate) => {
                    const submissionStage = requirementId ? getSubmissionStageForJd(c.id, requirementId) : 'none';
                    const alreadySubmitted = submissionStage === 'client';
                    const stageBadge =
                      submissionStage === 'lead'
                        ? 'Submitted to Lead'
                        : submissionStage === 'client'
                          ? 'Submitted to Client'
                          : null;
                    return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-200/70 last:border-b-0 hover:bg-gray-50/60 dark:border-zinc-800/70 dark:hover:bg-zinc-900/30"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedCandidateIds.has(c.id)}
                          onChange={(e) => onToggleCandidate(c.id, e.target.checked)}
                          disabled={!canWorkOnRequirement || alreadySubmitted}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                          aria-label={alreadySubmitted ? `${c.name} already submitted` : `Select ${c.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-zinc-50">
                            {c.name}
                          </span>
                          {stageBadge ? (
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              submissionStage === 'lead'
                                ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300'
                                : 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300'
                            }`}>
                              {stageBadge}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                          {displayCandidateRepositoryNumber(c)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{isContactVisible(c.id) ? (c.email || '—') : maskEmail(c.email)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{isContactVisible(c.id) ? (c.phone || '—') : maskPhone(c.phone)}</span>
                          <button
                            type="button"
                            onClick={() => void toggleContactVisibility(c)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            aria-label={isContactVisible(c.id) ? `Hide contact for ${c.name}` : `Show contact for ${c.name}`}
                            title={isContactVisible(c.id) ? 'Hide contact' : 'Show contact'}
                          >
                            {isContactVisible(c.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">{technologySummary(c)}</td>
                      <td className="px-4 py-3">{totalExperienceLabel(c)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-zinc-50">
                          {recruiterDisplay(c)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/candidates/${encodeURIComponent(c.id)}`}
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                  {!isSearching && candidateRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-600 dark:text-zinc-400">
                        No candidates found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile list */}
          <div className="space-y-3 md:hidden">
            {candidateRows.map((c) => {
              const submissionStage = requirementId ? getSubmissionStageForJd(c.id, requirementId) : 'none';
              const alreadySubmitted = submissionStage === 'client';
              const stageBadge =
                submissionStage === 'lead'
                  ? 'Submitted to Lead'
                  : submissionStage === 'client'
                    ? 'Submitted to Client'
                    : null;
              return (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedCandidateIds.has(c.id)}
                    onChange={(e) => onToggleCandidate(c.id, e.target.checked)}
                    disabled={!canWorkOnRequirement || alreadySubmitted}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-zinc-50">{c.name}</span>
                      {stageBadge ? (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          submissionStage === 'lead'
                            ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300'
                            : 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300'
                        }`}>
                          {stageBadge}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                      {displayCandidateRepositoryNumber(c)}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
                      <span>{isContactVisible(c.id) ? (c.email || '—') : maskEmail(c.email)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
                      <span>{isContactVisible(c.id) ? (c.phone || '—') : maskPhone(c.phone)}</span>
                      <button
                        type="button"
                        onClick={() => void toggleContactVisibility(c)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        aria-label={isContactVisible(c.id) ? `Hide contact for ${c.name}` : `Show contact for ${c.name}`}
                        title={isContactVisible(c.id) ? 'Hide contact' : 'Show contact'}
                      >
                        {isContactVisible(c.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="mt-2 text-sm text-gray-700 dark:text-zinc-300">
                      <span className="font-medium">Technology:</span> {technologySummary(c)}
                    </div>
                    <div className="mt-1 text-sm text-gray-700 dark:text-zinc-300">
                      <span className="font-medium">Total Experience:</span> {totalExperienceLabel(c)}
                    </div>
                    <div className="mt-1 text-sm text-gray-700 dark:text-zinc-300">
                      <span className="font-medium">Created By:</span> {recruiterDisplay(c)}
                    </div>
                    <div className="mt-3">
                      <Link
                        href={`/candidates/${encodeURIComponent(c.id)}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                </label>
              </div>
              );
            })}
            {!isSearching && candidateRows.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                No candidates found.
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-950">
            <div className={periodFilterActive ? 'max-h-[650px] overflow-auto' : 'overflow-x-auto'}>
              <table className="w-full text-left text-sm">
                <thead className={`${periodFilterActive ? 'sticky top-0 z-10 ' : ''}border-b border-gray-200 bg-gray-50 text-xs tracking-wide text-gray-600 uppercase dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300`}>
                  <tr>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Technology</th>
                    <th className="px-4 py-3">Total Experience</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Created By</th>
                    <th className="px-4 py-3">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateRows.map((c: Candidate) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-200/70 last:border-b-0 hover:bg-gray-50/60 dark:border-zinc-800/70 dark:hover:bg-zinc-900/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 dark:text-zinc-50">{c.name}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                          {displayCandidateRepositoryNumber(c)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{isContactVisible(c.id) ? (c.email || '—') : maskEmail(c.email)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{isContactVisible(c.id) ? (c.phone || '—') : maskPhone(c.phone)}</span>
                          <button
                            type="button"
                            onClick={() => void toggleContactVisibility(c)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            aria-label={isContactVisible(c.id) ? `Hide contact for ${c.name}` : `Show contact for ${c.name}`}
                            title={isContactVisible(c.id) ? 'Hide contact' : 'Show contact'}
                          >
                            {isContactVisible(c.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">{technologySummary(c)}</td>
                      <td className="px-4 py-3">{totalExperienceLabel(c)}</td>
                      <td className="px-4 py-3">
                        {formatCandidateSubmissionDate(c)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-zinc-50">
                          {recruiterDisplay(c)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/candidates/${encodeURIComponent(c.id)}`}
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!isSearching && candidateRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-600 dark:text-zinc-400">
                        No candidates found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isRequirementSelectMode && canWorkOnRequirement ? (
        <div className="sticky bottom-4 z-40">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg dark:border-blue-900/50 dark:bg-blue-950/30 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {selectedCount === 0 ? 'Select candidates to submit.' : `${selectedCount} candidate(s) selected`}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setSelectedCandidateIds(new Set())}
                className="h-11 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200 dark:hover:bg-zinc-900"
                disabled={selectedCount === 0}
              >
                Clear
              </button>
              <Link
                href={`/requirements/${encodeURIComponent(requirementId)}/add-submission?candidateIds=${encodeURIComponent(
                  Array.from(selectedCandidateIds).join(','),
                )}`}
                className={`inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 ${
                  selectedCount === 0 ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                Submit to Lead
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      {isSearching || isCustomExperiencePending ? (
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          {isSearching ? 'Searching candidates…' : 'Updating experience filter…'}
        </p>
      ) : null}
      {!isSearching &&
      !isCustomExperiencePending &&
      hasActiveFilters &&
      totalFilteredCount > REPOSITORY_DISPLAY_LIMIT ? (
        <p className="text-sm text-gray-500 dark:text-zinc-400">
          Showing {REPOSITORY_DISPLAY_LIMIT} of {totalFilteredCount} matches. Refine search or experience
          range to narrow results.
        </p>
      ) : null}
    </div>
  );
}
