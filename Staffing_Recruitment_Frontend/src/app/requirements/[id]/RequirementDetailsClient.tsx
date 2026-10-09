'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import { getDashboardStatus, getOpenDays } from '@/lib/domain/requirements/logic';
import { Badge } from '@/components/ui/Badge';
import {
  downloadRequirementSourceEmailPdf,
  getRequirement,
  getRequirementActivities,
  getRequirementAssignments,
  type RequirementActivityRow,
  type RequirementAssignmentRow,
} from '@/lib/api/requirements';
import type { Requirement } from '@/lib/domain/requirements/types';
import { getSubmissions, patchSubmission } from '@/lib/api/submissions';
import { getInterviews, updateInterview, type InterviewRecord } from '@/lib/api/interviews';
import {
  batchGetOfferLettersBySubmissions,
  recordOfferLetterResponse,
  type OfferLetterRecord,
} from '@/lib/api/offerLetters';
import type { Submission } from '@/lib/domain/submissions/types';
import { canActOnSubmission, canForwardLeadSubmission, canPerformSubmissionPipelineAction } from '@/lib/domain/submissions/permissions';
import { isLeadRole } from '@/lib/auth/roles';
import { StickyRequirementHeader } from '@/components/requirementOverview/StickyRequirementHeader';
import { RecruitmentTimeline } from '@/components/requirementOverview/RecruitmentTimeline';
import { DashboardWidgets, type DashboardWidgetKey } from '@/components/requirementOverview/DashboardWidgets';
import { RequirementTabs, type RequirementOverviewTabId } from '@/components/requirementOverview/RequirementTabs';
import { CandidatePipelineBoard } from '@/components/requirementOverview/CandidatePipelineBoard';
import { CandidateDetailsDrawer } from '@/components/requirementOverview/CandidateDetailsDrawer';
import { ActivityTimelinePanel } from '@/components/requirementOverview/ActivityTimelinePanel';
import { AssignmentHistoryPanel } from '@/components/requirementOverview/AssignmentHistoryPanel';
import { RequirementHistoryPanel } from '@/components/requirementOverview/RequirementHistoryPanel';
import { SubmitToClientDrawer } from '@/components/requirementOverview/SubmitToClientDrawer';
import { InterviewSchedulerDrawer } from '@/components/requirementOverview/InterviewSchedulerDrawer';
import { RescheduleDrawer } from '@/components/requirementOverview/RescheduleDrawer';
import { FeedbackDrawer } from '@/components/requirementOverview/FeedbackDrawer';
import { OfferReleaseDrawer } from '@/components/requirementOverview/OfferReleaseDrawer';
import { CandidateResponseDrawer } from '@/components/requirementOverview/CandidateResponseDrawer';
import { RejectionReasonDialog } from '@/components/requirementOverview/RejectionReasonDialog';
import { InterviewRoundsTab } from '@/components/requirementOverview/InterviewRoundsTab';
import { OffersManagementTab } from '@/components/requirementOverview/OffersManagementTab';
import { SmartSuggestionsBanner } from '@/components/requirementOverview/SmartSuggestionsBanner';
import { SlaAlertsBadge } from '@/components/requirementOverview/SlaAlertsBadge';
import { computeRecruitmentTimelineIndex } from '@/lib/requirementOverview/timelineDerive';
import {
  isAnySubmittedStatus,
  isClientSubmittedStatus,
  isLeadReviewStatus,
} from '@/lib/domain/submissions/status';
import {
  canUserWorkOnRequirement,
  getRequirementWorkBlockReason,
} from '@/lib/domain/requirements/workPermissions';
import { RequirementViewOnlyBanner } from '@/components/requirements/RequirementViewOnlyBanner';
import { useRequirementOverviewLiveSync } from '@/hooks/useRequirementOverviewLiveSync';
import { notify } from '@/lib/notify';
import { formatDateTime } from '@/lib/utils/dateTime';
import { useCardMetrics } from '@/lib/hooks/useCardMetrics';
import {
  batchSubmissionActivityDedupeKey,
  buildSubmissionActivityNotificationMessage,
  filterUnseenActivities,
  hasActivityNotificationSeed,
  isOwnSubmissionActivity,
  markActivitiesSeen,
} from '@/lib/domain/requirements/activityNotifications';
import { pushAppNotification } from '@/lib/notifications/pushAppNotification';

function normalizeRoundLabel(raw: string | null | undefined): string {
  const r = String(raw ?? '').trim().toUpperCase();
  if (r === 'L1' || r.startsWith('L1')) return 'L1';
  if (r === 'L2' || r.startsWith('L2')) return 'L2';
  if (r === 'FINAL' || r.startsWith('FINAL')) return 'Final';
  return String(raw ?? '').trim() || 'Interview';
}

