'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Send,
  MessageSquare,
  CheckCircle2,
  Users,
  Search,
  Trophy,
} from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/requirements/StatCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/requirements/StatusBadge';

import { useAuth } from '@/lib/contexts/AuthContext';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import {
  getDashboardStatus,
  type DashboardFilter,
} from '@/lib/domain/requirements/logic';
import { useSubmissionsStore } from '@/lib/domain/submissions/store';
import type { Submission } from '@/lib/domain/submissions/types';
import { useCardMetrics } from '@/lib/hooks/useCardMetrics';
import {
  computeRecruiterTaskSummary,
  computeTeamTaskOverview,
  type RecruiterTaskSummary,
} from '@/lib/domain/performance/teamWorkTasks';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

type RecruiterPerformance = {
  recruiter: {
    id: string;
    name?: string;
    email?: string;
    title?: string;
  };
  totalRequirements: number;
  totalSubmissions: number;
  interviews: number;
  selected: number;
  rejected: number;
  taskSummary: RecruiterTaskSummary;
};

/** Safe string for sorting – handles undefined/null recruiter fields */
function safeRecruiterName(
  r: RecruiterPerformance['recruiter'] | undefined,
): string {
  return (r?.name ?? r?.email ?? '').toString();
}

export function TeamWorkPage() {
  const { recruiters } = useAuth();
  const { requirements } = useRequirementsStore();
  const { submissions } = useSubmissionsStore();

  const [searchRecruiter, setSearchRecruiter] = useState('');
  const [searchStatus, setSearchStatus] = useState<DashboardFilter | 'All'>('All');
  const [sortBy, setSortBy] = useState<'status' | 'weekly' | 'daily' | 'name'>('status');
  const { data: cardMetrics } = useCardMetrics(['team', 'teamTasks']);

  const today = useMemo(() => new Date(), []);

  const allSubmissions = useMemo(
    () =>
      [...submissions].sort(
        (a, b) =>
          new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime(),
      ),
    [submissions],
  );

  // Use full DB-backed requirement records for stats (exclude only soft-deleted).
  const teamRequirements = useMemo(() => {
    return requirements.filter((r) => !r.isDeleted);
  }, [requirements]);

  // Calculate overall team metrics
  const teamMetrics = useMemo(() => {
    const rejected = allSubmissions.filter((s) => s.status === 'Rejected').length;
    return {
      totalRequirements: teamRequirements.length,
      totalSubmissions: cardMetrics?.team?.totalSubmissions ?? 0,
      interviews: cardMetrics?.team?.interviews ?? 0,
      selected: cardMetrics?.team?.selections ?? 0,
      rejected,
      teamSize: cardMetrics?.team?.teamSize ?? recruiters.length,
    };
  }, [teamRequirements.length, allSubmissions, recruiters.length, cardMetrics]);

  // Calculate recruiter-wise performance + task metrics
  const recruiterPerformance = useMemo<RecruiterPerformance[]>(() => {
    return recruiters
      .filter((r) => r != null && (r.name != null || r.email != null))
      .map((recruiter) => {
      const recruiterReqs = teamRequirements.filter(
        (r) => r.owner.id === recruiter.id,
      );
      const recruiterSubmissions = allSubmissions.filter(
        (s) => s.submittedBy.id === recruiter.id,
      );
      const interviews = recruiterSubmissions.filter(
        (s) => s.status === 'Interview',
      ).length;
      const selected = recruiterSubmissions.filter(
        (s) => s.status === 'Selected',
      ).length;
      const rejected = recruiterSubmissions.filter(
        (s) => s.status === 'Rejected',
      ).length;

      const taskSummary = computeRecruiterTaskSummary(
        recruiter.id,
        recruiterSubmissions,
        recruiterReqs.length,
        today,
      );

      return {
        recruiter,
        totalRequirements: recruiterReqs.length,
        totalSubmissions: recruiterSubmissions.length,
        interviews,
        selected,
        rejected,
        taskSummary,
      };
    });
  }, [recruiters, teamRequirements, allSubmissions, today]);

  const teamTaskOverview = useMemo(() => {
    const summaries = recruiterPerformance.map((p) => p.taskSummary);
    const overview = computeTeamTaskOverview(summaries);
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

  // Filter and sort recruiter performance with rank
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

  // Filter team submissions
  const filteredSubmissions = useMemo(() => {
    return allSubmissions.filter((s) => {
      const statusMatch =
        searchStatus === 'All' || s.status === searchStatus;
      return statusMatch;
    });
  }, [allSubmissions, searchStatus]);

  const recruiterColumns: Column<RecruiterPerformance & { rank?: number }>[] = [
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
      key: 'activeReqs',
      header: 'Requirements',
      cell: (perf) => (
        <span className="tabular-nums font-medium text-gray-900 dark:text-zinc-50">
          {perf.totalRequirements}
        </span>
      ),
    },
    {
      key: 'submissions',
      header: 'Total Submissions',
      cell: (perf) => (
        <span className="tabular-nums font-medium text-gray-900 dark:text-zinc-50">
          {perf.totalSubmissions}
        </span>
      ),
    },
    {
      key: 'dailyTask',
      header: 'Daily Task',
      cell: (perf) => {
        const t = perf.taskSummary;
        if (!t.isWorkingDayToday) {
          return (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">
              Off / No target
            </span>
          );
        }

        const base =
          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold';
        const colorClass =
          t.dailyStatus === 'completed'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

        return (
          <div className="space-y-1">
            <span className={`${base} ${colorClass}`}>
              {t.dailyStatus === 'completed' ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : null}
              {t.dailyStatus === 'completed' ? 'Done' : 'In progress'} (
              {t.dailySubmissions}/{t.dailyTarget})
            </span>
            {t.dailyStatus === 'incomplete' && (
              <div className="text-xs text-amber-700 dark:text-amber-400">
                {t.dailyRemaining} to go
              </div>
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
        const barColor =
          pct >= 100
            ? 'bg-emerald-500'
            : pct >= 70
              ? 'bg-amber-500'
              : 'bg-rose-500';
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
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
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
              Interviews:{' '}
              <span className="font-semibold tabular-nums">
                {t.weeklyInterviews}
              </span>
            </div>
            <div>
              Conversion:{' '}
              <span className="font-semibold tabular-nums">
                {isNaN(pct) ? 0 : pct}%
              </span>
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
        const base =
          'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium';
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
          <span className={`${base} ${cfg.bg}`}>
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full ${cfg.dot}`}
            />
            {t.statusLabel}
          </span>
        );
      },
    },
    {
      key: 'autoAssign',
      header: 'Auto-Assign',
      cell: (perf) => {
        const t = perf.taskSummary;
        if (!t.needsAutoAssignment) {
          return (
            <span className="text-xs text-gray-500 dark:text-zinc-400">
              Sufficient load
            </span>
          );
        }
        return (
          <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
            Flagged for auto-assignment
          </span>
        );
      },
    },
  ];

  const submissionColumns: Column<Submission>[] = [
    {
      key: 'candidate',
      header: 'Candidate Name',
      cell: (s) => (
        <Link
          href={`/submissions?candidate=${encodeURIComponent(
            s.candidate?.name || 'Unknown',
          )}`}
          className="font-semibold text-gray-900 hover:underline dark:text-zinc-50"
        >
          {s.candidate?.name || 'Unknown Candidate'}
        </Link>
      ),
    },
    {
      key: 'recruiter',
      header: 'Recruiter',
      cell: (s) => (
        <div className="text-sm text-gray-600 dark:text-zinc-400">
          {s.submittedBy?.name || 'Unknown'}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (s) => (
        <Link
          href={`/requirements?req=${encodeURIComponent(
            (s.requirement as any)?.requirementId ?? (s.requirement as any)?.id ?? '',
          )}`}
          className="text-gray-900 hover:underline dark:text-zinc-50"
        >
          {s.requirement?.roleTitle || 'Unknown Role'}
        </Link>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      cell: (s) => (
        <span className="text-gray-600 dark:text-zinc-400">
          {s.requirement?.clientName || 'Unknown Client'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'date',
      header: 'Submitted On',
      cell: (s) => (
        <span className="tabular-nums text-gray-600 dark:text-zinc-400">
          {fmtDate(s.submittedOn)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Work"
        subtitle="All work related to your team — requirements, submissions, and performance"
      />

      {/* Task Overview – compact summary row */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-zinc-200">
          Task Overview
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="On-Track Today"
            value={Math.round(
              isNaN(teamTaskOverview.percentOnTrackToday)
                ? 0
                : teamTaskOverview.percentOnTrackToday,
            )}
            helper={
              teamTaskOverview.workingRecruiters > 0
                ? `${teamTaskOverview.onTrackTodayCount}/${teamTaskOverview.workingRecruiters} working recruiters`
                : 'No active working days today'
            }
            icon={<CheckCircle2 className="h-5 w-5" />}
            color="emerald"
          />
          <StatCard
            label="Today – Submissions vs Target"
            value={teamTaskOverview.teamDailySubmissions}
            helper={
              teamTaskOverview.teamDailyTarget > 0
                ? `${teamTaskOverview.teamDailySubmissions}/${teamTaskOverview.teamDailyTarget} submissions`
                : 'No daily targets today'
            }
            icon={<Send className="h-5 w-5" />}
            color="blue"
          />
          <StatCard
            label="Weekly Progress"
            value={teamTaskOverview.teamWeeklySubmissions}
            helper={
              teamTaskOverview.teamWeeklyTarget > 0
                ? `${teamTaskOverview.teamWeeklySubmissions}/${teamTaskOverview.teamWeeklyTarget} submissions • ${Math.round(
                    isNaN(teamTaskOverview.teamWeeklyCompletionPercent)
                      ? 0
                      : teamTaskOverview.teamWeeklyCompletionPercent,
                  )}% of target`
                : 'Weekly target not defined yet'
            }
            icon={<Users className="h-5 w-5" />}
            color="indigo"
          />
          <StatCard
            label="Weekly Conversion"
            value={Math.round(
              isNaN(teamTaskOverview.teamConversionRate)
                ? 0
                : teamTaskOverview.teamConversionRate * 100,
            )}
            helper={`${teamTaskOverview.teamWeeklyInterviews} interviews this week`}
            icon={<MessageSquare className="h-5 w-5" />}
            color="purple"
          />
        </div>
      </section>

      {/* Team Performance Summary */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-zinc-200">
          Team Performance Summary
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total Submissions"
            value={teamMetrics.totalSubmissions}
            icon={<Send className="h-5 w-5" />}
            color="emerald"
          />
          <StatCard
            label="Interviews"
            value={teamMetrics.interviews}
            icon={<MessageSquare className="h-5 w-5" />}
            color="amber"
          />
          <StatCard
            label="Selections"
            value={teamMetrics.selected}
            icon={<CheckCircle2 className="h-5 w-5" />}
            color="purple"
          />
          <StatCard
            label="Team Size"
            value={teamMetrics.teamSize}
            icon={<Users className="h-5 w-5" />}
            color="indigo"
          />
        </div>
      </section>

      {/* Team Submissions */}
      <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200">
              Team Submissions
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
              All submissions across the team with interview status
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={searchStatus}
              onChange={(e) =>
                setSearchStatus(e.target.value as DashboardFilter | 'All')
              }
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="All">All Status</option>
              <option value="Submitted">Submitted</option>
              <option value="Interview">Interview</option>
              <option value="Selected">Selected</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>
        <DataTable
          columns={submissionColumns}
          rows={filteredSubmissions}
          rowsPerPage={5}
          emptyText="No submissions found."
          mobileCard={(s) => (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/submissions?candidate=${encodeURIComponent(
                      s.candidate?.name || 'Unknown',
                    )}`}
                    className="text-sm font-semibold text-gray-900 hover:underline dark:text-zinc-50"
                  >
                    {s.candidate?.name || 'Unknown Candidate'}
                  </Link>
                  <div className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                    {s.candidate?.currentCompany || 'No company info'}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    <span className="text-xs text-gray-500 dark:text-zinc-400">
                      by {s.submittedBy?.name || 'Unknown'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-zinc-400">
                  {fmtDate(s.submittedOn)}
                </div>
              </div>
              <div className="mt-4 space-y-1 text-sm">
                <div>
                  <div className="text-xs text-gray-500 dark:text-zinc-400">
                    Role
                  </div>
                  <Link
                    href={`/requirements?req=${encodeURIComponent(
                      (s.requirement as any)?.requirementId ?? (s.requirement as any)?.id ?? '',
                    )}`}
                    className="font-medium text-gray-900 hover:underline dark:text-zinc-50"
                  >
                    {s.requirement?.roleTitle || 'Unknown Role'}
                  </Link>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-zinc-400">
                    Client
                  </div>
                  <span className="text-gray-600 dark:text-zinc-400">
                    {s.requirement?.clientName || 'Unknown Client'}
                  </span>
                </div>
              </div>
            </div>
          )}
        />
      </section>
    </div>
  );
}
