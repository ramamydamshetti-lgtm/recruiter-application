/**
 * Report aggregation controller.
 * Computes admin and recruiter report metrics from requirements + submissions.
 */

import type { Requirement } from '@/lib/domain/requirements/types';
import type { CandidateSubmission } from '@/lib/domain/candidates/types';
import type { Recruiter } from '@/lib/domain/requirements/types';
import {
  isDateInRange,
  getBucketKey,
  getBucketLabelsBetween,
} from './dateFilterController';
import { applySearchToRequirements } from './searchQueryBuilder';
import type {
  ReportFilters,
  ReportSearchQuery,
  AdminReportAggregate,
  RecruiterReportAggregate,
  RecruiterPerformanceRow,
  ClientPerformanceRow,
  RecruiterRequirementRow,
} from './types';
import { getDashboardStatus, recruiterOwnsRequirement } from '@/lib/domain/requirements/logic';

type SubmissionLike = {
  id: string;
  candidateId?: string;
  jdId?: string;
  candidate?: { id?: string };
  requirement?: { id?: string };
  submittedBy: { id: string; name: string; email: string };
  submittedOn: string;
  status: string;
};

function submissionRequirementId(sub: SubmissionLike): string {
  return String(sub.jdId ?? sub.requirement?.id ?? '').trim();
}

function submissionCandidateId(sub: SubmissionLike): string {
  return String(sub.candidateId ?? sub.candidate?.id ?? '').trim();
}

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function dedupeSubmissionsByCandidateRequirement<T extends SubmissionLike>(items: T[]): T[] {
  const latestByKey = new Map<string, T>();
  for (const item of items) {
    const candidateId = submissionCandidateId(item);
    const jdId = submissionRequirementId(item);
    if (!candidateId || !jdId) continue;
    const key = `${candidateId}::${jdId}`;
    const prev = latestByKey.get(key);
    if (!prev || toMs(item.submittedOn) > toMs(prev.submittedOn)) {
      latestByKey.set(key, item);
    }
  }
  return [...latestByKey.values()].sort((a, b) => toMs(b.submittedOn) - toMs(a.submittedOn));
}

function canonicalClientName(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'UNKNOWN CLIENT';
  return raw.replace(/\s+/g, ' ').toUpperCase();
}

function applyRequirementSearchFilters(
  requirements: Requirement[],
  filters: ReportFilters,
  query?: ReportSearchQuery,
  options?: { skipDate?: boolean },
): Requirement[] {
  const start = filters.startDate;
  const end = filters.endDate;
  let list = requirements.filter((r) => !r.isDeleted);
  if (!options?.skipDate) {
    list = list.filter((r) => isDateInRange(r.createdAt, start, end));
  }
  if (filters.status && filters.status !== 'All') {
    list = list.filter(
      (r) => getDashboardStatus(r) === filters.status || r.status === filters.status,
    );
  }
  if (filters.recruiterId) {
    list = list.filter((r) => recruiterOwnsRequirement(r, filters.recruiterId!));
  }
  if (filters.clientName) {
    const needle = filters.clientName.toLowerCase();
    list = list.filter((r) => {
      const hay = `${r.submittingTo ?? ''} ${r.clientLeadPoc ?? ''}`.trim().toLowerCase();
      return hay.includes(needle);
    });
  }
  if (filters.jobId) {
    const jid = filters.jobId.toLowerCase();
    list = list.filter(
      (r) =>
        (r.id ?? '').toLowerCase().includes(jid) ||
        String(r.requirementId ?? '')
          .toLowerCase()
          .includes(jid),
    );
  }
  if (query && Object.keys(query).length > 0) {
    list = applySearchToRequirements(list, query);
  }
  return list;
}

function filterRequirementsByDateAndSearch(
  requirements: Requirement[],
  filters: ReportFilters,
  query?: ReportSearchQuery,
): Requirement[] {
  return applyRequirementSearchFilters(requirements, filters, query);
}

