'use client';

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { bumpFormMountKey } from '@/lib/formDrafts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Select from 'react-select';
import {
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  PlusCircle,
  Search,
  Send,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  X,
  XCircle,
} from 'lucide-react';

import { useAuth } from '@/lib/contexts/AuthContext';
import { notify } from '@/lib/notify';
import { getRequirementAssignments, getRequirements } from '@/lib/api/requirements';
import { getSubmissions } from '@/lib/api/submissions';
import { getRecruiterWorkedRequirements } from '@/lib/domain/reports/reportAggregationController';
import type { Submission } from '@/lib/domain/submissions/types';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { useSubmissionsStore } from '@/lib/domain/submissions/store';
import { useCardMetrics } from '@/lib/hooks/useCardMetrics';
import {
  filterRequirementsForDashboard,
  getDashboardStatus,
  isRequirementAllocated,
  recruiterOwnsRequirement,
  sortRequirementsForTable,
  DASHBOARD_FILTER_OPTIONS,
  parseDashboardFilterFromQuery,
  type DashboardFilter,
} from '@/lib/domain/requirements/logic';
import type { Requirement } from '@/lib/domain/requirements/types';
import {
  buildEffectiveStatusByRequirementId,
  withEffectiveStatuses,
} from '@/lib/domain/requirements/submissionStatus';
import { requirementMatchesClientQuery } from '@/lib/navigation/clientReportDrillDown';

import { StatCard } from '@/components/requirements/StatCard';
import { RequirementTable } from '@/components/requirements/RequirementTable';
import { RevokeAssignmentModal } from '@/components/requirements/RevokeAssignmentModal';
import {
  buildRevokeTargets,
  buildRevokeTargetsFromAssignmentRows,
  canRevokeWithoutPicker,
  type RevokeAssignmentTarget,
} from '@/lib/domain/requirements/revokeAssignment';

const ROWS_PER_PAGE_OPTIONS = [5, 10, 15, 20, 25] as const;
const DEFAULT_ROWS_PER_PAGE = 5;

const filters: Exclude<DashboardFilter, 'All'>[] = [
  'Unassigned',
  'Assigned',
  'Submitted',
  'Selected',
  'Interview',
  'Rejected',
  'Closed',
];

/** Status dropdown + valid `?status=` query values (includes All for Total / full list). */
const FILTER_OPTIONS: DashboardFilter[] = DASHBOARD_FILTER_OPTIONS;

function countsFrom(reqs: Requirement[], totalSubmissions: number) {
  const active = reqs.filter((r) => !r.isDeleted);
  const bucket = (f: DashboardFilter) =>
    filterRequirementsForDashboard(active, f).length;

  const statuses = active.map(getDashboardStatus);
  const count = (s: Exclude<DashboardFilter, 'All'>) =>
    statuses.filter((x) => x === s).length;

  return {
    total: active.length,
    submissions: totalSubmissions,
    unassigned: count('Unassigned'),
    assigned: count('Assigned'),
    inProgress: count('Submitted'),
    interviews: count('Interview'),
    selected: count('Selected'),
    rejected: count('Rejected'),
    closed: count('Closed'),
    byFilter: Object.fromEntries(
      filters.map((f) => [f, bucket(f)])
    ) as Record<DashboardFilter, number>,
  };
}

