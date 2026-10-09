'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FileSpreadsheet,
  FileText,
  FileDown,
  Users,
  Briefcase,
  Target,
  TrendingUp,
  BarChart3,
  Download,
  ChevronDown,
  Check,
} from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';

import { ChartCard } from '@/components/ui/ChartCard';
import { Field, Select } from '@/components/ui/Field';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getSubmissions } from '@/lib/api/submissions';
import type { Submission } from '@/lib/domain/submissions/types';
import type { ReportFilters, ReportPeriodType } from '@/lib/domain/reports/types';
import { aggregateAdminReport, aggregateRecruiterReport } from '@/lib/domain/reports/reportAggregationController';
import { buildReportSearchQuery } from '@/lib/domain/reports/searchQueryBuilder';
import {
  exportAdminReportToCSV,
  exportAdminReportToExcel,
  exportAdminReportToPDF,
  exportRecruiterReportToCSV,
  exportRecruiterReportToExcel,
  exportRecruiterReportToPDF,
} from '@/lib/domain/reports/exportController';
import { cn } from '@/lib/utils/cn';

const palette = {
  slate: '#64748b',
  blue: '#2563eb',
  indigo: '#4f46e5',
  amber: '#d97706',
  green: '#16a34a',
  red: '#dc2626',
  gray: '#6b7280',
};

const STATUS_OPTIONS = [
  'All',
  'Unassigned',
  'Assigned',
  'Submitted',
  'Interview',
  'Selected',
  'Rejected',
  'Closed',
];

const PERIOD_OPTIONS: { value: ReportPeriodType; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

function defaultFilters(): ReportFilters {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    periodType: 'month',
    status: 'All',
  };
}

type ReportMode = 'client' | 'recruiter';

function parseMode(raw: string | null): ReportMode {
  return raw === 'recruiter' ? 'recruiter' : 'client';
}