function filterSubmissionsByDate(
  submissions: SubmissionLike[],
  startDate: string,
  endDate: string,
): SubmissionLike[] {
  return submissions.filter((s) => isDateInRange(s.submittedOn, startDate, endDate));
}

/** Build submission count per requirement id from submissions list. */
function getSubmissionCountByReqId(submissions: SubmissionLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of submissions) {
    const reqId = submissionRequirementId(s);
    if (!reqId) continue;
    map.set(reqId, (map.get(reqId) ?? 0) + 1);
  }
  return map;
}

function buildBucketCountMap(
  items: { date: string }[],
  periodType: ReportFilters['periodType'],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = getBucketKey(item.date, periodType);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** Requirements a recruiter has worked on (assigned and/or submitted candidates). */
export function getRecruiterWorkedRequirements(
  requirements: Requirement[],
  submissions: SubmissionLike[],
  recruiterId: string,
): Requirement[] {
  const id = recruiterId.trim();
  if (!id) return [];
  const byId = new Map<string, Requirement>();
  for (const r of requirements) {
    if (r.isDeleted) continue;
    if (recruiterOwnsRequirement(r, id)) byId.set(r.id, r);
  }
  for (const s of submissions) {
    if (s.submittedBy?.id !== id) continue;
    const reqId = submissionRequirementId(s);
    if (!reqId) continue;
    if (byId.has(reqId)) continue;
    const match = requirements.find((r) => r.id === reqId && !r.isDeleted);
    if (match) byId.set(reqId, match);
  }
  return [...byId.values()];
}

export function countRecruiterLifetimeSubmissions(
  submissions: SubmissionLike[],
  recruiterId: string,
): number {
  const id = recruiterId.trim();
  if (!id) return 0;
  return submissions.filter((s) => s.submittedBy?.id === id).length;
}

/** Admin/Client report aggregation. */
export function aggregateAdminReport(
  requirements: Requirement[],
  submissions: SubmissionLike[],
  recruiters: Recruiter[],
  filters: ReportFilters,
  searchQuery?: ReportSearchQuery,
): AdminReportAggregate {
  const filteredReqs = filterRequirementsByDateAndSearch(
    requirements,
    filters,
    searchQuery,
  );
  const filteredSubs = filterSubmissionsByDate(
    submissions,
    filters.startDate,
    filters.endDate,
  );
  const dedupedFilteredSubs = dedupeSubmissionsByCandidateRequirement(filteredSubs);
  const subCountByReq = getSubmissionCountByReqId(dedupedFilteredSubs);

  const totalRequirementsSent = filteredReqs.length;
  const totalRequirementsAssigned = filteredReqs.filter(
    (r) => r.assignment === 'Assigned',
  ).length;
  const totalCandidatesSubmitted = dedupedFilteredSubs.length;
  const submissionRatioPerRequirement =
    totalRequirementsSent > 0 ? totalCandidatesSubmitted / totalRequirementsSent : 0;
  const openRequirements = filteredReqs.filter(
    (r) => r.status !== 'Closed' && getDashboardStatus(r) !== 'Closed',
  ).length;
  const closedRequirements = filteredReqs.filter(
    (r) => r.status === 'Closed' || getDashboardStatus(r) === 'Closed',
  ).length;

  const labels = getBucketLabelsBetween(
    filters.startDate,
    filters.endDate,
    filters.periodType,
  );
  const reqBucketCounts = buildBucketCountMap(
    filteredReqs.map((r) => ({ date: r.createdAt })),
    filters.periodType,
  );
  const subBucketCounts = buildBucketCountMap(
    dedupedFilteredSubs.map((s) => ({ date: s.submittedOn })),
    filters.periodType,
  );
  const trendBuckets = labels.map((label) => ({
    label,
    requirements: reqBucketCounts.get(label) ?? 0,
    submissions: subBucketCounts.get(label) ?? 0,
  }));

  const statusMap = new Map<string, number>();
  for (const r of filteredReqs) {
    const s = getDashboardStatus(r);
    const key = s === 'All' ? 'Unassigned' : s;
    statusMap.set(key, (statusMap.get(key) ?? 0) + 1);
  }
  const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({
    status,
    count,
  }));

  const subsByRecruiter = new Map<string, SubmissionLike[]>();
  for (const sub of dedupedFilteredSubs) {
    const recruiterId = sub.submittedBy?.id;
    if (!recruiterId) continue;
    if (!subsByRecruiter.has(recruiterId)) subsByRecruiter.set(recruiterId, []);
    subsByRecruiter.get(recruiterId)!.push(sub);
  }

  const recruiterPerformance: RecruiterPerformanceRow[] = (recruiters || []).map((rec) => {
    const recReqs = filteredReqs.filter((r) => recruiterOwnsRequirement(r, rec.id));
    const recSubs = subsByRecruiter.get(rec.id) ?? [];
    const selected = recSubs.filter((s) => s.status === 'Selected').length;
    const successRate = recSubs.length > 0 ? (selected / recSubs.length) * 100 : 0;
    const openJobs = recReqs.filter(
      (r) => r.status !== 'Closed' && getDashboardStatus(r) !== 'Closed',
    ).length;
    const closedJobs = recReqs.filter(
      (r) => r.status === 'Closed' || getDashboardStatus(r) === 'Closed',
    ).length;
    return {
      recruiterId: rec.id,
      recruiterName: rec.name ?? '—',
      recruiterEmail: rec.email ?? '—',
      requirementsAssigned: recReqs.length,
      candidatesSubmitted: recSubs.length,
      submissionsSuccessRate: Math.round(successRate * 10) / 10,
      openJobs,
      closedJobs,
    };
  });

  const clientMap = new Map<string, Requirement[]>();
  for (const r of filteredReqs) {
    const name = canonicalClientName(r.submittingTo || r.clientLeadPoc || 'Unknown client');
    if (!clientMap.has(name)) clientMap.set(name, []);
    clientMap.get(name)!.push(r);
  }
  const reqIdToClientName = new Map<string, string>();
  for (const [clientName, reqs] of clientMap.entries()) {
    for (const req of reqs) reqIdToClientName.set(req.id, clientName);
  }
  const subsCountByClient = new Map<string, number>();
  for (const sub of dedupedFilteredSubs) {
    const clientName = reqIdToClientName.get(submissionRequirementId(sub));
    if (!clientName) continue;
    subsCountByClient.set(clientName, (subsCountByClient.get(clientName) ?? 0) + 1);
  }

  const clientPerformance: ClientPerformanceRow[] = Array.from(
    clientMap.entries(),
  ).map(([clientName, reqs]) => {
    const assigned = reqs.filter((r) => r.assignment === 'Assigned').length;
    const openCount = reqs.filter(
      (r) => r.status !== 'Closed' && getDashboardStatus(r) !== 'Closed',
    ).length;
    const closedCount = reqs.filter(
      (r) => r.status === 'Closed' || getDashboardStatus(r) === 'Closed',
    ).length;
    const subsForClientCount = subsCountByClient.get(clientName) ?? 0;
    return {
      clientName,
      requirementsSent: reqs.length,
      requirementsAssigned: assigned,
      candidatesSubmitted: subsForClientCount,
      submissionRatio: reqs.length > 0 ? subsForClientCount / reqs.length : 0,
      openCount,
      closedCount,
    };
  });

  return {
    totalRequirementsSent,
    totalRequirementsAssigned,
    totalCandidatesSubmitted,
    submissionRatioPerRequirement,
    openRequirements,
    closedRequirements,
    trendBuckets,
    byStatus,
    recruiterPerformance,
    clientPerformance,
  };
}

