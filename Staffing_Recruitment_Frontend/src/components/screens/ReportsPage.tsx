'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  FileText,
  Search,
  Trophy,
  Users,
  Briefcase,
  BarChart3,
  Target,
  FileCheck,
  ArrowRight,
} from 'lucide-react';

import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCandidatesStore } from '@/lib/domain/candidates/store';
import { getRecruiters } from '@/lib/api/recruiters';
import { getSubmissions } from '@/lib/api/submissions';
import { getInterviews, type InterviewRecord } from '@/lib/api/interviews';
import type { Submission } from '@/lib/domain/submissions/types';
import type { Recruiter } from '@/lib/domain/requirements/types';
import type { ReportFilters } from '@/lib/domain/reports/types';
import {
  aggregateAdminReport,
  countRecruiterLifetimeSubmissions,
  getRecruiterWorkedRequirements,
} from '@/lib/domain/reports/reportAggregationController';
import { recruiterOwnsRequirement } from '@/lib/domain/requirements/logic';
import { buildReportSearchQuery } from '@/lib/domain/reports/searchQueryBuilder';
import {
  computeRecruiterTaskSummary,
  computeTeamTaskOverview,
  type RecruiterTaskSummary,
} from '@/lib/domain/performance/teamWorkTasks';
import { cn } from '@/lib/utils/cn';
import { useCardMetrics } from '@/lib/hooks/useCardMetrics';
import { canDrillDownClientReports, canDrillDownReports } from '@/lib/auth/roles';
import {
  buildClientReportDrillDownHref,
  type ClientReportMetric,
} from '@/lib/navigation/clientReportDrillDown';
import {
  summarizeRecruiterInterviews,
  type RecruiterInterviewStatusSummary,
} from '@/lib/domain/reports/recruiterInterviewStatusSummary';

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

const PAGE_SIZE = 10;

type RecruiterPerformance = {
  recruiter: {
    id: string;
    name?: string;
    email?: string;
    title?: string;
  };
  totalRequirements: number;
  totalSubmissions: number;
  interviewStatus: RecruiterInterviewStatusSummary;
  taskSummary: RecruiterTaskSummary;
};

function safeRecruiterName(
  r: RecruiterPerformance['recruiter'] | undefined,
): string {
  return (r?.name ?? r?.email ?? '').toString();
}

const interviewStatusLinkClass =
  'tabular-nums font-semibold text-indigo-600 transition hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300';

function renderTotalInterviewCount(
  summary: RecruiterInterviewStatusSummary,
  drillDownEnabled: boolean,
  recruiterLabel: string,
  onNavigate: (href: string) => void,
) {
  const count = summary.submissionTotal;
  if (count === 0) {
    return <span className="text-gray-400 dark:text-zinc-500">—</span>;
  }

  if (drillDownEnabled) {
    return (
      <button
        type="button"
        onClick={() => onNavigate(summary.submissionTotalHref)}
        className={interviewStatusLinkClass}
        title={`View interview-stage submissions for ${recruiterLabel}`}
      >
        {count}
      </button>
    );
  }

  return <span className="tabular-nums">{count}</span>;
}