export function ReportGenerationPage() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = parseMode(params.get('mode'));
  const { theme } = useTheme();
  const { currentUser, recruiters } = useAuth();
  const { requirements, refresh: refreshRequirements } = useRequirementsStore();
  const [teamSubmissions, setTeamSubmissions] = useState<Submission[]>([]);

  useEffect(() => {
    void refreshRequirements({ limit: 500 });
    let cancelled = false;
    (async () => {
      try {
        const rows = await getSubmissions({ scope: 'team', limit: 500 });
        if (!cancelled) setTeamSubmissions(rows);
      } catch (e) {
        console.error('Failed to load team submissions for reports', e);
        if (!cancelled) setTeamSubmissions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshRequirements]);

  const reportSubmissions = useMemo(
    () =>
      teamSubmissions.map((s) => ({
        id: s.id,
        candidateId: s.candidate?.id,
        jdId: s.requirement?.id,
        candidate: s.candidate,
        requirement: s.requirement,
        submittedBy: s.submittedBy,
        submittedOn: s.submittedOn,
        status: s.status,
      })),
    [teamSubmissions],
  );

  const isClient = typeof window !== 'undefined';
  const isDark = theme === 'dark';
  const chartStroke = isDark ? '#94a3b8' : '#64748b';
  const chartText = isDark ? '#e2e8f0' : '#334155';

  const [filters, setFilters] = useState<ReportFilters>(defaultFilters);
  const [searchJobId, setSearchJobId] = useState('');
  const [filterRecruiterId, setFilterRecruiterId] = useState('');
  const [filterCompanyName, setFilterCompanyName] = useState('');
  const [recruiterSearch, setRecruiterSearch] = useState('');
  const [filterClientName, setFilterClientName] = useState('');
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [reportSectionExpanded, setReportSectionExpanded] = useState(false);

  const [selectedRecruiterId, setSelectedRecruiterId] = useState('');

  React.useEffect(() => {
    if (currentUser && selectedRecruiterId === '') {
      setSelectedRecruiterId(currentUser.id);
    }
  }, [currentUser, selectedRecruiterId]);

  const setMode = useCallback(
    (nextMode: ReportMode) => {
      const sp = new URLSearchParams(params.toString());
      sp.set('mode', nextMode);
      router.push(`/reports/generate?${sp.toString()}`);
    },
    [params, router],
  );

  const composedFilters = useMemo<ReportFilters>(
    () => ({
      ...filters,
      recruiterId: mode === 'client' && filterRecruiterId ? filterRecruiterId : undefined,
      clientName:
        mode === 'recruiter'
          ? (filterClientName || undefined)
          : (filterCompanyName || undefined),
      jobId: searchJobId || undefined,
    }),
    [filters, mode, filterRecruiterId, filterClientName, filterCompanyName, searchJobId],
  );

  const searchQuery = useMemo(
    () =>
      buildReportSearchQuery({
        jobId: searchJobId || undefined,
        clientName: mode === 'client' ? (filterCompanyName || undefined) : (filterClientName || undefined),
        recruiterId: mode === 'client' ? (filterRecruiterId || undefined) : undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
        status: filters.status !== 'All' ? filters.status : undefined,
      }),
    [
      searchJobId,
      filterCompanyName,
      filterClientName,
      filterRecruiterId,
      filters.startDate,
      filters.endDate,
      filters.status,
      mode,
    ],
  );

  const adminAggregate = useMemo(() => {
    if (mode !== 'client') return null;
    return aggregateAdminReport(
      requirements,
      reportSubmissions,
      recruiters,
      composedFilters,
      searchQuery,
    );
  }, [mode, requirements, reportSubmissions, recruiters, composedFilters, searchQuery]);

  const recruiterAggregate = useMemo(() => {
    if (mode !== 'recruiter' || !selectedRecruiterId) return null;
    return aggregateRecruiterReport(
      requirements,
      reportSubmissions,
      selectedRecruiterId,
      composedFilters,
      searchQuery,
    );
  }, [mode, requirements, reportSubmissions, selectedRecruiterId, composedFilters, searchQuery]);

  const uniqueClientNames = useMemo(() => {
    const names = new Set(requirements.map((r) => r.clientLeadPoc).filter(Boolean));
    return Array.from(names).sort();
  }, [requirements]);

  const activeRecruiters = useMemo(
    () => recruiters.filter((r) => (r as any).isActive !== false),
    [recruiters],
  );

  const filteredRecruiters = useMemo(() => {
    const q = recruiterSearch.trim().toLowerCase();
    if (!q) return activeRecruiters;
    return activeRecruiters.filter((r) =>
      `${r.name ?? ''} ${r.email ?? ''}`.toLowerCase().includes(q),
    );
  }, [activeRecruiters, recruiterSearch]);

  const handleExportExcel = useCallback(() => {
    if (mode === 'client' && adminAggregate) exportAdminReportToExcel(adminAggregate, 'Admin_Report');
    if (mode === 'recruiter' && recruiterAggregate)
      exportRecruiterReportToExcel(recruiterAggregate.requirementRows, 'Recruiter_Report');
  }, [mode, adminAggregate, recruiterAggregate]);

  const handleExportCSV = useCallback(() => {
    if (mode === 'client' && adminAggregate) exportAdminReportToCSV(adminAggregate, 'Admin_Report');
    if (mode === 'recruiter' && recruiterAggregate)
      exportRecruiterReportToCSV(recruiterAggregate.requirementRows, 'Recruiter_Report');
  }, [mode, adminAggregate, recruiterAggregate]);

  const handleExportPDF = useCallback(() => {
    if (mode === 'client' && adminAggregate) exportAdminReportToPDF(adminAggregate);
    if (mode === 'recruiter' && recruiterAggregate) {
      const recruiter = recruiters.find((r) => r.id === selectedRecruiterId);
      const profile = {
        name: recruiter?.name ?? 'Unknown',
        email: recruiter?.email ?? '',
        role: recruiter?.title ?? '',
      };
      exportRecruiterReportToPDF(profile, {
        requirementsAssigned: recruiterAggregate.requirementsAssigned,
        candidatesSubmitted: recruiterAggregate.candidatesSubmitted,
        submissionSuccessRate: recruiterAggregate.submissionSuccessRate,
        openJobsHandled: recruiterAggregate.openJobsHandled,
        closedJobsHandled: recruiterAggregate.closedJobsHandled,
      });
    }
  }, [mode, adminAggregate, recruiterAggregate, selectedRecruiterId, recruiters]);

  const handlePieSegmentClick = useCallback(
    (data: { status: string }) => {
      router.push(`/requirements?status=${encodeURIComponent(data.status)}`);
    },
    [router],
  );

  const handleRecruiterBarClick = useCallback(
    (data: { payload?: unknown }) => {
      const recruiterId = (data.payload as { recruiterId: string } | undefined)?.recruiterId;
      if (!recruiterId) return;
      router.push(
        `/requirements?recruiter=${encodeURIComponent(recruiterId)}&status=All`,
      );
    },
    [router],
  );

  const handleClientBarClick = useCallback(
    (data: { payload?: unknown }) => {
      const clientName = (data.payload as { clientName: string } | undefined)?.clientName;
      if (!clientName) return;
      router.push(`/requirements?client=${encodeURIComponent(clientName)}`);
    },
    [router],
  );

  const handleTrendLineClick = useCallback(
    (dataKey: string) => {
      if (dataKey === 'requirements') router.push('/requirements');
      else if (dataKey === 'submissions') router.push('/submissions');
    },
    [router],
  );

  const chartMax = useMemo(() => {
    if (!recruiterAggregate) return 1;
    const req = Math.max(...recruiterAggregate.personalTrend.map((d) => d.requirements), 1);
    const sub = Math.max(...recruiterAggregate.personalTrend.map((d) => d.submissions), 1);
    return Math.max(req, sub, 1);
  }, [recruiterAggregate]);

  const recruiterByStatus = useMemo(() => {
    if (!recruiterAggregate) return [];
    const map = new Map<string, number>();
    for (const row of recruiterAggregate.requirementRows) {
      const key = row.status || 'Unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [recruiterAggregate]);

  const recruiterTopClients = useMemo(() => {
    if (!recruiterAggregate) return [];
    const map = new Map<string, { clientName: string; requirements: number; submissions: number }>();
    for (const row of recruiterAggregate.requirementRows) {
      const name = (row.clientName || 'Unknown').trim().replace(/\s+/g, ' ').toUpperCase();
      const prev = map.get(name) ?? { clientName: name, requirements: 0, submissions: 0 };
      prev.requirements += 1;
      prev.submissions += row.submissionsCount ?? 0;
      map.set(name, prev);
    }
    return Array.from(map.values())
      .sort((a, b) => b.submissions - a.submissions || b.requirements - a.requirements)
      .slice(0, 8);
  }, [recruiterAggregate]);

  const handleRecruiterStatusClick = useCallback(
    (data: { status: string }) => {
      const status = data.status === 'Unassigned' ? 'Unassigned' : data.status;
      router.push(
        `/requirements?recruiter=${encodeURIComponent(selectedRecruiterId)}&status=${encodeURIComponent(status)}`,
      );
    },
    [router, selectedRecruiterId],
  );

  const handleRecruiterClientClick = useCallback(
    (data: { payload?: unknown }) => {
      const clientName = (data.payload as { clientName: string } | undefined)?.clientName;
      if (!clientName) return;
      router.push(
        `/requirements?recruiter=${encodeURIComponent(selectedRecruiterId)}&client=${encodeURIComponent(
          clientName,
        )}`,
      );
    },
    [router, selectedRecruiterId],
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <PageBackNav />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-zinc-50 sm:text-3xl">
            Report Generation
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
            Detailed analytics with filters, charts, and export options
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-xl border border-gray-200 bg-gray-50/50 p-1 dark:border-zinc-800 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={() => setMode('recruiter')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition',
              mode === 'recruiter'
                ? 'bg-white text-indigo-700 shadow-sm dark:bg-zinc-800 dark:text-indigo-300'
                : 'text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            <Users className="h-4 w-4" />
            Recruiter
          </button>
          <button
            type="button"
            onClick={() => setMode('client')}
            className={cn(
              'flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition',
              mode === 'client'
                ? 'bg-white text-indigo-700 shadow-sm dark:bg-zinc-800 dark:text-indigo-300'
                : 'text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            <Briefcase className="h-4 w-4" />
            Client
          </button>
        </div>
      </div>

      {/* Report Generation: Collapsible Filters + Export */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          onClick={() => setReportSectionExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-gray-50/50 dark:hover:bg-zinc-900/30 sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">
              Report Generation
            </h2>
            <span className="hidden truncate text-sm text-gray-500 dark:text-zinc-400 sm:inline">
              {mode === 'client'
                ? 'Filter by date, status, recruiter'
                : 'Filter by date, status, client'}
            </span>
            {filtersApplied && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Filters applied
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-gray-500 transition dark:text-zinc-400',
              reportSectionExpanded && 'rotate-180',
            )}
          />
        </button>

        {reportSectionExpanded && (
        <div className="space-y-6 border-t border-gray-200 p-6 dark:border-zinc-800">
          {/* Filters - refined for Client vs Recruiter */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="From Date">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="To Date">
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={filters.status ?? 'All'}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Chart Grouping">
                <Select
                  value={filters.periodType}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, periodType: e.target.value as ReportPeriodType }))
                  }
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={mode === 'recruiter' ? 'Recruiter' : 'Recruiter (optional)'}>
                <input
                  type="text"
                  placeholder="Search recruiter..."
                  value={recruiterSearch}
                  onChange={(e) => setRecruiterSearch(e.target.value)}
                  className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <select
                  value={mode === 'recruiter' ? selectedRecruiterId : filterRecruiterId}
                  onChange={(e) => {
                    if (mode === 'recruiter') setSelectedRecruiterId(e.target.value);
                    else setFilterRecruiterId(e.target.value);
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {mode === 'client' ? <option value="">All recruiters</option> : null}
                  {filteredRecruiters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.email}
                    </option>
                  ))}
                </select>
              </Field>
              {mode === 'client' ? (
                <>
                  <Field label="Client (Company Name)">
                    <input
                      type="text"
                      placeholder="Type company name..."
                      value={filterCompanyName}
                      onChange={(e) => setFilterCompanyName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Client (optional)">
                    <select
                      value={filterClientName}
                      onChange={(e) => setFilterClientName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">All clients</option>
                      {uniqueClientNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              <Field label="Requirement ID (optional)">
                <input
                  type="text"
                  placeholder="e.g. REQ-001"
                  value={searchJobId}
                  onChange={(e) => setSearchJobId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </Field>
            </div>
          </div>

          {/* Apply Filters + Export */}
          <div className="flex flex-col gap-4 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setFiltersApplied(true)}
              className="inline-flex items-center gap-2 self-start rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Check className="h-4 w-4" />
              Apply Filters
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => filtersApplied && setExportMenuOpen((v) => !v)}
                disabled={!filtersApplied}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition',
                  filtersApplied
                    ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                    : 'cursor-not-allowed bg-gray-200 text-gray-500 dark:bg-zinc-700 dark:text-zinc-500',
                )}
              >
                <Download className="h-4 w-4" />
                Export Report
                <ChevronDown className="h-4 w-4" />
              </button>
              {exportMenuOpen && filtersApplied && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setExportMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                    <button
                      type="button"
                      onClick={() => {
                        handleExportExcel();
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 transition hover:bg-gray-50 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      Export as Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleExportCSV();
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 transition hover:bg-gray-50 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
                    >
                      <FileDown className="h-4 w-4 text-blue-600" />
                      Export as CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleExportPDF();
                        setExportMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 transition hover:bg-gray-50 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
                    >
                      <FileText className="h-4 w-4 text-rose-600" />
                      Export as PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {!filtersApplied && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Apply filters above to enable report export.
            </p>
          )}
        </div>
        )}
      </section>

      {/* KPI Summary Cards */}
      {mode === 'client' && adminAggregate && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Req Sent</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {adminAggregate.totalRequirementsSent}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Assigned</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {adminAggregate.totalRequirementsAssigned}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Submissions</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {adminAggregate.totalCandidatesSubmitted}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Ratio</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {adminAggregate.submissionRatioPerRequirement.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Open</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {adminAggregate.openRequirements}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Closed</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {adminAggregate.closedRequirements}
            </div>
          </div>
        </div>
      )}

      {mode === 'recruiter' && recruiterAggregate && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Assigned</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {recruiterAggregate.requirementsAssigned}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Submissions</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {recruiterAggregate.candidatesSubmitted}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Success %</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {recruiterAggregate.submissionSuccessRate}%
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Open Jobs</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {recruiterAggregate.openJobsHandled}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">Closed Jobs</span>
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-zinc-50">
              {recruiterAggregate.closedJobsHandled}
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid - All charts visible */}
      {mode === 'client' && adminAggregate && (
        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-50">Analytics Dashboard</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard
              title="Requirements by Status"
              subtitle="Click a segment to view requirements with that status."
            >
              <div className="h-[280px] min-h-[280px]">
                {isClient ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart style={{ cursor: 'pointer' }}>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                          borderRadius: '8px',
                          color: chartText,
                        }}
                      />
                      <Legend wrapperStyle={{ color: chartText }} />
                      <Pie
                        data={adminAggregate.byStatus}
                        dataKey="count"
                        nameKey="status"
                        outerRadius={90}
                        paddingAngle={2}
                        onClick={handlePieSegmentClick}
                      >
                        {adminAggregate.byStatus.map((entry, i) => {
                          const colors = [
                            palette.blue,
                            palette.indigo,
                            palette.amber,
                            palette.green,
                            palette.red,
                            palette.slate,
                            palette.gray,
                          ];
                          return <Cell key={entry.status} fill={colors[i % colors.length]} />;
                        })}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-xl border border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/40" />
                )}
              </div>
            </ChartCard>

            <ChartCard
              title="Trend (Requirements & Submissions)"
              subtitle="Click a line to view requirements or submissions."
            >
              <div className="h-[280px] min-h-[280px]">
                {isClient ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={adminAggregate.trendBuckets} style={{ cursor: 'pointer' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartStroke} strokeOpacity={0.3} />
                      <XAxis dataKey="label" tick={{ fill: chartText }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: chartText }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                          borderRadius: '8px',
                          color: chartText,
                        }}
                      />
                      <Legend wrapperStyle={{ color: chartText }} />
                      <Line
                        type="monotone"
                        dataKey="requirements"
                        name="Requirements"
                        stroke={palette.blue}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        onClick={() => handleTrendLineClick('requirements')}
                      />
                      <Line
                        type="monotone"
                        dataKey="submissions"
                        name="Submissions"
                        stroke={palette.green}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        onClick={() => handleTrendLineClick('submissions')}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-xl border border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/40" />
                )}
              </div>
            </ChartCard>

            <ChartCard
              title="Recruiter Performance"
              subtitle="Click a bar to view that recruiter's requirements."
            >
              <div className="h-[280px] min-h-[280px]">
                {isClient ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={adminAggregate.recruiterPerformance}
                      margin={{ left: 8, right: 8 }}
                      style={{ cursor: 'pointer' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartStroke} strokeOpacity={0.3} />
                      <XAxis dataKey="recruiterName" tick={{ fill: chartText }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: chartText }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                          borderRadius: '8px',
                          color: chartText,
                        }}
                      />
                      <Legend wrapperStyle={{ color: chartText }} />
                      <Bar
                        dataKey="candidatesSubmitted"
                        name="Submissions"
                        fill={palette.indigo}
                        radius={[8, 8, 0, 0]}
                        onClick={handleRecruiterBarClick}
                      />
                      <Bar
                        dataKey="requirementsAssigned"
                        name="Req Assigned"
                        fill={palette.blue}
                        radius={[8, 8, 0, 0]}
                        onClick={handleRecruiterBarClick}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-xl border border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/40" />
                )}
              </div>
            </ChartCard>

            <ChartCard
              title="Client Performance"
              subtitle="Click a bar to view that client's requirements."
            >
              <div className="h-[280px] min-h-[280px]">
                {isClient ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={adminAggregate.clientPerformance}
                      margin={{ left: 8, right: 8 }}
                      style={{ cursor: 'pointer' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartStroke} strokeOpacity={0.3} />
                      <XAxis dataKey="clientName" tick={{ fill: chartText }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: chartText }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#1e293b' : '#ffffff',
                          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                          borderRadius: '8px',
                          color: chartText,
                        }}
                      />
                      <Legend wrapperStyle={{ color: chartText }} />
                      <Bar
                        dataKey="candidatesSubmitted"
                        name="Submissions"
                        fill={palette.green}
                        radius={[8, 8, 0, 0]}
                        onClick={handleClientBarClick}
                      />
                      <Bar
                        dataKey="requirementsSent"
                        name="Req Sent"
                        fill={palette.slate}
                        radius={[8, 8, 0, 0]}
                        onClick={handleClientBarClick}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full w-full rounded-xl border border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/40" />
                )}
              </div>
            </ChartCard>
          </div>
        </section>
      )}

      {mode === 'recruiter' && recruiterAggregate && (
        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-50">Recruiter Analytics</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard
              title="Personal Performance Trend"
              subtitle="Requirements vs Submissions over time."
            >
              <div className="w-full min-h-[280px]" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height={280} minHeight={280}>
                  <BarChart
                    key={`${filters.periodType}-${filters.startDate}-${filters.endDate}-${selectedRecruiterId}`}
                    data={recruiterAggregate.personalTrend}
                    margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: chartText }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      domain={[0, Math.max(1, Math.ceil(chartMax * 1.1))]}
                      tick={{ fontSize: 11, fill: chartText }}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ color: chartText }} />
                    <Bar
                      dataKey="requirements"
                      name="Requirements"
                      fill={palette.blue}
                      radius={[8, 8, 0, 0]}
                    />
                    <Bar
                      dataKey="submissions"
                      name="Submissions"
                      fill={palette.green}
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Requirements by Status"
              subtitle="Click a segment to view those requirements."
            >
              <div className="h-[280px] min-h-[280px]">
                {isClient ? (
                  recruiterByStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart style={{ cursor: 'pointer' }}>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                            borderRadius: '8px',
                            color: chartText,
                          }}
                        />
                        <Legend wrapperStyle={{ color: chartText }} />
                        <Pie
                          data={recruiterByStatus}
                          dataKey="count"
                          nameKey="status"
                          outerRadius={90}
                          paddingAngle={2}
                          onClick={handleRecruiterStatusClick}
                        >
                          {recruiterByStatus.map((entry, i) => {
                            const colors = [
                              palette.blue,
                              palette.indigo,
                              palette.amber,
                              palette.green,
                              palette.red,
                              palette.slate,
                              palette.gray,
                            ];
                            return <Cell key={entry.status} fill={colors[i % colors.length]} />;
                          })}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                      No data in selected range.
                    </div>
                  )
                ) : (
                  <div className="h-full w-full rounded-xl border border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/40" />
                )}
              </div>
            </ChartCard>

            <ChartCard
              title="Top Clients (Workload)"
              subtitle="Requirements vs submissions per client."
              className="lg:col-span-2"
            >
              <div className="h-[280px] min-h-[280px]">
                {isClient ? (
                  recruiterTopClients.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={recruiterTopClients}
                        margin={{ left: 8, right: 8 }}
                        style={{ cursor: 'pointer' }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartStroke} strokeOpacity={0.3} />
                        <XAxis dataKey="clientName" tick={{ fill: chartText }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: chartText }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                            borderRadius: '8px',
                            color: chartText,
                          }}
                        />
                        <Legend wrapperStyle={{ color: chartText }} />
                        <Bar
                          dataKey="submissions"
                          name="Submissions"
                          fill={palette.green}
                          radius={[8, 8, 0, 0]}
                          onClick={handleRecruiterClientClick}
                        />
                        <Bar
                          dataKey="requirements"
                          name="Requirements"
                          fill={palette.blue}
                          radius={[8, 8, 0, 0]}
                          onClick={handleRecruiterClientClick}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                      No data in selected range.
                    </div>
                  )
                ) : (
                  <div className="h-full w-full rounded-xl border border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/40" />
                )}
              </div>
            </ChartCard>
          </div>
        </section>
      )}
    </div>
  );
}