export function RequirementDetailsClient({ id }: { id: string }) {
  const { requirements, assignRequirement, revokeRequirement, refresh: refreshRequirements } =
    useRequirementsStore();
  const { currentUser, recruiters, refresh: refreshAuth } = useAuth();
  const { dispatch } = useNotifications();
  const requirementFromStore = useMemo(
    () => requirements.find((r) => r.id === id || r.requirementId === id),
    [requirements, id],
  );
  const [fetchedRequirement, setFetchedRequirement] = useState<Requirement | null>(null);
  const [requirementLoading, setRequirementLoading] = useState(true);
  const requirement = fetchedRequirement ?? requirementFromStore;
  const resolvedRequirementId = requirement?.id ?? id;
  const { data: cardMetrics, refresh: refreshWidgetMetrics } = useCardMetrics(['requirement'], {
    requirementId: resolvedRequirementId,
    enabled: Boolean(resolvedRequirementId),
  });
  const [assignRows, setAssignRows] = useState<RequirementAssignmentRow[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [activityRows, setActivityRows] = useState<RequirementActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [sourcePdfLoading, setSourcePdfLoading] = useState(false);
  const [assignNotice, setAssignNotice] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<Submission[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<RequirementOverviewTabId>('overview');
  const [interviewRows, setInterviewRows] = useState<InterviewRecord[]>([]);
  const [interviewsLoading, setInterviewsLoading] = useState(false);
  const [offersBySubmissionId, setOffersBySubmissionId] = useState<
    Record<string, OfferLetterRecord | undefined>
  >({});

  const [submitDrawerOpen, setSubmitDrawerOpen] = useState(false);
  const [submitPreselectedIds, setSubmitPreselectedIds] = useState<string[]>([]);
  const [submitDrawerMode, setSubmitDrawerMode] = useState<'lead' | 'client'>('lead');
  const [submitForwardOnly, setSubmitForwardOnly] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleSubmissionId, setScheduleSubmissionId] = useState<string | null>(null);
  const [scheduleRound, setScheduleRound] = useState<'L1' | 'L2' | 'Final'>('L1');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSubmissionId, setRescheduleSubmissionId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSubmissionId, setFeedbackSubmissionId] = useState<string | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerSubmissionId, setOfferSubmissionId] = useState<string | null>(null);
  const [responseOpen, setResponseOpen] = useState(false);
  const [responseSubmissionId, setResponseSubmissionId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectSubmissionId, setRejectSubmissionId] = useState<string | null>(null);
  const [detailsSubmissionId, setDetailsSubmissionId] = useState<string | null>(null);
  const [assignOwnerModalOpen, setAssignOwnerModalOpen] = useState(false);
  const [selectedRecruiterIds, setSelectedRecruiterIds] = useState<string[]>([]);
  const [assignSearch, setAssignSearch] = useState('');

  const showToast = useCallback((msg: string) => {
    notify.success(msg);
  }, []);

  useEffect(() => {
    void refreshRequirements({ limit: 500 });
  }, [refreshRequirements]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRequirementLoading(true);
      try {
        const row = await getRequirement(id);
        if (!cancelled) setFetchedRequirement(row);
      } catch {
        if (!cancelled) setFetchedRequirement(null);
      } finally {
        if (!cancelled) setRequirementLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const reloadActivity = useCallback(async () => {
    const rid = resolvedRequirementId;
    if (!rid) return;
    setActivityLoading(true);
    try {
      const rows = await getRequirementActivities(rid);
      setActivityRows(rows);
    } catch {
      setActivityRows([]);
    } finally {
      setActivityLoading(false);
    }
  }, [resolvedRequirementId]);

  const reloadAssignments = useCallback(async () => {
    if (!resolvedRequirementId) return;
    setAssignLoading(true);
    try {
      const rows = await getRequirementAssignments(resolvedRequirementId);
      setAssignRows(rows);
    } catch {
      setAssignRows([]);
    } finally {
      setAssignLoading(false);
    }
  }, [resolvedRequirementId]);

  const reloadSubmissions = useCallback(async () => {
    if (!resolvedRequirementId) {
      setHistoryRows([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const rows = await getSubmissions({ requirementId: resolvedRequirementId });
      setHistoryRows(
        [...rows].sort((a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime()),
      );
    } catch {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
      void refreshWidgetMetrics();
    }
  }, [resolvedRequirementId, refreshWidgetMetrics]);

  const reloadInterviews = useCallback(async () => {
    if (!resolvedRequirementId) {
      setInterviewRows([]);
      return;
    }
    setInterviewsLoading(true);
    try {
      const rows = await getInterviews({ requirementId: resolvedRequirementId, limit: 500 });
      setInterviewRows(rows);
    } catch {
      setInterviewRows([]);
    } finally {
      setInterviewsLoading(false);
    }
  }, [resolvedRequirementId]);

  useEffect(() => {
    if (!resolvedRequirementId) {
      setAssignRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setAssignLoading(true);
      try {
        const rows = await getRequirementAssignments(resolvedRequirementId);
        if (!cancelled) setAssignRows(rows);
      } catch {
        if (!cancelled) setAssignRows([]);
      } finally {
        if (!cancelled) setAssignLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedRequirementId]);

  useEffect(() => {
    void reloadSubmissions();
  }, [reloadSubmissions]);

  useEffect(() => {
    void reloadInterviews();
  }, [reloadInterviews]);

  useEffect(() => {
    if (!resolvedRequirementId) {
      setActivityRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setActivityLoading(true);
      try {
        const rows = await getRequirementActivities(resolvedRequirementId);
        if (!cancelled) setActivityRows(rows);
      } catch {
        if (!cancelled) setActivityRows([]);
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedRequirementId]);

  useEffect(() => {
    if (!resolvedRequirementId || activityLoading) return;

    const userKey = String(currentUser?.id ?? currentUser?.email ?? '').trim();
    if (!userKey) return;

    if (!hasActivityNotificationSeed(userKey, resolvedRequirementId)) {
      // First time on this requirement for this user: mark existing activity as seen (no popups).
      markActivitiesSeen(userKey, resolvedRequirementId, activityRows);
      return;
    }

    const userEmail = String(currentUser?.email ?? '').trim().toLowerCase();
    const newlyArrived = filterUnseenActivities(userKey, resolvedRequirementId, activityRows);
    const submissionActivities = newlyArrived.filter(
      (row) =>
        row.action === 'submission.created' && !isOwnSubmissionActivity(row, currentUser),
    );

    if (submissionActivities.length === 0) return;

    markActivitiesSeen(userKey, resolvedRequirementId, submissionActivities);

    pushAppNotification(dispatch, {
      dedupeKey: `activity:${userKey}:${resolvedRequirementId}:submissions:${batchSubmissionActivityDedupeKey(submissionActivities)}`,
      type: 'info',
      title: 'Recruiter Submission',
      message: buildSubmissionActivityNotificationMessage(submissionActivities),
      showToast: true,
      showBell: false,
    });
  }, [
    activityRows,
    activityLoading,
    resolvedRequirementId,
    currentUser?.id,
    currentUser?.email,
    dispatch,
  ]);

  useEffect(() => {
    if (historyRows.length === 0) {
      setOffersBySubmissionId({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = historyRows.map((r) => r.id);
        const map = await batchGetOfferLettersBySubmissions(ids);
        if (!cancelled) setOffersBySubmissionId(map);
      } catch {
        if (!cancelled) setOffersBySubmissionId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyRows]);

  useEffect(() => {
    if (!assignNotice) return;
    const t = window.setTimeout(() => setAssignNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [assignNotice]);

  const refreshAll = useCallback(async () => {
    await reloadSubmissions();
    await reloadInterviews();
    await reloadActivity();
  }, [reloadSubmissions, reloadInterviews, reloadActivity]);

  useRequirementOverviewLiveSync({
    enabled: Boolean(resolvedRequirementId),
    onRefresh: refreshAll,
  });

  const activeRecruiterIds = useMemo(
    () =>
      new Set(
        assignRows.filter((row) => row.status === 'ACTIVE').map((row) => row.recruiterId),
      ),
    [assignRows],
  );
  const workBlockReason = getRequirementWorkBlockReason(requirement, currentUser?.id, {
    activeAssigneeIds: activeRecruiterIds,
  });
  const canWorkOnRequirement = canUserWorkOnRequirement(requirement, currentUser?.id, {
    activeAssigneeIds: activeRecruiterIds,
  });

  const handleCardAction = useCallback(
    async (action: string, submissionId: string) => {
      if (!canWorkOnRequirement) {
        notify.warning(workBlockReason ?? 'This requirement is view only.');
        return;
      }
      const submission = historyRows.find((s) => s.id === submissionId);
      if (action === 'forward_client') {
        if (!canForwardLeadSubmission(submission, currentUser)) {
          notify.warning('Only leads can forward submitted-to-lead candidates to the client.');
          return;
        }
        setSubmitDrawerMode('client');
        setSubmitForwardOnly(true);
        setSubmitPreselectedIds([submissionId]);
        setSubmitDrawerOpen(true);
        return;
      }
      if (!canActOnSubmission(submission, currentUser)) {
        notify.warning('Only the recruiter who submitted this candidate can perform actions.');
        return;
      }
      if (action === 'submit_client') {
        setSubmitDrawerMode('lead');
        setSubmitForwardOnly(false);
        setSubmitPreselectedIds([submissionId]);
        setSubmitDrawerOpen(true);
        return;
      }
      if (action === 'schedule') {
        setScheduleRound('L1');
        setScheduleSubmissionId(submissionId);
        setScheduleOpen(true);
        return;
      }
      if (action === 'next_round_l2') {
        setScheduleRound('L2');
        setScheduleSubmissionId(submissionId);
        setScheduleOpen(true);
        return;
      }
      if (action === 'next_round_final') {
        setScheduleRound('Final');
        setScheduleSubmissionId(submissionId);
        setScheduleOpen(true);
        return;
      }
      if (action === 'reschedule') {
        setRescheduleSubmissionId(submissionId);
        setRescheduleOpen(true);
        return;
      }
      if (action === 'round_selected') {
        const latest = [...interviewRows]
          .filter((i) => i.submissionId === submissionId && i.status !== 'Cancelled')
          .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
        if (!latest) {
          notify.error('No interview found for this candidate.');
          return;
        }
        try {
          await updateInterview(latest.id, {
            status: 'Completed',
            finalDecision: 'SELECTED',
            notes: `${latest.notes ?? ''}\nRound marked selected from pipeline.`.trim(),
          });
          const latestRound = normalizeRoundLabel(latest.round);
          if (latestRound === 'L2' || latestRound === 'Final') {
            await patchSubmission(submissionId, { status: 'Selected' });
          }
          await refreshAll();
          showToast(`${latest.round} marked selected`);
        } catch (e) {
          notify.error(e instanceof Error ? e.message : 'Could not update interview result');
        }
        return;
      }
      if (action === 'feedback') {
        setFeedbackSubmissionId(submissionId);
        setFeedbackOpen(true);
        return;
      }
      if (action === 'offer') {
        setOfferSubmissionId(submissionId);
        setOfferOpen(true);
        return;
      }
      if (action === 'candidate_response') {
        setResponseSubmissionId(submissionId);
        setResponseOpen(true);
        return;
      }
      if (action === 'rejected') {
        setRejectSubmissionId(submissionId);
        setRejectOpen(true);
        return;
      }
      if (action === 'selected') {
        try {
          const updated = await patchSubmission(submissionId, { status: 'Selected' });
          setHistoryRows((rows) => rows.map((s) => (s.id === submissionId ? { ...s, ...updated } : s)));
          await reloadActivity();
          showToast('Marked selected');
        } catch (e) {
          notify.error(e instanceof Error ? e.message : 'Update failed');
        }
        return;
      }
      if (action === 'offer_accept') {
        const today = new Date().toISOString().slice(0, 10);
        try {
          await recordOfferLetterResponse(submissionId, {
            decision: 'accept',
            acceptedJoiningDate: today,
          });
          await refreshAll();
          showToast('Offer marked accepted');
        } catch (e) {
          notify.error(e instanceof Error ? e.message : 'Could not record acceptance');
        }
        return;
      }
      if (action === 'offer_decline') {
        const reason =
          (typeof window !== 'undefined' ? window.prompt('Decline reason?') ?? '' : '').trim() || 'Declined';
        try {
          await recordOfferLetterResponse(submissionId, {
            decision: 'decline',
            declineReason: reason,
          });
          await refreshAll();
          showToast('Offer marked declined');
        } catch (e) {
          notify.error(e instanceof Error ? e.message : 'Could not record decline');
        }
      }
    },
    [
      canWorkOnRequirement,
      workBlockReason,
      reloadActivity,
      showToast,
      refreshAll,
      interviewRows,
      historyRows,
      currentUser,
    ],
  );

  const offersList = useMemo(
    () => Object.values(offersBySubmissionId).filter((x): x is OfferLetterRecord => Boolean(x)),
    [offersBySubmissionId],
  );
  const { index: recruitmentTimelineIndex, rejected: recruitmentTimelineRejected } = useMemo(() => {
    const hasLeadSubmissions = historyRows.some((s) => isLeadReviewStatus(s.status));
    const hasClientSubmissions = historyRows.some(
      (s) => isClientSubmittedStatus(s.status) && !isLeadReviewStatus(s.status),
    );
    return computeRecruitmentTimelineIndex({
      requirementStatus: requirement?.status ?? 'Open',
      requirementClosed: Boolean(requirement?.closedDate),
      hasSubmissions: historyRows.length > 0,
      hasLeadSubmissions,
      hasClientSubmissions,
      interviews: interviewRows,
      offers: offersList,
    });
  }, [requirement?.status, requirement?.closedDate, historyRows, interviewRows, offersList]);

  const widgetCounts = useMemo(() => {
    const totalCandidates = historyRows.length;
    const submitted = historyRows.filter((s) => isAnySubmittedStatus(s.status)).length;
    const interviewing = historyRows.filter((s) => s.status === 'Interview').length;
    const selected = historyRows.filter((s) => s.status === 'Selected').length;
    const rejected = historyRows.filter((s) => s.status === 'Rejected').length;
    const offerReleased = offersList.filter((o) => o.status === 'RELEASED' || o.status === 'ACCEPTED').length;
    const slaRemaining = requirement
      ? Math.max(0, (requirement.slaDays ?? 15) - getOpenDays(requirement))
      : cardMetrics?.requirement?.slaRemaining ?? 0;
    const fromLoadedData = {
      totalCandidates,
      submitted,
      interviewing,
      selected,
      rejected,
      offerReleased,
      slaRemaining,
    };
    const fromApi = cardMetrics?.requirement;
    if (!fromApi) return fromLoadedData;
    if (fromApi.totalCandidates === 0 && fromLoadedData.totalCandidates > 0) {
      return {
        ...fromLoadedData,
        slaRemaining: fromApi.slaRemaining ?? fromLoadedData.slaRemaining,
      };
    }
    return fromApi;
  }, [cardMetrics, historyRows, offersList, requirement]);

  const assignableRecruiters = useMemo(() => {
    const base = recruiters.filter((r) => Boolean(r.id));
    if (base.length > 0) return [...base].sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
    return currentUser ? [currentUser] : [];
  }, [recruiters, currentUser]);
  const displayRecruiterName = useCallback((r: (typeof recruiters)[number]) => {
    const name = String(r.name ?? '').trim();
    if (name) return name;
    const email = String(r.email ?? '').trim();
    if (email.includes('@')) return email.split('@')[0].replace(/[._-]+/g, ' ');
    return 'Recruiter';
  }, []);
  const filteredAssignableRecruiters = useMemo(() => {
    const query = assignSearch.trim().toLowerCase();
    if (!query) return assignableRecruiters;
    return assignableRecruiters.filter((r) => {
      const haystack = `${displayRecruiterName(r)} ${r.email ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [assignSearch, assignableRecruiters, displayRecruiterName]);
  useEffect(() => {
    if (!assignOwnerModalOpen) return;
    if (recruiters.length > 0) return;
    void refreshAuth();
  }, [assignOwnerModalOpen, recruiters.length, refreshAuth]);

  const overdueSubmittedCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    return historyRows.filter((s) => {
      if (!isAnySubmittedStatus(s.status)) return false;
      if (s.status === 'Interview' || s.status === 'Selected' || s.status === 'Rejected') return false;
      return new Date(s.submittedOn).getTime() < cutoff;
    }).length;
  }, [historyRows]);

  const activeAssignRows = useMemo(
    () =>
      [...assignRows]
        .filter((row) => row.status === 'ACTIVE')
        .sort((a, b) => new Date(a.assignedOn).getTime() - new Date(b.assignedOn).getTime()),
    [assignRows],
  );
  const primaryOwnerId =
    activeAssignRows[0]?.recruiterId ||
    requirement?.primaryOwnerId?.trim() ||
    requirement?.owner?.id?.trim() ||
    null;
  const primaryOwnerName =
    activeAssignRows[0]?.recruiterName || requirement?.owner?.name || '';
  const myAssignmentRow = currentUser?.id
    ? activeAssignRows.find((row) => row.recruiterId === currentUser.id)
    : undefined;
  const headerAssigneeName =
    myAssignmentRow?.recruiterName?.trim() ||
    primaryOwnerName?.trim() ||
    requirement?.owner?.name?.trim() ||
    '';
  const headerAssignedBy =
    myAssignmentRow?.assignerName?.trim() ||
    requirement?.assignedBy?.trim() ||
    requirement?.assignmentAssignerName?.trim() ||
    activeAssignRows[0]?.assignerName?.trim() ||
    '';
  const isPrimaryOwner = !!currentUser?.id && primaryOwnerId === currentUser.id;
  const assignerMatchesAssignee = (() => {
    const by = headerAssignedBy.toLowerCase();
    if (!by) return false;
    const assignee = headerAssigneeName.toLowerCase();
    const viewer = String(currentUser?.name ?? '').trim().toLowerCase();
    return (assignee && by === assignee) || (viewer && by === viewer);
  })();
  const showHeaderAssignedBy =
    String(requirement?.assignment ?? '').toUpperCase() !== 'UNASSIGNED' &&
    !isPrimaryOwner &&
    !!headerAssignedBy &&
    !assignerMatchesAssignee;
  const isCurrentUserActiveAssignee =
    !!currentUser?.id && activeRecruiterIds.has(currentUser.id);
  const canPerformSubmissionActions = useCallback(
    (submission: Submission | null | undefined) =>
      canWorkOnRequirement && canPerformSubmissionPipelineAction(submission, currentUser),
    [canWorkOnRequirement, currentUser],
  );
  const canForwardFromPipeline = isLeadRole(currentUser?.role);
  const canEditRequirement =
    !requirement ||
    String(requirement.assignment).toUpperCase() !== 'ASSIGNED' ||
    isPrimaryOwner ||
    isCurrentUserActiveAssignee;
  const canOpenAssignmentControls = !!currentUser;

  const handleWidgetClick = useCallback((key: DashboardWidgetKey) => {
    if (
      key === 'totalCandidates' ||
      key === 'submitted' ||
      key === 'interviewing' ||
      key === 'selected' ||
      key === 'rejected'
    ) {
      setActiveTab('pipeline');
      return;
    }
    if (key === 'offerReleased') {
      setActiveTab('offers');
      return;
    }
    setActiveTab('overview');
  }, []);

  if (requirementLoading && !requirement) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!requirement) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-white">
        <h2 className="text-lg font-semibold text-gray-800">Requirement not found</h2>
        <p className="mt-2 text-sm text-gray-500">The requirement {id} could not be found.</p>
        <div className="mt-4 flex justify-start">
          <PageBackNav className="mb-0" />
        </div>
      </div>
    );
  }

  const status = getDashboardStatus(requirement);
  const openDays = getOpenDays(requirement);
  const slaDays = requirement?.slaDays ?? 15;
  const openPositions = requirement?.openPositions ?? 1;
  const createdDate = requirement?.createdAt ? new Date(requirement.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) : 'Unknown';
  const createdDateTime = requirement?.createdAt
    ? new Date(requirement.createdAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : 'Unknown';
  const stepStatus = status === 'All' ? 'Unassigned' : status;
  const budgetLabel =
    requirement?.employmentType === 'Contract' ? 'Monthly Budget' : 'Yearly Budget';
  const budgetValue =
    requirement?.employmentType === 'Contract'
      ? requirement?.monthlyBudget ?? requirement?.overallBudget
      : requirement?.yearlyBudget ?? requirement?.overallBudget;
  const formatBudget = (value?: number | null) => {
    if (value == null || Number.isNaN(Number(value))) return 'Not specified';
    const currency = requirement?.budgetCurrency || 'INR';
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(Number(value));
    } catch {
      return `${currency} ${Number(value).toLocaleString('en-IN')}`;
    }
  };
  const creatorLower = (requirement.requirementCreatorName || '').toLowerCase();
  const mayHaveEmailSourcePdf =
    creatorLower.includes('email') || creatorLower.includes('automation');

  const closedDate = requirement?.closedDate
    ? new Date(requirement.closedDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';
  const slaRemainingDays = Math.max(0, (requirement.slaDays ?? 15) - openDays);

  return (
    <div className="space-y-6">
      {assignNotice && (
        <div className="fixed right-5 top-5 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          {assignNotice}
        </div>
      )}

      <StickyRequirementHeader
        requirement={requirement}
        stepLabel={stepStatus}
        slaRemainingDays={slaRemainingDays}
        sourcePdfLoading={sourcePdfLoading}
        mayHaveEmailSourcePdf={mayHaveEmailSourcePdf}
        canEditRequirement={canEditRequirement}
        canAddCandidate={canWorkOnRequirement}
        onDownloadSourcePdf={async () => {
          setSourcePdfLoading(true);
          try {
            await downloadRequirementSourceEmailPdf(requirement.id);
          } catch (e) {
            notify.error(e instanceof Error ? e.message : 'Could not download PDF.');
          } finally {
            setSourcePdfLoading(false);
          }
        }}
        ownerSlot={
          <span className="inline-flex items-center gap-2">
            <span className="flex max-w-[15rem] flex-col items-start gap-0.5">
              <span className="truncate text-sm font-medium text-gray-800">
                {String(requirement.assignment).toUpperCase() === 'UNASSIGNED'
                  ? 'Unassigned'
                  : headerAssigneeName || 'Unassigned'}
              </span>
              {showHeaderAssignedBy && (
                  <span className="truncate text-xs text-gray-500">
                    Assigned by {headerAssignedBy}
                  </span>
                )}
            </span>
            {currentUser && canOpenAssignmentControls && (
              <button
                type="button"
                onClick={() => {
                  setSelectedRecruiterIds(
                    currentUser?.id ? [currentUser.id] : [],
                  );
                  setAssignSearch('');
                  setAssignOwnerModalOpen(true);
                }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                Reassign
              </button>
            )}
          </span>
        }
      />

      {workBlockReason ? <RequirementViewOnlyBanner message={workBlockReason} /> : null}

      <DashboardWidgets counts={widgetCounts} onTileClick={handleWidgetClick} />

      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between">
        <SmartSuggestionsBanner
          submissions={historyRows}
          interviews={interviewRows}
          offersBySubmissionId={offersBySubmissionId}
        />
        <SlaAlertsBadge slaRemainingDays={slaRemainingDays} overdueSubmittedCount={overdueSubmittedCount} />
      </div>

      <RecruitmentTimeline
        currentIndex={recruitmentTimelineIndex}
        rejected={recruitmentTimelineRejected}
      />

      <RequirementTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <>
      {/* Requirement Overview Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-200 dark:bg-white">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-800">
          Requirement Overview
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Requirement ID
            </div>
            <div className="mt-1 font-medium text-gray-800">
              {requirement?.requirementId ?? requirement?.id}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Demand Received Date
            </div>
            <div className="mt-1 font-medium text-gray-800">{createdDateTime}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Internal POC (To)
            </div>
            <div className="mt-1 font-medium text-gray-800">
              {requirement?.internalPoc || 'Not specified'}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Requirement From
            </div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.submittingTo || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Client Lead POC (From)</div>
            <div className="mt-1 font-medium text-gray-800">
              {requirement?.clientLeadPoc || 'Not specified'}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Client POC (From/CC)</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.clientPoc || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Job Title</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.roleTitle || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Job Status</div>
            <div className="mt-1 font-medium text-gray-800">{stepStatus}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Closed Date</div>
            <div className="mt-1 font-medium text-gray-800">{closedDate}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Type of Demand</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.demandType || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Priority</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.priority || 'Medium'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Number of Positions</div>
            <div className="mt-1 font-medium text-gray-800">{openPositions}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Relevant Experience</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.experienceLevel || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Employment Type</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.employmentType || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Budget Currency</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.budgetCurrency || 'INR'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{budgetLabel}</div>
            <div className="mt-1 font-medium text-gray-800">{formatBudget(budgetValue)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Work Mode</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.workMode || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Location</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.location || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Overall Experience</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.experience || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Notice Period</div>
            <div className="mt-1 font-medium text-gray-800">{requirement?.noticePeriod || 'Not specified'}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Open Since</div>
            <div className="mt-1 font-medium text-gray-800">
              {createdDate} ({openDays} days)
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">SLA</div>
            <div className="mt-1 font-medium text-gray-800">{slaDays} days</div>
          </div>
        </div>
      </div>

      {/* Skills Section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-200 dark:bg-white">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-800">Skills</h2>
        <div className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Mandatory Skills</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(requirement?.technologies || []).map((skill) => (
              <Badge
                key={`mandatory-${skill}`}
                className="border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-300 dark:bg-gray-100 dark:text-gray-700"
              >
                {skill}
              </Badge>
            ))}
            {(requirement?.technologies || []).length === 0 && (
              <p className="text-sm text-gray-500">Not specified</p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Skills</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(requirement?.skills || []).map((skill) => (
              <Badge
                key={skill}
                className="border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-300 dark:bg-gray-100 dark:text-gray-700"
              >
                {skill}
              </Badge>
            ))}
            {(requirement?.skills || []).length === 0 && <p className="text-sm text-gray-500">Not specified</p>}
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Experience
          </div>
          <p className="mt-1 text-sm font-medium text-gray-800">{requirement?.experience || 'Not specified'}</p>
        </div>
        {requirement?.noticePeriod && (
          <div className="mt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Notice Period
            </div>
            <p className="mt-1 text-sm font-medium text-gray-800">{requirement.noticePeriod}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-200 dark:bg-white">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-800">
          Assignment history
        </h2>
        <div className="mt-4">
          <AssignmentHistoryPanel rows={assignRows} loading={assignLoading} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-200 dark:bg-white">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-800">Requirement History</h2>
        <div className="mt-1 text-xs text-gray-500">
          All recruiter submissions for this requirement, newest first.
        </div>
        <div className="mt-4">
          <RequirementHistoryPanel
            submissions={historyRows}
            loading={historyLoading}
            recruitersWorking={activeRecruiterIds.size}
            interviews={interviewRows}
            currentUser={currentUser}
            sourcingEnabled={canWorkOnRequirement}
            onScheduleInterview={(submissionId) => {
              setScheduleRound('L1');
              setScheduleSubmissionId(submissionId);
              setScheduleOpen(true);
            }}
            onRescheduleInterview={(submissionId) => {
              setRescheduleSubmissionId(submissionId);
              setRescheduleOpen(true);
            }}
          />
        </div>
      </div>

        </>
      )}

      {activeTab === 'pipeline' && (
        <CandidatePipelineBoard
          requirement={requirement}
          submissions={historyRows as (Submission & { emailSent?: boolean })[]}
          interviews={interviewRows}
          offersBySubmissionId={offersBySubmissionId}
          canActOnSubmission={(submission) => canPerformSubmissionActions(submission)}
          onCardAction={handleCardAction}
          onOpenDetails={(id) => setDetailsSubmissionId(id)}
          onSubmitSelected={(ids) => {
            if (!canWorkOnRequirement) {
              notify.warning(workBlockReason ?? 'This requirement is view only.');
              return;
            }
            setSubmitDrawerMode('lead');
            setSubmitForwardOnly(false);
            setSubmitPreselectedIds(ids);
            setSubmitDrawerOpen(true);
          }}
          canForwardToClient={canForwardFromPipeline}
        />
      )}

      {activeTab === 'interviews' && (
        <div className="space-y-4">
          <InterviewRoundsTab requirementId={requirement.id} />
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Legacy interviews (API)</h2>
            {interviewsLoading ? (
              <p className="mt-4 text-sm text-gray-500">Loading interviews…</p>
            ) : interviewRows.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No interviews scheduled yet for this requirement.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                      <th className="pb-2 pr-4">Candidate</th>
                      <th className="pb-2 pr-4">Round</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Scheduled</th>
                      <th className="pb-2">Mode</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {interviewRows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-4 font-medium text-gray-900">{row.candidate.name}</td>
                        <td className="py-2 pr-4">{row.round}</td>
                        <td className="py-2 pr-4">{row.status}</td>
                        <td className="py-2 pr-4">{formatDateTime(row.scheduledAt)}</td>
                        <td className="py-2">{row.mode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'offers' && (
        <div className="space-y-4">
          <OffersManagementTab requirementId={requirement.id} />
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Legacy offer letters summary</h2>
            {historyRows.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No submissions — no offers.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                      <th className="pb-2 pr-4">Candidate</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Compensation</th>
                      <th className="pb-2 pr-4">Joining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyRows.map((row) => {
                      const o = offersBySubmissionId[row.id];
                      return (
                        <tr key={row.id}>
                          <td className="py-2 pr-4 font-medium">{row.candidate.name}</td>
                          <td className="py-2 pr-4">{o?.status ?? '—'}</td>
                          <td className="py-2 pr-4">{o?.compensation ?? '—'}</td>
                          <td className="py-2 pr-4">
                            {o?.joiningDate ? new Date(o.joiningDate).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Activity &amp; Audit</h2>
          <p className="mt-1 text-xs text-gray-500">Newest first — requirement lifecycle events.</p>
          <div className="mt-4">
            <ActivityTimelinePanel
              rows={activityRows}
              loading={activityLoading}
              requirement={requirement}
              assignmentRows={assignRows}
              submissions={historyRows}
            />
          </div>
        </div>
      )}



      <SubmitToClientDrawer
        open={submitDrawerOpen}
        onClose={() => {
          setSubmitDrawerOpen(false);
          setSubmitPreselectedIds([]);
          setSubmitDrawerMode('lead');
          setSubmitForwardOnly(false);
        }}
        requirementId={requirement.id}
        initialDestination={submitDrawerMode}
        forwardOnly={submitForwardOnly}
        preselectedSubmissionIds={submitPreselectedIds}
        preselectedCandidates={submitPreselectedIds
          .map((id) => historyRows.find((s) => s.id === id))
          .filter((s): s is Submission => Boolean(s))
          .map((s) => ({ id: s.candidate.id, name: s.candidate.name, email: s.candidate.email }))}
        onSubmitted={() => void refreshAll()}
      />

      <InterviewSchedulerDrawer
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        submissions={historyRows}
        initialSubmissionId={scheduleSubmissionId}
        initialRound={scheduleRound}
        onScheduled={() => void reloadInterviews()}
      />

      <RescheduleDrawer
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        submissionId={rescheduleSubmissionId}
        interviews={interviewRows}
        onDone={() => void reloadInterviews()}
      />

      <FeedbackDrawer
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        submissionId={feedbackSubmissionId}
        interviews={interviewRows}
        onDone={() => void refreshAll()}
      />

      <OfferReleaseDrawer
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        submissionId={offerSubmissionId}
        candidateName={
          offerSubmissionId ? historyRows.find((s) => s.id === offerSubmissionId)?.candidate.name : undefined
        }
        candidateEmail={
          offerSubmissionId ? historyRows.find((s) => s.id === offerSubmissionId)?.candidate.email : undefined
        }
        existing={offerSubmissionId ? offersBySubmissionId[offerSubmissionId] ?? null : null}
        onDone={() => void refreshAll()}
      />

      <CandidateResponseDrawer
        open={responseOpen}
        onClose={() => setResponseOpen(false)}
        submissionId={responseSubmissionId}
        candidateName={
          responseSubmissionId ? historyRows.find((s) => s.id === responseSubmissionId)?.candidate.name : undefined
        }
        candidateEmail={
          responseSubmissionId ? historyRows.find((s) => s.id === responseSubmissionId)?.candidate.email : undefined
        }
        offer={responseSubmissionId ? offersBySubmissionId[responseSubmissionId] ?? null : null}
        onDone={() => void refreshAll()}
      />

      <CandidateDetailsDrawer
        open={Boolean(detailsSubmissionId)}
        onClose={() => setDetailsSubmissionId(null)}
        submission={
          detailsSubmissionId
            ? (historyRows.find((s) => s.id === detailsSubmissionId) as Submission | undefined) ?? null
            : null
        }
        requirementId={requirement.id}
        interviews={interviewRows}
        offer={detailsSubmissionId ? offersBySubmissionId[detailsSubmissionId] ?? null : null}
        actionsEnabled={canPerformSubmissionActions(
          detailsSubmissionId
            ? historyRows.find((s) => s.id === detailsSubmissionId) ?? null
            : null,
        )}
        onAction={(action, id) => {
          // Don't close the drawer when starting a sub-action; let the sub-drawer
          // open on top so the recruiter retains context.
          void handleCardAction(action, id);
        }}
      />

      <RejectionReasonDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={async (reason) => {
          if (!rejectSubmissionId) return;
          try {
            const latest = [...interviewRows]
              .filter((i) => i.submissionId === rejectSubmissionId && i.status !== 'Cancelled')
              .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())[0];
            if (latest) {
              await updateInterview(latest.id, {
                status: 'Completed',
                finalDecision: 'REJECTED',
                notes: `${latest.notes ?? ''}\nRound marked rejected from pipeline.`.trim(),
              });
            }
            const updated = await patchSubmission(rejectSubmissionId, {
              status: 'Rejected',
              rejectionReason: reason,
            });
            setHistoryRows((rows) => rows.map((s) => (s.id === rejectSubmissionId ? { ...s, ...updated } : s)));
            await reloadActivity();
            setRejectOpen(false);
            setRejectSubmissionId(null);
            showToast('Marked rejected');
          } catch (e) {
            notify.error(e instanceof Error ? e.message : 'Update failed');
          }
        }}
      />

      {assignOwnerModalOpen && currentUser && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close assignment dialog"
            onClick={() => setAssignOwnerModalOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Reassign</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Select yourself and/or other recruiters for this requirement in one step.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignOwnerModalOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={currentUser?.id ? selectedRecruiterIds.includes(currentUser.id) : false}
                  onChange={() => {
                    if (!currentUser?.id) return;
                    setSelectedRecruiterIds((prev) =>
                      prev.includes(currentUser.id)
                        ? prev.filter((id) => id !== currentUser.id)
                        : [...prev, currentUser.id],
                    );
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-semibold text-blue-900">
                    Assign myself ({currentUser.name || 'You'})
                  </div>
                  <div className="text-xs text-blue-700/80">
                    Include yourself along with any recruiters selected below.
                  </div>
                </div>
              </label>

              <div className="space-y-2">
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Assign to recruiter
                </label>
                <input
                  type="text"
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  placeholder="Search recruiter by name or email"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <div className="text-[11px] text-gray-500">
                  Showing {filteredAssignableRecruiters.length} of {assignableRecruiters.length} recruiters
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
                  {filteredAssignableRecruiters.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs text-gray-500">
                      No recruiters found.
                    </div>
                  ) : (
                    filteredAssignableRecruiters.map((r) => {
                      const alreadyAssigned = activeRecruiterIds.has(r.id);
                      const checked = selectedRecruiterIds.includes(r.id);
                      return (
                      <label
                        key={r.id}
                        className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 transition ${
                          alreadyAssigned ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-blue-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={alreadyAssigned}
                          onChange={() => {
                            if (alreadyAssigned) return;
                            setSelectedRecruiterIds((prev) =>
                              prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id],
                            );
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">
                            {displayRecruiterName(r)}
                            {currentUser?.id === r.id ? (
                              <span className="ml-1 text-xs font-semibold text-blue-600">(You)</span>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-gray-500">{r.email || 'No email'}</div>
                        </div>
                      </label>
                    );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setAssignOwnerModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedRecruiterIds.length === 0}
                onClick={async () => {
                  try {
                    const picked = selectedRecruiterIds
                      .map((rid) => assignableRecruiters.find((r) => r.id === rid))
                      .filter((r): r is NonNullable<typeof r> => !!r);
                    for (const recruiter of picked) {
                      await assignRequirement(requirement.id, recruiter, currentUser.email);
                    }
                    setAssignOwnerModalOpen(false);
                    setSelectedRecruiterIds([]);
                    await reloadAssignments();
                    await reloadActivity();
                    await refreshRequirements({ limit: 500 });
                    void refreshWidgetMetrics();
                    notify.success(
                      picked.length === 1
                        ? 'Recruiter assigned successfully'
                        : `${picked.length} recruiters assigned successfully`,
                    );
                  } catch (err) {
                    console.error('Failed to assign recruiters:', err);
                    notify.error('Could not assign recruiters');
                  }
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Assign {selectedRecruiterIds.length} recruiter(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