/** Recruiter (profile) report: only their data. */
export function aggregateRecruiterReport(
  requirements: Requirement[],
  submissions: SubmissionLike[],
  recruiterId: string,
  filters: ReportFilters,
  searchQuery?: ReportSearchQuery,
): RecruiterReportAggregate {
  const id = recruiterId.trim();
  if (!id) {
    return {
      requirementsAssigned: 0,
      candidatesSubmitted: 0,
      submissionSuccessRate: 0,
      openJobsHandled: 0,
      closedJobsHandled: 0,
      personalTrend: [],
      requirementRows: [],
    };
  }

  const recruiterSubsAll = submissions.filter((s) => s.submittedBy?.id === id);
  const filteredSubs = filterSubmissionsByDate(
    recruiterSubsAll,
    filters.startDate,
    filters.endDate,
  );
  const dedupedFilteredSubs = dedupeSubmissionsByCandidateRequirement(filteredSubs);
  const subReqIdsInPeriod = new Set(
    dedupedFilteredSubs.map((s) => submissionRequirementId(s)).filter(Boolean),
  );

  const allReqs = requirements.filter((r) => !r.isDeleted);
  const workedAll = getRecruiterWorkedRequirements(allReqs, recruiterSubsAll, id);
  const filtersNoRecruiter: ReportFilters = { ...filters, recruiterId: undefined };
  let workedFiltered = applyRequirementSearchFilters(
    workedAll,
    filtersNoRecruiter,
    searchQuery,
    { skipDate: true },
  );
  workedFiltered = workedFiltered.filter((r) => {
    const createdInRange = isDateInRange(r.createdAt, filters.startDate, filters.endDate);
    return createdInRange || subReqIdsInPeriod.has(r.id);
  });

  const selected = dedupedFilteredSubs.filter((s) => s.status === 'Selected').length;
  const submissionSuccessRate =
    dedupedFilteredSubs.length > 0 ? (selected / dedupedFilteredSubs.length) * 100 : 0;
  const openJobsHandled = workedFiltered.filter(
    (r) => r.status !== 'Closed' && getDashboardStatus(r) !== 'Closed',
  ).length;
  const closedJobsHandled = workedFiltered.filter(
    (r) => r.status === 'Closed' || getDashboardStatus(r) === 'Closed',
  ).length;

  const labels = getBucketLabelsBetween(
    filters.startDate,
    filters.endDate,
    filters.periodType,
  );
  const reqsInPeriodForTrend = workedFiltered.filter((r) =>
    isDateInRange(r.createdAt, filters.startDate, filters.endDate),
  );
  const recruiterReqBucketCounts = buildBucketCountMap(
    reqsInPeriodForTrend.map((r) => ({ date: r.createdAt })),
    filters.periodType,
  );
  const recruiterSubBucketCounts = buildBucketCountMap(
    dedupedFilteredSubs.map((s) => ({ date: s.submittedOn })),
    filters.periodType,
  );
  const personalTrend = labels.map((label) => ({
    label,
    requirements: recruiterReqBucketCounts.get(label) ?? 0,
    submissions: recruiterSubBucketCounts.get(label) ?? 0,
  }));

  const submissionCountByReq = getSubmissionCountByReqId(dedupedFilteredSubs);
  const requirementRows: RecruiterRequirementRow[] = workedFiltered.map((r) => ({
    jobId: r.id,
    clientName: (r.submittingTo || r.clientLeadPoc || '—').trim() || '—',
    status: getDashboardStatus(r) === 'All' ? 'Unassigned' : getDashboardStatus(r),
    submissionsCount: submissionCountByReq.get(r.id) ?? r.submissionsCount ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return {
    requirementsAssigned: workedFiltered.length,
    candidatesSubmitted: dedupedFilteredSubs.length,
    submissionSuccessRate: Math.round(submissionSuccessRate * 10) / 10,
    openJobsHandled,
    closedJobsHandled,
    personalTrend,
    requirementRows,
  };
}