export function ReportsPage() {
  const router = useRouter();
  const { recruiters: authRecruiters, currentUser } = useAuth();
  const drillDownEnabled = !!currentUser && canDrillDownReports(currentUser.role);
  const clientDrillDownEnabled =
    !!currentUser && canDrillDownClientReports(currentUser.role);
  const { requirements } = useRequirementsStore();
  const { submissions } = useCandidatesStore();
  const [teamSubmissions, setTeamSubmissions] = useState<Submission[]>([]);
  const [teamInterviews, setTeamInterviews] = useState<InterviewRecord[]>([]);
  const [staffRecruiters, setStaffRecruiters] = useState<Recruiter[]>([]);
  const [filters, setFilters] = useState<ReportFilters>(defaultFilters);
  const [clientPage, setClientPage] = useState(1);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'recruiter' | 'client'>('recruiter');
  const [searchRecruiter, setSearchRecruiter] = useState('');
  const { data: cardMetrics } = useCardMetrics(['team', 'teamTasks']);
  const [sortBy, setSortBy] = useState<'status' | 'weekly' | 'daily' | 'name'>('status');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allSubmissions, allRecruiters, allInterviews] = await Promise.all([
          getSubmissions({ scope: 'team', limit: 500 }),
          getRecruiters(),
          getInterviews({ limit: 500 }),
        ]);
        if (!cancelled) {
          setTeamSubmissions(allSubmissions);
          setStaffRecruiters(allRecruiters);
          setTeamInterviews(allInterviews);
        }
      } catch (e) {
        console.error('Failed to load team report data', e);
        if (!cancelled) {
          setTeamSubmissions([]);
          setStaffRecruiters([]);
          setTeamInterviews([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recruiters = staffRecruiters.length > 0 ? staffRecruiters : authRecruiters;

  const searchQuery = useMemo(
    () =>
      buildReportSearchQuery({
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    [filters.startDate, filters.endDate],
  );

  const aggregate = useMemo(
    () =>
      aggregateAdminReport(
        requirements,
        submissions,
        recruiters,
        filters,
        searchQuery,
      ),
    [requirements, submissions, recruiters, filters, searchQuery],
  );

  const globalAggregate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return aggregateAdminReport(
      requirements,
      submissions,
      recruiters,
      {
        startDate: '2000-01-01',
        endDate: today,
        periodType: 'month',
        status: 'All',
      },
      {},
    );
  }, [requirements, submissions, recruiters]);

  const clientPaginated = useMemo(() => {
    const start = (clientPage - 1) * PAGE_SIZE;
    return aggregate.clientPerformance.slice(start, start + PAGE_SIZE);
  }, [aggregate.clientPerformance, clientPage]);

  const today = useMemo(() => new Date(), []);

  const allSubmissions = useMemo<Submission[]>(
    () =>
      [...teamSubmissions].sort(
        (a, b) =>
          new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime(),
      ),
    [teamSubmissions],
  );

  const recruiterPerformance = useMemo<RecruiterPerformance[]>(() => {
    return recruiters
      .filter((r) => r != null && (r.name != null || r.email != null))
      .map((recruiter) => {
        const recruiterSubmissions = allSubmissions.filter(
          (s) => s.submittedBy.id === recruiter.id,
        );
        const workedRequirements = getRecruiterWorkedRequirements(
          requirements,
          allSubmissions,
          recruiter.id,
        );
        const activeAssignedCount = requirements.filter(
          (r) => !r.isDeleted && recruiterOwnsRequirement(r, recruiter.id),
        ).length;
        const taskSummary = computeRecruiterTaskSummary(
          recruiter.id,
          recruiterSubmissions,
          activeAssignedCount,
          today,
        );
        return {
          recruiter,
          totalRequirements: workedRequirements.length,
          totalSubmissions: countRecruiterLifetimeSubmissions(allSubmissions, recruiter.id),
          interviewStatus: summarizeRecruiterInterviews(
            teamInterviews,
            allSubmissions,
            recruiter.id,
          ),
          taskSummary,
        };
      });
  }, [recruiters, requirements, allSubmissions, teamInterviews, today]);

  const filteredRecruiterPerformance = useMemo(() => {
    const q = searchRecruiter.trim().toLowerCase();
    const filtered = recruiterPerformance.filter((perf) => {
      if (!q) return true;
      const name = (perf.recruiter?.name ?? '').toString().toLowerCase();
      const email = (perf.recruiter?.email ?? '').toString().toLowerCase();
      return name.includes(q) || email.includes(q);
    });

    const statusOrder = { green: 0, yellow: 1, red: 2 };
    const sorted = [...filtered].sort((a, b) => {
      const ta = a.taskSummary ?? ({} as RecruiterTaskSummary);
      const tb = b.taskSummary ?? ({} as RecruiterTaskSummary);
      const nameA = safeRecruiterName(a.recruiter);
      const nameB = safeRecruiterName(b.recruiter);

      switch (sortBy) {
        case 'status':
          return (
            (statusOrder[ta.statusColor as keyof typeof statusOrder] ?? 2) -
              (statusOrder[tb.statusColor as keyof typeof statusOrder] ?? 2) ||
            (tb.weeklyCompletionPercent ?? 0) - (ta.weeklyCompletionPercent ?? 0) ||
            nameA.localeCompare(nameB)
          );
        case 'weekly':
          return (tb.weeklyCompletionPercent ?? 0) - (ta.weeklyCompletionPercent ?? 0);
        case 'daily':
          return (
            (tb.dailySubmissions ?? 0) / ((tb.dailyTarget ?? 1) || 1) -
            (ta.dailySubmissions ?? 0) / ((ta.dailyTarget ?? 1) || 1)
          );
        case 'name':
          return nameA.localeCompare(nameB);
        default:
          return 0;
      }
    });

    return sorted.map((perf, idx) => ({ ...perf, rank: idx + 1 }));
  }, [recruiterPerformance, searchRecruiter, sortBy]);

  const teamTaskOverview = useMemo(() => {
    const overview = computeTeamTaskOverview(recruiterPerformance.map((p) => p.taskSummary));
    const tasks = cardMetrics?.teamTasks;
    if (!tasks) return overview;
    const teamWeeklyTarget = overview.teamWeeklyTarget;
    const teamWeeklyCompletionPercent =
      teamWeeklyTarget > 0
        ? (tasks.teamWeeklySubmissions / teamWeeklyTarget) * 100
        : overview.teamWeeklyCompletionPercent;
    const teamConversionRate =
      tasks.teamWeeklySubmissions > 0
        ? tasks.teamWeeklyInterviews / tasks.teamWeeklySubmissions
        : overview.teamConversionRate;
    return {
      ...overview,
      teamDailySubmissions: tasks.teamDailySubmissions,
      teamWeeklySubmissions: tasks.teamWeeklySubmissions,
      teamWeeklyInterviews: tasks.teamWeeklyInterviews,
      teamWeeklyCompletionPercent,
      teamConversionRate,
    };
  }, [recruiterPerformance, cardMetrics]);

  const teamTotalSubmissions = cardMetrics?.team?.totalSubmissions ?? 0;
  const teamSize = cardMetrics?.team?.teamSize ?? recruiterPerformance.length;

  const recruiterColumns: Column<(typeof filteredRecruiterPerformance)[number]>[] = [
    {
      key: 'rank',
      header: '#',
      className: 'w-12 text-center',
      cell: (perf) => (
        <div className="flex items-center justify-center gap-1">
          {perf.rank === 1 ? (
            <Trophy className="h-4 w-4 text-amber-500" aria-label="Top performer" />
          ) : (
            <span className="tabular-nums font-semibold text-slate-500 dark:text-zinc-400">
              {perf.rank}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'recruiter',
      header: 'Recruiter',
      cell: (perf) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40">
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
              {perf.recruiter.name?.charAt(0) || perf.recruiter.email?.charAt(0) || '?'}
            </span>
          </div>
          <div>
            <div className="font-semibold text-gray-900 dark:text-zinc-50">
              {perf.recruiter.name || perf.recruiter.email || 'Unknown'}
            </div>
            <div className="text-sm text-gray-600 dark:text-zinc-400">
              {perf.recruiter.title || 'Recruiter'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'requirements',
      header: 'Requirements',
      cell: (perf) => {
        const count = perf.totalRequirements;
        if (drillDownEnabled && count > 0) {
          return (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/requirements?recruiter=${encodeURIComponent(perf.recruiter.id)}&status=All`,
                )
              }
              className="tabular-nums font-semibold text-indigo-600 transition hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
              title={`View requirements worked on by ${perf.recruiter.name || perf.recruiter.email}`}
            >
              {count}
            </button>
          );
        }
        return <span className="tabular-nums">{count}</span>;
      },
    },
    {
      key: 'submissions',
      header: 'Total Submissions',
      cell: (perf) => {
        const count = perf.totalSubmissions;
        if (drillDownEnabled && count > 0) {
          return (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/submissions?submittedById=${encodeURIComponent(perf.recruiter.id)}`,
                )
              }
              className="tabular-nums font-semibold text-indigo-600 transition hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
              title={`View submissions by ${perf.recruiter.name || perf.recruiter.email}`}
            >
              {count}
            </button>
          );
        }
        return <span className="tabular-nums">{count}</span>;
      },
    },
    {
      key: 'interviewStatus',
      header: 'Total Interview',
      cell: (perf) =>
        renderTotalInterviewCount(
          perf.interviewStatus,
          drillDownEnabled,
          perf.recruiter.name || perf.recruiter.email || 'recruiter',
          (href) => router.push(href),
        ),
    },
    {
      key: 'dailyTask',
      header: 'Daily Task',
      cell: (perf) => {
        const t = perf.taskSummary;
        if (!t.isWorkingDayToday) return 'Off / No target';
        return (
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              {t.dailyStatus === 'completed' ? 'Done' : 'In progress'} ({t.dailySubmissions}/{t.dailyTarget})
            </span>
            {t.dailyStatus === 'incomplete' && (
              <div className="text-xs text-amber-700 dark:text-amber-400">{t.dailyRemaining} to go</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'weekly',
      header: 'Weekly Progress',
      cell: (perf) => {
        const t = perf.taskSummary;
        const pct = Math.min(100, Math.round(t.weeklyCompletionPercent));
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-gray-900 dark:text-zinc-50">
                {t.weeklySubmissions} / {t.weeklyTarget || 0}
              </span>
              <span className="tabular-nums font-semibold text-gray-700 dark:text-zinc-300">
                {isNaN(pct) ? 0 : pct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'conversion',
      header: 'Conversion',
      cell: (perf) => {
        const t = perf.taskSummary;
        const pct = Math.round(t.weeklyConversionRate * 100);
        return (
          <div className="text-xs text-gray-700 dark:text-zinc-300">
            <div>
              Interviews: <span className="font-semibold tabular-nums">{t.weeklyInterviews}</span>
            </div>
            <div>
              Conversion: <span className="font-semibold tabular-nums">{isNaN(pct) ? 0 : pct}%</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (perf) => {
        const t = perf.taskSummary;
        const map: Record<
          RecruiterTaskSummary['statusColor'],
          { bg: string; dot: string }
        > = {
          green: {
            bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
            dot: 'bg-emerald-500',
          },
          yellow: {
            bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
            dot: 'bg-amber-500',
          },
          red: {
            bg: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
            dot: 'bg-rose-500',
          },
        };
        const cfg = map[t.statusColor];
        return (
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cfg.bg}`}>
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${cfg.dot}`} />
            {t.statusLabel}
          </span>
        );
      },
    },
  ];

  const renderClientMetricLink = (
    row: (typeof aggregate.clientPerformance)[number],
    count: number,
    metric: ClientReportMetric,
    title: string,
  ) => {
    if (!clientDrillDownEnabled || count <= 0) {
      return <span className="tabular-nums text-gray-900 dark:text-zinc-100">{count}</span>;
    }
    return (
      <Link
        href={buildClientReportDrillDownHref(row.clientName, metric)}
        className="tabular-nums font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-2 transition hover:text-indigo-800 dark:text-indigo-400 dark:decoration-indigo-600 dark:hover:text-indigo-300"
        title={title}
      >
        {count}
      </Link>
    );
  };

  const clientColumns: Column<(typeof aggregate.clientPerformance)[number]>[] = [
    { key: 'clientName', header: 'Client', cell: (r) => r.clientName },
    {
      key: 'requirementsSent',
      header: 'Req Sent',
      cell: (r) =>
        renderClientMetricLink(
          r,
          r.requirementsSent,
          'reqSent',
          `View requirements sent by ${r.clientName}`,
        ),
    },
    {
      key: 'requirementsAssigned',
      header: 'Req Assigned',
      cell: (r) =>
        renderClientMetricLink(
          r,
          r.requirementsAssigned,
          'reqAssigned',
          `View assigned requirements for ${r.clientName}`,
        ),
    },
    {
      key: 'candidatesSubmitted',
      header: 'Submissions',
      cell: (r) =>
        renderClientMetricLink(
          r,
          r.candidatesSubmitted,
          'submissions',
          `View submissions for ${r.clientName}`,
        ),
    },
    {
      key: 'ratio',
      header: 'Sub. Ratio',
      cell: (r) => (
        <span className="tabular-nums font-medium">{r.submissionRatio.toFixed(2)}</span>
      ),
    },
    {
      key: 'openCount',
      header: 'Open',
      cell: (r) =>
        renderClientMetricLink(
          r,
          r.openCount,
          'open',
          `View open requirements for ${r.clientName}`,
        ),
    },
    {
      key: 'closedCount',
      header: 'Closed',
      cell: (r) =>
        renderClientMetricLink(
          r,
          r.closedCount,
          'closed',
          `View closed requirements for ${r.clientName}`,
        ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-zinc-50 sm:text-3xl">
            Reports & Analytics
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
            Executive dashboard for recruitment and client performance metrics
          </p>
        </div>
        <div className="relative flex gap-2">
          <button
            type="button"
            onClick={() => setGenerateMenuOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <FileText className="h-4 w-4" />
            Generate Report
            <ChevronDown className="h-4 w-4 opacity-90" />
          </button>
          {generateMenuOpen ? (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="button"
                onClick={() => {
                  setGenerateMenuOpen(false);
                  router.push('/reports/generate?mode=recruiter');
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 transition hover:bg-gray-50 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
              >
                <Users className="h-4 w-4" />
                Recruiter Report
              </button>
              <button
                type="button"
                onClick={() => {
                  setGenerateMenuOpen(false);
                  router.push('/reports/generate?mode=client');
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 transition hover:bg-gray-50 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
              >
                <Briefcase className="h-4 w-4" />
                Client Report
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* KPI Cards - Team Work metrics moved into Reports */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab('recruiter');
            router.push('/reports/generate?mode=recruiter');
          }}
          className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">On-Track Today</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {Math.round(
                  Number.isNaN(teamTaskOverview.percentOnTrackToday)
                    ? 0
                    : teamTaskOverview.percentOnTrackToday,
                )}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {teamTaskOverview.onTrackTodayCount}/{teamTaskOverview.workingRecruiters}{' '}
                working recruiters
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-white shadow">
              <Target className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('recruiter');
            router.push('/reports/generate?mode=recruiter');
          }}
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Today - Submissions vs Target</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {teamTaskOverview.teamDailySubmissions}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {teamTaskOverview.teamDailySubmissions}/{teamTaskOverview.teamDailyTarget} submissions
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-white shadow">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('recruiter');
            router.push('/reports/generate?mode=recruiter');
          }}
          className="rounded-2xl border border-orange-200 bg-orange-50 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Weekly Progress</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {teamTaskOverview.teamWeeklySubmissions}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {teamTaskOverview.teamWeeklySubmissions}/{teamTaskOverview.teamWeeklyTarget}{' '}
                submissions •{' '}
                {Math.round(
                  Number.isNaN(teamTaskOverview.teamWeeklyCompletionPercent)
                    ? 0
                    : teamTaskOverview.teamWeeklyCompletionPercent,
                )}
                % of target
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-white shadow">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('recruiter');
            router.push('/reports/generate?mode=recruiter');
          }}
          className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Weekly Conversion</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {Math.round(
                  Number.isNaN(teamTaskOverview.teamConversionRate)
                    ? 0
                    : teamTaskOverview.teamConversionRate * 100,
                )}
                %
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                {teamTaskOverview.teamWeeklyInterviews} interviews this week
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500 text-white shadow">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('client');
            router.push('/reports/generate?mode=client');
          }}
          className="rounded-2xl border border-purple-200 bg-purple-50 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Submissions</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {teamTotalSubmissions}
              </h2>
              <p className="mt-1 text-xs text-gray-500">Across the full team</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500 text-white shadow">
              <Briefcase className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('recruiter');
            router.push('/reports/generate?mode=recruiter');
          }}
          className="rounded-2xl border border-sky-200 bg-sky-50 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Team Size</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {teamSize}
              </h2>
              <p className="mt-1 text-xs text-gray-500">Recruiters in performance tracking</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500 text-white shadow">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </button>
      </div>


      {/* Charts / Diagrams */}
      {/* Charts were moved to the respective report generation pages:
          - Recruiter: /reports/generate?mode=recruiter
          - Client: /reports/generate?mode=client
      */}

      {/* Performance tables with tabs */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-gray-200 dark:border-zinc-800">
          <div className="flex gap-1 p-2">
            <button
              type="button"
              onClick={() => setActiveTab('recruiter')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition',
                activeTab === 'recruiter'
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50',
              )}
            >
              <Users className="h-4 w-4" />
              Recruiter Performance
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs dark:bg-zinc-700">
                {recruiterPerformance.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('client')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition',
                activeTab === 'client'
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50',
              )}
            >
              <Briefcase className="h-4 w-4" />
              Client Performance
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs dark:bg-zinc-700">
                {aggregate.clientPerformance.length}
              </span>
            </button>
          </div>
        </div>

        <div className="p-4">
          {activeTab === 'recruiter' ? (
            <div className="space-y-4">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-zinc-200">
                    Recruiter Performance
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                    Individual metrics, daily targets, and weekly progress ({recruiterPerformance.length}{' '}
                    recruiters). Requirements and submissions are lifetime totals through today
                    {drillDownEnabled ? ' — click counts to drill down.' : '.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search recruiter..."
                      value={searchRecruiter}
                      onChange={(e) => setSearchRecruiter(e.target.value)}
                      className="h-10 w-48 rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-500"
                    />
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="status">Sort by Status</option>
                    <option value="weekly">Sort by Weekly Progress</option>
                    <option value="daily">Sort by Daily Progress</option>
                    <option value="name">Sort by Name</option>
                  </select>
                </div>
              </div>
              <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/30">
                <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Status legend:
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-slate-600 dark:text-zinc-300">On Track</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-slate-600 dark:text-zinc-300">Warning</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-slate-600 dark:text-zinc-300">Critical</span>
                  </span>
                </div>
              </div>
              <DataTable
                title=""
                subtitle=""
                columns={recruiterColumns}
                rows={filteredRecruiterPerformance}
                rowsPerPage={6}
                emptyText="No recruiters found."
                mobileCard={(r) => (
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="font-semibold text-gray-900 dark:text-zinc-50">{r.recruiter.name || r.recruiter.email || 'Unknown'}</div>
                    <div className="mt-1 text-sm text-gray-500 dark:text-zinc-400">{r.recruiter.title || 'Recruiter'}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        Requirements:{' '}
                        {drillDownEnabled && r.totalRequirements > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/requirements?recruiter=${encodeURIComponent(r.recruiter.id)}&status=All`,
                              )
                            }
                            className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {r.totalRequirements}
                          </button>
                        ) : (
                          r.totalRequirements
                        )}
                      </div>
                      <div>
                        Submissions:{' '}
                        {drillDownEnabled && r.totalSubmissions > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/submissions?submittedById=${encodeURIComponent(r.recruiter.id)}`,
                              )
                            }
                            className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {r.totalSubmissions}
                          </button>
                        ) : (
                          r.totalSubmissions
                        )}
                      </div>
                      <div>Weekly: {Math.round(r.taskSummary.weeklyCompletionPercent)}%</div>
                      <div>Status: {r.taskSummary.statusLabel}</div>
                      <div>
                        Interviews:{' '}
                        {renderTotalInterviewCount(
                          r.interviewStatus,
                          drillDownEnabled,
                          r.recruiter.name || r.recruiter.email || 'recruiter',
                          (href) => router.push(href),
                        )}
                      </div>
                    </div>
                  </div>
                )}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => router.push('/reports/generate?mode=recruiter')}
                  className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  View detailed recruiter analytics
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mb-2">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-zinc-200">
                  Client Performance
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                  Metrics by client
                  {clientDrillDownEnabled
                    ? ' — click Req Sent, Req Assigned, Submissions, Open, or Closed to view that client’s records.'
                    : '.'}
                </p>
              </div>
              <DataTable
                title=""
                subtitle=""
                columns={clientColumns}
                rows={clientPaginated}
                rowsPerPage={0}
                emptyText="No client data in range."
                mobileCard={(c) => {
                  const metricBtn = (
                    label: string,
                    count: number,
                    metric: ClientReportMetric,
                    title: string,
                  ) => (
                    <div>
                      {label}:{' '}
                      {clientDrillDownEnabled && count > 0 ? (
                        <Link
                          href={buildClientReportDrillDownHref(c.clientName, metric)}
                          className="font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                          title={title}
                        >
                          {count}
                        </Link>
                      ) : (
                        count
                      )}
                    </div>
                  );
                  return (
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="font-semibold text-gray-900 dark:text-zinc-50">{c.clientName}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        {metricBtn('Req Sent', c.requirementsSent, 'reqSent', `Requirements for ${c.clientName}`)}
                        {metricBtn('Assigned', c.requirementsAssigned, 'reqAssigned', `Assigned for ${c.clientName}`)}
                        {metricBtn('Submissions', c.candidatesSubmitted, 'submissions', `Submissions for ${c.clientName}`)}
                        <div>Ratio: {c.submissionRatio.toFixed(2)}</div>
                        {metricBtn('Open', c.openCount, 'open', `Open for ${c.clientName}`)}
                        {metricBtn('Closed', c.closedCount, 'closed', `Closed for ${c.clientName}`)}
                      </div>
                    </div>
                  );
                }}
              />
              <Pagination
                page={clientPage}
                pageSize={PAGE_SIZE}
                totalItems={aggregate.clientPerformance.length}
                onPageChange={setClientPage}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => router.push('/reports/generate?mode=client')}
                  className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  View detailed client analytics
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