export function RequirementsDashboard() {
  const {
    requirements,
    assignRequirement,
    revokeRequirement,
    refresh: refreshRequirements,
  } = useRequirementsStore();
  const { submissions, refresh: refreshSubmissions } = useSubmissionsStore();
  const { data: cardMetrics, refresh: refreshCardMetrics } = useCardMetrics(['requirements']);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const statusParam = searchParams.get('status');
  const recruiterParam = searchParams.get('recruiter');
  const clientParam = searchParams.get('client');
  const openOnlyParam = searchParams.get('openOnly');
  const requirementIdParam = searchParams.get('requirementId');
  const openOnly =
    openOnlyParam === '1' || openOnlyParam?.toLowerCase() === 'true';

  const [filter, setFilter] = useState<DashboardFilter>(() =>
    parseDashboardFilterFromQuery(statusParam, recruiterParam),
  );
  const [recruiterTeamSubmissions, setRecruiterTeamSubmissions] = useState<Submission[]>([]);

  useEffect(() => {
    setFilter(parseDashboardFilterFromQuery(statusParam, recruiterParam));
  }, [statusParam, recruiterParam]);
    

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(DEFAULT_ROWS_PER_PAGE);
  const [searchReqId, setSearchReqId] = useState(requirementIdParam ?? '');
  const [searchClient, setSearchClient] = useState('');
  const [searchRole, setSearchRole] = useState('');
  const [searchOwner, setSearchOwner] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRecruiterIds, setSelectedRecruiterIds] = useState<string[]>(
    [],
  );
  const [assignSearch, setAssignSearch] = useState('');
  const [assignNotice, setAssignNotice] = useState<string | null>(null);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeTargets, setRevokeTargets] = useState<RevokeAssignmentTarget[]>([]);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);
  const [recruiterScopedRequirements, setRecruiterScopedRequirements] = useState<
    Requirement[]
  >([]);

  const { currentUser, recruiters } = useAuth();
  const assignableRecruiters = recruiters.length > 0 ? recruiters : (currentUser ? [currentUser] : []);
  const filteredAssignableRecruiters = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return assignableRecruiters;
    return assignableRecruiters.filter((r) => {
      const haystack = `${r.name ?? ''} ${r.email ?? ''} ${r.title ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [assignSearch, assignableRecruiters]);
  const statusSelectId = useId();

  const onToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, recruiterParam, clientParam, searchReqId, searchClient, searchRole, searchOwner, rowsPerPage]);

  useEffect(() => {
    if (requirementIdParam !== null) {
      setSearchReqId(requirementIdParam);
    }
  }, [requirementIdParam]);

  useEffect(() => {
    // Load submissions once for status rollups, instead of refetching on every filter keystroke.
    void refreshSubmissions();
  }, [refreshSubmissions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Keep dashboard summary cards based on full DB records.
      // Filtering is applied locally for table/search views.
      void refreshRequirements({ limit: 500 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    refreshRequirements,
  ]);

  useEffect(() => {
    // Auto-refresh so newly ingested requirement emails appear without manual reload.
    const requirementsTimer = window.setInterval(() => {
      void refreshRequirements({ limit: 500 });
      void refreshCardMetrics();
    }, 15000);
    const submissionsTimer = window.setInterval(() => {
      void refreshSubmissions();
      void refreshCardMetrics();
    }, 30000);
    return () => {
      window.clearInterval(requirementsTimer);
      window.clearInterval(submissionsTimer);
    };
  }, [refreshRequirements, refreshSubmissions, refreshCardMetrics]);

  useEffect(() => {
    if (!assignNotice) return;
    const t = window.setTimeout(() => setAssignNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [assignNotice]);

  const loadRecruiterScopedRequirements = useCallback(async (recruiterId: string) => {
    const id = recruiterId.trim();
    if (!id) {
      setRecruiterScopedRequirements([]);
      return;
    }
    try {
      const mine = await getRequirements({ recruiterId: id, limit: 500 });
      setRecruiterScopedRequirements(mine);
    } catch (e) {
      console.error('Failed to load recruiter-scoped requirements', e);
      setRecruiterScopedRequirements([]);
    }
  }, []);

  useEffect(() => {
    if (!recruiterParam?.trim()) {
      setRecruiterScopedRequirements([]);
      setRecruiterTeamSubmissions([]);
      return;
    }
    void loadRecruiterScopedRequirements(recruiterParam);
    let cancelled = false;
    (async () => {
      try {
        const rows = await getSubmissions({
          scope: 'team',
          submittedById: recruiterParam,
          limit: 500,
        });
        if (!cancelled) setRecruiterTeamSubmissions(rows);
      } catch {
        if (!cancelled) setRecruiterTeamSubmissions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recruiterParam, loadRecruiterScopedRequirements]);

  useEffect(() => {
    if (!recruiterParam?.trim()) return;
    const onAssignmentChanged = () => {
      void loadRecruiterScopedRequirements(recruiterParam);
      void refreshRequirements({ limit: 500 });
    };
    window.addEventListener('requirements-assignment-changed', onAssignmentChanged);
    return () =>
      window.removeEventListener('requirements-assignment-changed', onAssignmentChanged);
  }, [recruiterParam, loadRecruiterScopedRequirements, refreshRequirements]);

  const effectiveStatusByRequirementId = useMemo(() => {
    return buildEffectiveStatusByRequirementId(submissions);
  }, [submissions]);

  const requirementsByUrl = useMemo(() => {
    let list = withEffectiveStatuses(requirements, effectiveStatusByRequirementId).filter(
      (r) => !r.isDeleted
    );

    if (recruiterParam) {
      const mergedReqPool = new Map<string, Requirement>();
      for (const r of list) {
        if (!r.isDeleted) mergedReqPool.set(r.id, r);
      }
      for (const r of recruiterScopedRequirements) {
        if (!r.isDeleted) mergedReqPool.set(r.id, r);
      }
      const worked = getRecruiterWorkedRequirements(
        Array.from(mergedReqPool.values()),
        recruiterTeamSubmissions.length > 0 ? recruiterTeamSubmissions : submissions,
        recruiterParam,
      );
      list = withEffectiveStatuses(worked, effectiveStatusByRequirementId);
    }

    if (clientParam) {
      const decoded = decodeURIComponent(clientParam);
      list = list.filter((r) => requirementMatchesClientQuery(r, decoded));
    }

    if (openOnly) {
      list = list.filter(
        (r) => r.status !== 'Closed' && getDashboardStatus(r) !== 'Closed',
      );
    }

    return list;
  }, [
    requirements,
    recruiterScopedRequirements,
    recruiterTeamSubmissions,
    submissions,
    recruiterParam,
    clientParam,
    openOnly,
    effectiveStatusByRequirementId,
  ]);

  const requirementsForGlobalSummary = useMemo(
    () =>
      withEffectiveStatuses(requirements, effectiveStatusByRequirementId).filter(
        (r) => !r.isDeleted
      ),
    [requirements, effectiveStatusByRequirementId]
  );

  const requirementsBySearch = useMemo(() => {
    return requirementsByUrl.filter((r) => {
      const reqIdMatch =
        !searchReqId.trim() ||
        (r.requirementId ?? r.id).toLowerCase().includes(searchReqId.trim().toLowerCase());
      const clientMatch = requirementMatchesClientQuery(r, searchClient);
      const roleMatch =
        !searchRole.trim() ||
        r.roleTitle.toLowerCase().includes(searchRole.trim().toLowerCase()) ||
        (r.location &&
          r.location.toLowerCase().includes(searchRole.trim().toLowerCase()));
      const ownerMatch =
        !searchOwner.trim() ||
        r.owner.name.toLowerCase().includes(searchOwner.trim().toLowerCase()) ||
        (r.owner.email &&
          r.owner.email.toLowerCase().includes(searchOwner.trim().toLowerCase()));
      return reqIdMatch && clientMatch && roleMatch && ownerMatch;
    });
  }, [
    requirementsByUrl,
    searchReqId,
    searchClient,
    searchRole,
    searchOwner,
  ]);

  const summary = useMemo(() => {
    const r = cardMetrics?.requirements;
    if (r) {
      return {
        total: r.total,
        submissions: r.submissions,
        unassigned: r.unassigned,
        assigned: r.assigned,
        inProgress: r.inProgress,
        interviews: r.interviews,
        selected: r.selected,
        rejected: r.rejected,
        closed: r.closed,
        byFilter: countsFrom(requirementsForGlobalSummary, r.submissions).byFilter,
      };
    }
    return countsFrom(requirementsForGlobalSummary, 0);
  }, [cardMetrics, requirementsForGlobalSummary]);

  const sortedForTable = useMemo(() => {
    const filtered = filterRequirementsForDashboard(requirementsBySearch, filter);
    return sortRequirementsForTable(filtered, filter);
  }, [requirementsBySearch, filter]);

  const totalPages = Math.ceil(
    sortedForTable.length / rowsPerPage
  );

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedForTable.slice(
      start,
      start + rowsPerPage
    );
  }, [sortedForTable, currentPage, rowsPerPage]);

  useEffect(() => {
    if (sortedForTable.length === 0) {
      setCurrentPage(1);
      return;
    }
    setCurrentPage((page) => Math.min(page, Math.max(1, totalPages)));
  }, [sortedForTable.length, totalPages]);

  const pageIds = useMemo(
    () => paginatedData.map((r) => r.id),
    [paginatedData],
  );

  const onToggleAll = useCallback(
    (checked: boolean, ids?: string[]) => {
      const targetIds = ids ?? pageIds;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        targetIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
        return next;
      });
    },
    [pageIds],
  );

  const selectedRequirements = useMemo(
    () => requirements.filter((r) => selectedIds.has(r.id)),
    [requirements, selectedIds],
  );

  const selectedAssignedCount = useMemo(
    () =>
      selectedRequirements.filter((r) => isRequirementAllocated(r)).length,
    [selectedRequirements],
  );

  const handleBulkAssign = useCallback(async () => {
    if (selectedRecruiterIds.length === 0 || !currentUser) return;
    const recruiters = selectedRecruiterIds
      .map((rid) => assignableRecruiters.find((r) => r.id === rid))
      .filter((r): r is NonNullable<typeof r> => !!r);
    if (recruiters.length === 0) return;
    try {
      for (const req of selectedRequirements) {
        for (const recruiter of recruiters) {
          await assignRequirement(req.id, recruiter, currentUser.name);
        }
      }
      setSelectedIds(new Set());
      setSelectedRecruiterIds([]);
      setShowAssignModal(false);
      setAssignNotice('Your selection has been routed to work.');
    } catch (err) {
      console.error('Failed to assign:', err);
      notify.error(
        err instanceof Error
          ? err.message
          : 'Could not assign recruiters. You may need to be assigned to this requirement first.',
      );
    }
  }, [
    selectedRecruiterIds,
    selectedRequirements,
    assignRequirement,
    currentUser,
    assignableRecruiters,
  ]);

  const executeRevokes = useCallback(
    async (targets: RevokeAssignmentTarget[]) => {
      if (!currentUser || targets.length === 0) return;
      const grouped = new Map<
        string,
        { recruiterIds: string[]; assignmentIds: string[] }
      >();
      for (const target of targets) {
        const bucket = grouped.get(target.requirementInternalId) ?? {
          recruiterIds: [],
          assignmentIds: [],
        };
        bucket.recruiterIds.push(target.recruiterId);
        if (target.assignmentId?.trim()) {
          bucket.assignmentIds.push(target.assignmentId);
        }
        grouped.set(target.requirementInternalId, bucket);
      }
      for (const [requirementInternalId, payload] of grouped) {
        const options =
          payload.assignmentIds.length > 0
            ? { assignmentIds: payload.assignmentIds }
            : { recruiterIds: payload.recruiterIds };
        await revokeRequirement(requirementInternalId, currentUser.name, options);
      }
      await refreshRequirements({ limit: 500 });
    },
    [currentUser, revokeRequirement, refreshRequirements],
  );

  const resolveRevokeTargets = useCallback(async (requirementsToRevoke: Requirement[]) => {
    const allocated = requirementsToRevoke.filter((r) => isRequirementAllocated(r));
    const targets: RevokeAssignmentTarget[] = [];
    for (const req of allocated) {
      try {
        const rows = await getRequirementAssignments(req.id, { limit: 200 });
        const fromRows = buildRevokeTargetsFromAssignmentRows(req, rows);
        if (fromRows.length > 0) {
          targets.push(...fromRows);
          continue;
        }
      } catch (err) {
        console.warn('Failed to load assignments for revoke picker; using cached assignees', err);
      }
      targets.push(...buildRevokeTargets([req]));
    }
    return targets;
  }, []);

  const beginRevokeFlow = useCallback(
    (requirementsToRevoke: Requirement[]) => {
      if (!currentUser) return;
      void resolveRevokeTargets(requirementsToRevoke)
        .then((targets) => {
          if (targets.length === 0) return;

          if (canRevokeWithoutPicker(targets)) {
            return executeRevokes(targets)
              .then(() => {
                setSelectedIds(new Set());
                notify.success('Assignment revoked successfully.');
              })
              .catch((err) => {
                console.error('Failed to revoke:', err);
                notify.error(err instanceof Error ? err.message : 'Could not revoke assignment.');
              });
          }

          setRevokeTargets(targets);
          setShowRevokeModal(true);
        })
        .catch((err) => {
          console.error('Failed to prepare revoke picker:', err);
          notify.error(err instanceof Error ? err.message : 'Could not load assignees to revoke.');
        });
    },
    [currentUser, executeRevokes, resolveRevokeTargets],
  );

  const handleBulkRevoke = useCallback(() => {
    beginRevokeFlow(selectedRequirements);
  }, [beginRevokeFlow, selectedRequirements]);

  const handleConfirmRevoke = useCallback(
    async (selected: RevokeAssignmentTarget[]) => {
      if (!currentUser || selected.length === 0) return;
      setRevokeSubmitting(true);
      try {
        await executeRevokes(selected);
        setShowRevokeModal(false);
        setRevokeTargets([]);
        setSelectedIds(new Set());
        notify.success('Selected assignment(s) revoked successfully.');
      } catch (err) {
        console.error('Failed to revoke:', err);
        notify.error(err instanceof Error ? err.message : 'Could not revoke assignment.');
      } finally {
        setRevokeSubmitting(false);
      }
    },
    [currentUser, executeRevokes],
  );

  const toggleRecruiter = useCallback((id: string) => {
    setSelectedRecruiterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleRevoke = useCallback(
    (requirementId: string) => {
      const requirement = requirements.find((r) => r.id === requirementId);
      if (!requirement) return;
      beginRevokeFlow([requirement]);
    },
    [requirements, beginRevokeFlow],
  );

  const includeSelfInAssign = currentUser?.id
    ? selectedRecruiterIds.includes(currentUser.id)
    : false;

  const toggleIncludeSelfInAssign = useCallback(() => {
    if (!currentUser?.id) return;
    setSelectedRecruiterIds((prev) =>
      prev.includes(currentUser.id)
        ? prev.filter((id) => id !== currentUser.id)
        : [...prev, currentUser.id],
    );
  }, [currentUser?.id]);

  const options = useMemo(() => {
    return FILTER_OPTIONS.map((f) => ({
      value: f,
      label: f === 'All' ? 'All statuses' : f,
    }));
  }, []);

  const persistStatusQuery = useCallback(
    (next: DashboardFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('status', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="space-y-8">
      {assignNotice && (
        <div className="fixed right-5 top-5 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          {assignNotice}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">
            Requirements Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track and manage all hiring requirements
          </p>
        </div>

        <Link
          href="/requirements/new"
          onClick={() => bumpFormMountKey('requirement_create')}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] hover:bg-blue-700"
        >
          <PlusCircle className="h-4 w-4" />
          Create New Job Demand
        </Link>
      </div>

      {recruiterParam?.trim() ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
          <span>
            Showing requirements worked on by{' '}
            <span className="font-semibold">
              {recruiters.find((r) => r.id === recruiterParam)?.name ||
                recruiters.find((r) => r.id === recruiterParam)?.email ||
                'selected recruiter'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete('recruiter');
              const qs = params.toString();
              router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
            }}
            className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            Clear recruiter filter
          </button>
        </div>
      ) : null}

      {clientParam?.trim() ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
          <span>
            Showing requirements for client{' '}
            <span className="font-semibold">{decodeURIComponent(clientParam)}</span>
            {openOnly ? ' (open only)' : filter !== 'All' ? ` — ${filter}` : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete('client');
              params.delete('openOnly');
              const qs = params.toString();
              router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
              setSearchClient('');
            }}
            className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            Clear client filter
          </button>
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total"
          value={summary.total}
          icon={<ClipboardList className="h-5 w-5" />}
          color="purple"
          href="/requirements?status=All"
          linkScroll={false}
        />
        <StatCard
          label="Submissions"
          value={summary.submissions}
          icon={<Send className="h-5 w-5" />}
          color="emerald"
          href="/submissions"
        />
        <StatCard
          label="Unassigned"
          value={summary.unassigned}
          icon={<UserX className="h-5 w-5" />}
          color="rose"
          href="/requirements?status=Unassigned"
          linkScroll={false}
        />
        <StatCard
          label="Assigned"
          value={summary.assigned}
          icon={<UserCheck className="h-5 w-5" />}
          color="blue"
          href="/requirements?status=Assigned"
          linkScroll={false}
        />
        <StatCard
          label="In Progress"
          value={summary.inProgress}
          icon={<Send className="h-5 w-5" />}
          color="amber"
          href="/requirements?status=Submitted"
          linkScroll={false}
        />
        <StatCard
          label="Interviews"
          value={summary.interviews}
          icon={<MessageSquare className="h-5 w-5" />}
          color="indigo"
          href="/requirements?status=Interview"
          linkScroll={false}
        />
        <StatCard
          label="Selected"
          value={summary.selected}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="emerald"
          href="/requirements?status=Selected"
          linkScroll={false}
        />
        <StatCard
          label="Rejected"
          value={summary.rejected}
          icon={<XCircle className="h-5 w-5" />}
          color="rose"
          href="/requirements?status=Rejected"
          linkScroll={false}
        />
      </div>

      {/* Search bar + Filter */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-center">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchReqId}
              onChange={(e) => setSearchReqId(e.target.value)}
              placeholder="Requirement ID"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
            />
          </div>
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchClient}
              onChange={(e) => setSearchClient(e.target.value)}
              placeholder="Client name"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
            />
          </div>
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchRole}
              onChange={(e) => setSearchRole(e.target.value)}
              placeholder="Role / Location"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
            />
          </div>
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchOwner}
              onChange={(e) => setSearchOwner(e.target.value)}
              placeholder="Owner / Recruiter"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <Select
              instanceId={statusSelectId}
              inputId={statusSelectId}
              options={options}
              value={options.find((o) => o.value === filter) ?? null}
              onChange={(selected) => {
                const next = parseDashboardFilterFromQuery(
                  String(selected?.value ?? ''),
                  recruiterParam,
                );
                setFilter(next);
                persistStatusQuery(next);
              }}
              isSearchable
              maxMenuHeight={250}
              menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
              menuPosition="fixed"
              menuShouldBlockScroll={false}
              styles={{
                control: (base, state) => ({
                  ...base,
                  minHeight: 42,
                  borderRadius: 12,
                  borderColor: state.isFocused ? '#3b82f6' : '#e5e7eb',
                  boxShadow: state.isFocused
                    ? '0 0 0 3px rgba(59,130,246,0.15)'
                    : 'none',
                }),
                menu: (base) => ({
                  ...base,
                  borderRadius: 14,
                  padding: 6,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                  zIndex: 60,
                }),
                menuPortal: (base) => ({
                  ...base,
                  zIndex: 9999,
                }),
              }}
            />
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          {sortedForTable.length} requirement(s)
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && currentUser && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            {selectedIds.size} requirement(s) selected
          </span>
          <div className="flex items-center gap-2">
            {selectedAssignedCount === 0 ? (
              <>
                <button
                  onClick={async () => {
                    if (!currentUser) return;
                    try {
                      await Promise.all(
                        selectedRequirements.map((r) =>
                          assignRequirement(r.id, currentUser, currentUser.name),
                        ),
                      );
                      setSelectedIds(new Set());
                      setAssignNotice('Your selection has been routed to work.');
                    } catch (err) {
                      console.error('Failed to self-assign:', err);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  <UserPlus className="h-4 w-4" />
                  Self assign
                </button>
                <button
                  onClick={() => {
                    setAssignSearch('');
                    setShowAssignModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 dark:border-blue-500 dark:bg-transparent dark:text-blue-300 dark:hover:bg-blue-950/30"
                >
                  <UserPlus className="h-4 w-4" />
                  Assign to
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setAssignSearch('');
                  setShowAssignModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                <UserPlus className="h-4 w-4" />
                Reassign
              </button>
            )}
            {selectedAssignedCount > 0 && (
              <button
                onClick={handleBulkRevoke}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <UserMinus className="h-4 w-4" />
                Resign Assignment
              </button>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          </div>
        </div>
      )}

      <RevokeAssignmentModal
        open={showRevokeModal}
        targets={revokeTargets}
        submitting={revokeSubmitting}
        onClose={() => {
          if (revokeSubmitting) return;
          setShowRevokeModal(false);
          setRevokeTargets([]);
        }}
        onConfirm={handleConfirmRevoke}
      />

      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-zinc-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                Assign to recruiters
              </h3>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedRecruiterIds([]);
                  setAssignSearch('');
                }}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto p-6">
              <p className="mb-3 text-sm text-gray-600 dark:text-zinc-400">
                Select yourself and/or other recruiters. Each selected requirement will be
                assigned to everyone you choose (existing assignees are kept).
              </p>
              {currentUser?.id ? (
                <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                  <input
                    type="checkbox"
                    checked={includeSelfInAssign}
                    onChange={toggleIncludeSelfInAssign}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <div>
                    <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                      Assign myself ({currentUser.name || 'You'})
                    </div>
                    <div className="text-xs text-blue-700/80 dark:text-blue-200/80">
                      Include you in this assignment along with any recruiters selected below.
                    </div>
                  </div>
                </label>
              ) : null}
              <input
                type="text"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                placeholder="Search recruiter by name or email"
                className="mb-3 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <p className="mb-3 text-xs text-gray-500 dark:text-zinc-400">
                Showing {filteredAssignableRecruiters.length} of {assignableRecruiters.length} recruiters.
              </p>
              {filteredAssignableRecruiters.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
                  No recruiters found.
                </div>
              ) : (
                filteredAssignableRecruiters.map((r) => {
                  const checked = selectedRecruiterIds.includes(r.id);
                  return (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-3 transition hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecruiter(r.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                          {r.name}
                          {currentUser?.id === r.id ? (
                            <span className="ml-1.5 text-xs font-semibold text-blue-600 dark:text-blue-300">
                              (You)
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-zinc-400">
                          {r.title} · {r.email}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-zinc-700">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedRecruiterIds([]);
                  setAssignSearch('');
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={selectedRecruiterIds.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                Assign {selectedRecruiterIds.length} recruiter(s) to {selectedIds.size} requirement(s)
              </button>
            </div>
          </div>
        </div>
      )}

      <RequirementTable
        requirements={paginatedData}
        filter={filter}
        slaDays={10}
        selectedIds={selectedIds}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        onRevoke={handleRevoke}
      />


      {/* Pagination */}
      {sortedForTable.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              Showing {(currentPage - 1) * rowsPerPage + 1}-
              {Math.min(currentPage * rowsPerPage, sortedForTable.length)} of{' '}
              {sortedForTable.length}
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400">
              <span>Rows Per Page</span>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:focus:border-blue-500 dark:focus:ring-blue-900/50"
              >
                {ROWS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              ‹
            </button>
            <span className="min-w-[100px] text-center text-sm font-medium text-gray-700 dark:text-zinc-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(p + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
