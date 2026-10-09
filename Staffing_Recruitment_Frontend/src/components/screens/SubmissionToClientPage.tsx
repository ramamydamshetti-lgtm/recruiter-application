'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X, Search } from 'lucide-react';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormSection } from '@/components/ui/FormSection';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { useCandidatesStore } from '@/lib/domain/candidates/store';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getRequirementAssignments,
  getRequirementEmailThreadParticipants,
  type RequirementAssignmentRow,
} from '@/lib/api/requirements';
import {
  canUserWorkOnRequirement,
  getRequirementWorkBlockReason,
} from '@/lib/domain/requirements/workPermissions';
import { RequirementViewOnlyBanner } from '@/components/requirements/RequirementViewOnlyBanner';
import { isLeadRole, isRecruiterOnlyRole } from '@/lib/auth/roles';
import { forwardSubmissionToClient } from '@/lib/api/submissions';
import { findSubmissionForJd, isLeadReviewStatus } from '@/lib/domain/submissions/workflow';
import { SUBMISSION_CLIENTS, SUBMISSION_CLIENT_OTHER, SUBMISSION_CLIENT_OTHER_LABEL } from '@/lib/domain/submissions/constants';
import {
  isUniversalTrackerClient,
  resolveSubmissionClientLabel,
} from '@/lib/domain/submissions/trackerSelection';
import { Badge } from '@/components/ui/Badge';
import type { Candidate } from '@/lib/domain/candidates/types';
import { cn } from '@/lib/utils/cn';
import { notify } from '@/lib/notify';
import { sendClientSubmissionEmailApi } from '@/lib/api/notifications';
import { formatCandidateTotalYears } from '@/lib/utils/formatCandidateTotalExperience';
import { ItcInfotechTrackerSection } from '@/components/submission/ItcInfotechTrackerSection';
import { syncAttachedCandidatesFromStore } from '@/lib/domain/submissions/trackerRowSync';
import { markActivitiesSeen } from '@/lib/domain/requirements/activityNotifications';
import type { RequirementActivityRow } from '@/lib/api/requirements';
import { KpmgTrackerSection } from '@/components/submission/KpmgTrackerSection';
import { UstTrackerSection } from '@/components/submission/UstTrackerSection';
import { LttsTrackerSection } from '@/components/submission/LttsTrackerSection';
import { AccentureTrackerSection } from '@/components/submission/AccentureTrackerSection';
import { MetaforgeTrackerSection } from '@/components/submission/MetaforgeTrackerSection';
import { BrillioTrackerSection } from '@/components/submission/BrillioTrackerSection';
import { HappiestMindsTrackerSection } from '@/components/submission/HappiestMindsTrackerSection';
import { UniversalTrackerSection } from '@/components/submission/UniversalTrackerSection';
import type { TrackerCustomization } from '@/components/submission/trackerCustomization';
import { TrackerColumnOrderEditor } from '@/components/submission/TrackerColumnOrderEditor';
import {
  buildTrackerRenderPayload,
  syncTrackerColumnOrder,
  type TrackerColumnOrderItem,
} from '@/components/submission/trackerColumnOrder';
import {
  toItcInfotechApiRows,
  type ItcInfotechTrackerRowState,
} from '@/lib/domain/submissions/itcInfotechTracker';
import {
  toKpmgApiRows,
  type KpmgTrackerRowState,
} from '@/lib/domain/submissions/kpmgTracker';
import { toUstApiRows, type UstTrackerRowState } from '@/lib/domain/submissions/ustTracker';
import { toLttsApiRows, type LttsTrackerRowState } from '@/lib/domain/submissions/lttsTracker';
import {
  toAccentureApiRows,
  type AccentureTrackerRowState,
} from '@/lib/domain/submissions/accentureTracker';
import {
  toMetaforgeApiRows,
  type MetaforgeTrackerRowState,
} from '@/lib/domain/submissions/metaforgeTracker';
import { toBrillioApiRows, type BrillioTrackerRowState } from '@/lib/domain/submissions/brillioTracker';
import {
  toHappiestMindsApiRows,
  type HappiestMindsTrackerRowState,
} from '@/lib/domain/submissions/happiestMindsTracker';
import {
  toUniversalApiRows,
  type UniversalTrackerRowState,
} from '@/lib/domain/submissions/universalTracker';
import {
  isValidClientEmail,
  loadClientEmailHistory,
  rememberClientEmails,
} from '@/lib/utils/clientEmailHistory';
import {
  EmailRecipientEditor,
  normalizeThreadFromSender,
  normalizeThreadRecipients,
  SubmissionFromEditor,
  type ThreadFromSenderState,
  type ThreadRecipientsState,
} from '@/components/submission/EmailRecipientEditor';
import { SubmissionEmailContentEditor } from '@/components/submission/SubmissionEmailContentEditor';
import {
  buildSubmissionEmailGreeting,
  DEFAULT_SUBMISSION_EMAIL_INTRODUCTION,
} from '@/lib/domain/submissions/submissionEmailGreeting';

type Props = {
  requirementId: string;
  /** Embedded in drawer: hide page chrome + skip navigation after submit. */
  compact?: boolean;
  onComplete?: () => void;
  /** When opening from pipeline forward action, default to client thread mode. */
  initialDestination?: 'lead' | 'client';
  /** Hide Submit to Lead — used when lead forwards already-reviewed candidates. */
  forwardOnly?: boolean;
  /** Pre-select candidates from existing lead submissions (pipeline forward). */
  preselectedSubmissionIds?: string[];
};
const MY_WORK_PROFILE_STORAGE_KEY = 'profile_editable';

function hasResumeOnFile(c: Candidate): boolean {
  return !!(c.resumeRef && String(c.resumeRef).trim());
}

function matchSearch(candidate: Candidate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = candidate.name.toLowerCase();
  const id = candidate.id.toLowerCase();
  const candidateCode = (candidate.candidateCode ?? '').toLowerCase();
  const email = candidate.email.toLowerCase();
  const phone = (candidate.phone ?? '').replace(/\s+/g, '');
  const phoneNorm = q.replace(/\s+/g, '');
  return (
    name.includes(q) ||
    id.includes(q) ||
    candidateCode.includes(q) ||
    email.includes(q) ||
    phone.includes(phoneNorm)
  );
}

type TrackerRowWithId = { candidateId: string } & Record<string, string>;

const TRACKER_HEADER_BG_DEFAULTS: Record<string, string> = {
  itc: '#dfe8f7',
  kpmg: '#d8e4bc',
  ust: '#ffffff',
  ltts: '#ffff00',
  accenture: '#d8e4bc',
  metaforge: '#c6e0b4',
  brillio: '#deeaf6',
  'happiest-minds': '#e2efda',
  [SUBMISSION_CLIENT_OTHER]: '#f0c040',
};

function normalizeHexColorOrDefault(value: string, fallback: string): string {
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : fallback;
}

function readMyWorkFooterSignature(): {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
} {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MY_WORK_PROFILE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const name = String(parsed.name ?? '').trim();
    const title = String(parsed.role ?? '').trim();
    const email = String(parsed.email ?? '').trim();
    const phone = String(parsed.phone ?? '').trim();
    return {
      ...(name ? { name } : {}),
      ...(title ? { title } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    };
  } catch {
    return {};
  }
}

function buildDefaultSubmissionFrom(user: {
  name?: string;
  email?: string;
} | null | undefined): ThreadFromSenderState {
  const profile = readMyWorkFooterSignature();
  return {
    displayName: profile.name || user?.name?.trim() || user?.email?.trim() || '',
    email: profile.email || user?.email?.trim() || '',
  };
}

export function SubmissionToClientPage({
  requirementId,
  compact,
  onComplete,
  initialDestination = 'lead',
  forwardOnly = false,
  preselectedSubmissionIds,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const { requirements, refresh: refreshRequirements } = useRequirementsStore();
  const [assignRows, setAssignRows] = useState<RequirementAssignmentRow[]>([]);
  const {
    candidates,
    submissions,
    submitCandidate,
    hasSubmissionForJd,
    getSubmissionStageForJd,
    isSubmittedToClientForJd,
    refresh,
    isLoading,
  } = useCandidatesStore();

  const isLead = isLeadRole(currentUser?.role);
  const isRecruiter = isRecruiterOnlyRole(currentUser?.role);

  const requirement = requirements.find((r) => r.id === requirementId && !r.isDeleted);

  const [submitToLeadChecked, setSubmitToLeadChecked] = useState(true);
  const [forwardToClientLoopChecked, setForwardToClientLoopChecked] = useState(true);
  const wantsSubmitToLead =
    !forwardOnly && (isRecruiter || (isLead ? submitToLeadChecked : true));
  const wantsForwardLoop = forwardOnly || (isLead && forwardToClientLoopChecked);
  const needsClientThread = wantsForwardLoop;
  const [threadGraphLinked, setThreadGraphLinked] = useState(false);
  const [manualSubjectDraft, setManualSubjectDraft] = useState('');
  const [threadLookupLoading, setThreadLookupLoading] = useState(false);

  useEffect(() => {
    if (isRecruiter) {
      setSubmitToLeadChecked(true);
      setForwardToClientLoopChecked(false);
    } else if (forwardOnly) {
      setSubmitToLeadChecked(false);
      setForwardToClientLoopChecked(true);
    }
  }, [isRecruiter, forwardOnly]);

  const [confirmClientThread, setConfirmClientThread] = useState(false);
  /** Lead email(s), or optional reference emails when sending to client thread. */
  const [clientEmails, setClientEmails] = useState<string[]>(['']);
  const [clientEmailsError, setClientEmailsError] = useState<string | null>(null);
  const [threadSubject, setThreadSubject] = useState('');
  const [threadRecipients, setThreadRecipients] = useState<ThreadRecipientsState>({
    to: [],
    cc: [],
    bcc: [],
  });
  const [submissionFrom, setSubmissionFrom] = useState<ThreadFromSenderState>({
    displayName: '',
    email: '',
  });
  const [threadToNames, setThreadToNames] = useState<Record<string, string>>({});
  const [emailGreeting, setEmailGreeting] = useState('');
  const [emailIntroduction, setEmailIntroduction] = useState(DEFAULT_SUBMISSION_EMAIL_INTRODUCTION);
  const [greetingTouched, setGreetingTouched] = useState(false);
  const [introductionTouched, setIntroductionTouched] = useState(false);
  const [threadParticipantsLoading, setThreadParticipantsLoading] = useState(false);
  const [threadParticipantsError, setThreadParticipantsError] = useState<string | null>(null);
  const [savedClientEmailSuggestions, setSavedClientEmailSuggestions] = useState<string[]>([]);
  const [positionsToSubmit, setPositionsToSubmit] = useState<number>(1);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [attachedCandidates, setAttachedCandidates] = useState<Candidate[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Optional new resume file per candidate (uploaded on submit). */
  const [resumeFileByCandidateId, setResumeFileByCandidateId] = useState<
    Record<string, File | undefined>
  >({});
  const [submittingToClient, setSubmittingToClient] = useState<string>(SUBMISSION_CLIENTS[0]!.value);
  const [customClientName, setCustomClientName] = useState('');
  const [clientPickerSynced, setClientPickerSynced] = useState(false);
  const [itcTrackerRows, setItcTrackerRows] = useState<ItcInfotechTrackerRowState[]>([]);
  const [kpmgTrackerRows, setKpmgTrackerRows] = useState<KpmgTrackerRowState[]>([]);
  const [ustTrackerRows, setUstTrackerRows] = useState<UstTrackerRowState[]>([]);
  const [lttsTrackerRows, setLttsTrackerRows] = useState<LttsTrackerRowState[]>([]);
  const [accentureTrackerRows, setAccentureTrackerRows] = useState<AccentureTrackerRowState[]>([]);
  const [metaforgeTrackerRows, setMetaforgeTrackerRows] = useState<MetaforgeTrackerRowState[]>([]);
  const [brillioTrackerRows, setBrillioTrackerRows] = useState<BrillioTrackerRowState[]>([]);
  const [happiestMindsTrackerRows, setHappiestMindsTrackerRows] =
    useState<HappiestMindsTrackerRowState[]>([]);
  const [universalTrackerRows, setUniversalTrackerRows] = useState<UniversalTrackerRowState[]>([]);
  const [trackerHeaderBgColor, setTrackerHeaderBgColor] = useState<string>(
    TRACKER_HEADER_BG_DEFAULTS[SUBMISSION_CLIENTS[0]!.value] ?? '#e8e8e8',
  );
  const [newTrackerColumnName, setNewTrackerColumnName] = useState('');
  const [trackerColumnOrder, setTrackerColumnOrder] = useState<TrackerColumnOrderItem[]>([]);
  const [extraTrackerCellValues, setExtraTrackerCellValues] = useState<
    Record<string, Record<string, string>>
  >({});
  const [trackerCustomizationSaved, setTrackerCustomizationSaved] = useState(false);

  const attachedAllAlreadyAtLead = useMemo(() => {
    if (attachedCandidates.length === 0) return false;
    return attachedCandidates.every((c) => {
      const existing = findSubmissionForJd(submissions, c.id, requirementId);
      return Boolean(existing && isLeadReviewStatus(existing.status));
    });
  }, [attachedCandidates, submissions, requirementId]);

  useEffect(() => {
    if (!isLead || forwardOnly) return;
    if (attachedAllAlreadyAtLead) {
      setSubmitToLeadChecked(false);
      setForwardToClientLoopChecked(true);
    }
  }, [attachedAllAlreadyAtLead, isLead, forwardOnly]);

  const greetingToEmails = useMemo(() => {
    if (needsClientThread) {
      return normalizeThreadRecipients(threadRecipients).to;
    }
    if (wantsSubmitToLead) {
      return clientEmails.map((e) => e.trim()).filter(Boolean);
    }
    return [];
  }, [needsClientThread, wantsSubmitToLead, threadRecipients, clientEmails]);

  useEffect(() => {
    if (greetingTouched) return;
    setEmailGreeting(buildSubmissionEmailGreeting(greetingToEmails, threadToNames));
  }, [greetingToEmails, threadToNames, greetingTouched]);

  useEffect(() => {
    if (!introductionTouched) {
      setEmailIntroduction(DEFAULT_SUBMISSION_EMAIL_INTRODUCTION);
    }
  }, [introductionTouched]);

  const resetGreetingFromTo = useCallback(() => {
    setGreetingTouched(false);
    setEmailGreeting(buildSubmissionEmailGreeting(greetingToEmails, threadToNames));
  }, [greetingToEmails, threadToNames]);

  const resetIntroductionDefault = useCallback(() => {
    setIntroductionTouched(false);
    setEmailIntroduction(DEFAULT_SUBMISSION_EMAIL_INTRODUCTION);
  }, []);

  function applyThreadToNamesFromParticipants(
    participants: Array<{ address: string; name?: string }> | undefined,
  ) {
    if (!participants?.length) return;
    const map: Record<string, string> = {};
    for (const row of participants) {
      const address = row.address?.trim().toLowerCase();
      const name = row.name?.trim();
      if (address && name) map[address] = name;
    }
    if (Object.keys(map).length) setThreadToNames((prev) => ({ ...prev, ...map }));
  }

  useEffect(() => {
    if (forwardOnly && attachedCandidates.length > 0) {
      const submitters = attachedCandidates
        .map((c) => findSubmissionForJd(submissions, c.id, requirementId)?.submittedBy)
        .filter(Boolean);
      const uniqueIds = new Set(submitters.map((s) => s!.id));
      if (uniqueIds.size === 1 && submitters[0]) {
        setSubmissionFrom({
          displayName: submitters[0].name.trim(),
          email: submitters[0].email.trim(),
        });
        return;
      }
    }
    setSubmissionFrom(buildDefaultSubmissionFrom(currentUser));
  }, [
    forwardOnly,
    attachedCandidates,
    submissions,
    requirementId,
    currentUser?.id,
    currentUser?.name,
    currentUser?.email,
  ]);

  const ustRecruiter = useMemo(
    () =>
      currentUser
        ? { id: currentUser.id, name: currentUser.name }
        : null,
    [currentUser],
  );

  useEffect(() => {
    setClientPickerSynced(false);
  }, [requirementId]);

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

  const activeAssigneeIds = useMemo(
    () =>
      new Set(
        assignRows.filter((row) => row.status === 'ACTIVE').map((row) => row.recruiterId),
      ),
    [assignRows],
  );
  const workBlockReason = getRequirementWorkBlockReason(requirement, currentUser?.id, {
    activeAssigneeIds,
  });
  const canWorkOnRequirement = canUserWorkOnRequirement(requirement, currentUser?.id, {
    activeAssigneeIds,
  });

  useEffect(() => {
    setSavedClientEmailSuggestions(loadClientEmailHistory());
  }, []);

  const loadThreadParticipants = useCallback(
    async (subjectOverride?: string) => {
      if (!requirementId) {
        setThreadSubject('');
        setThreadRecipients({ to: [], cc: [], bcc: [] });
        setThreadParticipantsError(null);
        setThreadGraphLinked(false);
        return;
      }
      setThreadParticipantsLoading(true);
      setThreadParticipantsError(null);
      try {
        const thread = await getRequirementEmailThreadParticipants(requirementId, {
          ...(subjectOverride?.trim() ? { sourceEmailSubject: subjectOverride.trim() } : {}),
        });
        setThreadSubject(thread.subject);
        setThreadGraphLinked(Boolean(thread.graphMessageId));
        if (wantsForwardLoop) {
          setThreadRecipients({
            to: thread.to.length ? thread.to : [],
            cc: thread.cc.length ? thread.cc : [],
            bcc: thread.bcc.length ? thread.bcc : [],
          });
        }
        applyThreadToNamesFromParticipants(thread.toParticipants);
        if (!thread.graphMessageId && !subjectOverride?.trim()) {
          setManualSubjectDraft(thread.subject || requirement?.sourceEmailSubject || '');
        }
      } catch (err) {
        setThreadParticipantsError(
          err instanceof Error ? err.message : 'Could not load original email thread participants',
        );
        setThreadGraphLinked(false);
      } finally {
        setThreadParticipantsLoading(false);
      }
    },
    [requirementId, wantsForwardLoop, requirement?.sourceEmailSubject],
  );

  useEffect(() => {
    void loadThreadParticipants();
  }, [loadThreadParticipants]);

  const handleLookupEmailThread = async () => {
    const subject = manualSubjectDraft.trim();
    if (!subject) {
      notify.warning('Enter the exact subject from the original client or DL email.');
      return;
    }
    setThreadLookupLoading(true);
    setThreadParticipantsError(null);
    try {
      const thread = await getRequirementEmailThreadParticipants(requirementId, {
        sourceEmailSubject: subject,
      });
      setThreadSubject(thread.subject || subject);
      setThreadGraphLinked(Boolean(thread.graphMessageId));
      setThreadRecipients({
        to: thread.to.length ? thread.to : [],
        cc: thread.cc.length ? thread.cc : [],
        bcc: thread.bcc.length ? thread.bcc : [],
      });
      applyThreadToNamesFromParticipants(thread.toParticipants);
      if (!thread.graphMessageId) {
        notify.warning(
          'No matching email found in the mailbox. Check the subject spelling and try again.',
        );
      } else {
        notify.success('Original email thread found. To/CC recipients are loaded below.');
      }
    } catch (err) {
      setThreadParticipantsError(
        err instanceof Error ? err.message : 'Could not look up the email thread',
      );
      setThreadGraphLinked(false);
    } finally {
      setThreadLookupLoading(false);
    }
  };

  useEffect(() => {
    // Allow Candidate Repository to pre-select candidates for this requirement.
    const raw = searchParams.get('candidateIds');
    if (!raw) return;
    const ids = raw
      .split(',')
      .map((s) => decodeURIComponent(s).trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const picked = ids
      .map((id) => byId.get(id))
      .filter((c): c is Candidate => Boolean(c))
      .filter((c) => {
        if (isSubmittedToClientForJd(c.id, requirementId)) {
          notify.warning('This candidate is already submitted to the client for this requirement.');
          return false;
        }
        const stage = getSubmissionStageForJd(c.id, requirementId);
        if (stage === 'lead' && !isLead) {
          notify.warning('This candidate is already submitted to lead for this requirement.');
          return false;
        }
        return true;
      });
    if (picked.length === 0) return;
    setAttachedCandidates((prev) => {
      const seen = new Set(prev.map((c) => c.id));
      const next = [...prev];
      for (const c of picked) {
        if (!seen.has(c.id)) next.push(c);
      }
      return next;
    });
    // Hide search panel; user is already attaching via repository selection.
    setShowSearch(false);
    setCandidateSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, candidates]);

  useEffect(() => {
    if (submittingToClient !== 'itc') {
      setItcTrackerRows([]);
    }
    if (submittingToClient !== 'kpmg') {
      setKpmgTrackerRows([]);
    }
    if (submittingToClient !== 'ust') {
      setUstTrackerRows([]);
    }
    if (submittingToClient !== 'ltts') {
      setLttsTrackerRows([]);
    }
    if (submittingToClient !== 'accenture') {
      setAccentureTrackerRows([]);
    }
    if (submittingToClient !== 'metaforge') {
      setMetaforgeTrackerRows([]);
    }
    if (submittingToClient !== 'brillio') {
      setBrillioTrackerRows([]);
    }
    if (submittingToClient !== 'happiest-minds') {
      setHappiestMindsTrackerRows([]);
    }
    if (!isUniversalTrackerClient(submittingToClient)) {
      setUniversalTrackerRows([]);
    }
    setTrackerColumnOrder([]);
    setExtraTrackerCellValues({});
    setNewTrackerColumnName('');
    setTrackerCustomizationSaved(false);
  }, [submittingToClient]);

  useEffect(() => {
    const fallback = TRACKER_HEADER_BG_DEFAULTS[submittingToClient] ?? '#e8e8e8';
    setTrackerHeaderBgColor(fallback);
  }, [submittingToClient]);

  useEffect(() => {
    // Keep only values for still-attached candidates.
    const keepIds = new Set(attachedCandidates.map((c) => c.id));
    setExtraTrackerCellValues((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const [candidateId, values] of Object.entries(prev)) {
        if (keepIds.has(candidateId)) next[candidateId] = values;
      }
      return next;
    });
  }, [attachedCandidates]);

  useEffect(() => {
    if (!requirement || clientPickerSynced) return;
    const st = requirement.submittingTo?.trim();
    if (st) {
      const byPreset = SUBMISSION_CLIENTS.find(
        (c) => c.value === st || c.label.toLowerCase() === st.toLowerCase(),
      );
      if (byPreset) {
        setSubmittingToClient(byPreset.value);
        setCustomClientName('');
      } else {
        setSubmittingToClient(SUBMISSION_CLIENT_OTHER);
        setCustomClientName(st);
      }
    } else {
      const name = requirement.clientLeadPoc?.toLowerCase().replace(/\s+/g, '-');
      const match = SUBMISSION_CLIENTS.find(
        (c) =>
          c.value === name ||
          c.label.toLowerCase() === requirement.clientLeadPoc?.toLowerCase(),
      );
      setSubmittingToClient(match?.value ?? SUBMISSION_CLIENTS[0]!.value);
    }
    setClientPickerSynced(true);
  }, [requirement, requirementId, clientPickerSynced]);

  const isLegacyFreeTextSubmittingTo =
    submittingToClient &&
    !isUniversalTrackerClient(submittingToClient) &&
    !SUBMISSION_CLIENTS.some(
      (c) => c.value === submittingToClient || c.label === submittingToClient,
    );

  const attachedIds = new Set(attachedCandidates.map((c) => c.id));
  const limitReached = attachedCandidates.length >= positionsToSubmit;

  const searchableCandidates = useMemo(() => {
    return candidates
      .filter((c) => {
        if (attachedIds.has(c.id)) return false;
        return matchSearch(c, candidateSearch);
      })
      .sort((a, b) => {
        const ar = hasResumeOnFile(a) ? 1 : 0;
        const br = hasResumeOnFile(b) ? 1 : 0;
        if (br !== ar) return br - ar;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [candidates, attachedIds, candidateSearch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!preselectedSubmissionIds?.length) return;
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const picked: Candidate[] = [];
    for (const submissionId of preselectedSubmissionIds) {
      const sub = submissions.find((s) => s.id === submissionId && s.jdId === requirementId);
      if (!sub) continue;
      const candidate = byId.get(sub.candidateId);
      if (candidate) picked.push(candidate);
    }
    if (picked.length === 0) return;
    setAttachedCandidates(picked);
    setPositionsToSubmit(Math.max(picked.length, 1));
  }, [preselectedSubmissionIds, submissions, candidates, requirementId]);

  useEffect(() => {
    setAttachedCandidates((prev) => syncAttachedCandidatesFromStore(prev, candidates));
  }, [candidates]);

  useEffect(() => {
    if (showSearch) {
      void refresh();
    }
  }, [showSearch, refresh]);

  const updateExtraCell = useCallback((candidateId: string, columnId: string, value: string) => {
    setExtraTrackerCellValues((prev) => ({
      ...prev,
      [candidateId]: {
        ...(prev[candidateId] ?? {}),
        [columnId]: value,
      },
    }));
    setTrackerCustomizationSaved(false);
  }, []);

  const selectedTrackerRows: TrackerRowWithId[] = useMemo(
    () =>
      submittingToClient === 'itc'
        ? (itcTrackerRows as unknown as TrackerRowWithId[])
        : submittingToClient === 'kpmg'
          ? (kpmgTrackerRows as unknown as TrackerRowWithId[])
          : submittingToClient === 'ust'
            ? (ustTrackerRows as unknown as TrackerRowWithId[])
            : submittingToClient === 'ltts'
              ? (lttsTrackerRows as unknown as TrackerRowWithId[])
              : submittingToClient === 'accenture'
                ? (accentureTrackerRows as unknown as TrackerRowWithId[])
                : submittingToClient === 'metaforge'
                  ? (metaforgeTrackerRows as unknown as TrackerRowWithId[])
                  : submittingToClient === 'brillio'
                    ? (brillioTrackerRows as unknown as TrackerRowWithId[])
                    : submittingToClient === 'happiest-minds'
                      ? (happiestMindsTrackerRows as unknown as TrackerRowWithId[])
                      : isUniversalTrackerClient(submittingToClient)
                        ? (universalTrackerRows as unknown as TrackerRowWithId[])
                        : [],
    [
      submittingToClient,
      itcTrackerRows,
      kpmgTrackerRows,
      ustTrackerRows,
      lttsTrackerRows,
      accentureTrackerRows,
      metaforgeTrackerRows,
      brillioTrackerRows,
      happiestMindsTrackerRows,
      universalTrackerRows,
    ],
  );

  const baseTrackerHeaders = useMemo(
    () =>
      selectedTrackerRows[0]
        ? Object.keys(selectedTrackerRows[0]).filter((k) => k !== 'candidateId')
        : ([] as string[]),
    [selectedTrackerRows],
  );

  useEffect(() => {
    if (baseTrackerHeaders.length === 0) return;
    setTrackerColumnOrder((prev) => syncTrackerColumnOrder(prev, baseTrackerHeaders));
  }, [baseTrackerHeaders, submittingToClient]);

  const handleExtraColumnRemoved = useCallback((columnId: string) => {
    setExtraTrackerCellValues((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const [candidateId, values] of Object.entries(prev)) {
        const rest = { ...values };
        delete rest[columnId];
        next[candidateId] = rest;
      }
      return next;
    });
  }, []);

  const markTrackerCustomizationDirty = useCallback(() => {
    setTrackerCustomizationSaved(false);
  }, []);

  const trackerCustomization: TrackerCustomization = useMemo(
    () => ({
      headerBgColor: normalizeHexColorOrDefault(
        trackerHeaderBgColor,
        TRACKER_HEADER_BG_DEFAULTS[submittingToClient] ?? '#e8e8e8',
      ),
      columnOrder: trackerColumnOrder,
      extraCellValues: extraTrackerCellValues,
      onExtraCellChange: updateExtraCell,
    }),
    [
      trackerHeaderBgColor,
      submittingToClient,
      trackerColumnOrder,
      extraTrackerCellValues,
      updateExtraCell,
    ],
  );

  if (!requirement) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">Requirement not found</h2>
          <p className="mt-2 text-sm text-gray-500">The requirement could not be found.</p>
          <div className="mt-4 flex justify-start">
            <PageBackNav className="mb-0" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">Sign in required</h2>
          <p className="mt-2 text-sm text-gray-500">Please sign in to submit candidates.</p>
          <div className="mt-4 flex justify-start">
            <PageBackNav className="mb-0" />
          </div>
        </div>
      </div>
    );
  }

  if (!canWorkOnRequirement) {
    return (
      <div className="space-y-6">
        <PageBackNav />
        <RequirementViewOnlyBanner message={workBlockReason ?? 'This requirement is view only.'} />
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">Submission unavailable</h2>
          <p className="mt-2 text-sm text-gray-500">
            You can view this requirement, but candidate sourcing and submission are disabled until you are
            assigned.
          </p>
        </div>
      </div>
    );
  }

  const validateClientEmails = () => {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (wantsSubmitToLead || wantsForwardLoop) {
      const from = normalizeThreadFromSender(submissionFrom);
      if (!from.displayName) {
        setClientEmailsError('Enter the recruiter display name in the From section.');
        return false;
      }
      if (!from.email || !emailRe.test(from.email)) {
        setClientEmailsError('Enter a valid reply-to email in the From section.');
        return false;
      }
    }

    if (wantsForwardLoop) {
      const normalized = normalizeThreadRecipients(threadRecipients);
      if (normalized.to.length === 0) {
        setClientEmailsError('Add at least one recipient in To for the client email thread.');
        return false;
      }
      const all = [...normalized.to, ...normalized.cc, ...normalized.bcc];
      const invalid = all.filter((e) => !emailRe.test(e));
      if (invalid.length > 0) {
        setClientEmailsError('Each recipient email must be valid.');
        return false;
      }
    }

    if (wantsSubmitToLead) {
      const trimmed = clientEmails.map((e) => e.trim()).filter(Boolean);
      if (trimmed.length === 0) {
        setClientEmailsError('Enter at least one lead email.');
        return false;
      }
      const invalid = trimmed.filter((e) => !emailRe.test(e));
      if (invalid.length > 0) {
        setClientEmailsError('Each lead email must be valid.');
        return false;
      }
    }

    setClientEmailsError(null);
    return true;
  };

  const validatePositions = () => {
    if (positionsToSubmit < 1) {
      setPositionsError('Number of positions must be at least 1');
      return false;
    }
    if (!Number.isInteger(positionsToSubmit)) {
      setPositionsError('Please enter a whole number');
      return false;
    }
    setPositionsError(null);
    return true;
  };

  const trackerTemplateSupported = selectedTrackerRows.length > 0;

  const saveTrackerCustomization = () => {
    setTrackerCustomizationSaved(true);
  };

  const handleAttachCandidate = (candidate: Candidate) => {
    if (limitReached) return;
    if (isSubmittedToClientForJd(candidate.id, requirementId)) {
      notify.warning('Candidate already submitted to the client for this requirement.');
      return;
    }
    const stage = getSubmissionStageForJd(candidate.id, requirementId);
    if (stage === 'lead' && !isLead) {
      notify.warning('This candidate is already submitted to lead for this requirement.');
      return;
    }
    setAttachedCandidates((prev) => [...prev, candidate]);
    setCandidateSearch('');
  };

  const handleRemoveCandidate = (candidateId: string) => {
    setAttachedCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    setResumeFileByCandidateId((prev) => {
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });
  };

  const persistClientEmailSuggestions = (emails: string[]) => {
    const next = rememberClientEmails(emails);
    setSavedClientEmailSuggestions(next);
    return next;
  };

  const handleClientEmailBlur = (value: string) => {
    const trimmed = value.trim();
    if (!isValidClientEmail(trimmed)) return;
    persistClientEmailSuggestions([trimmed]);
  };

  const handleSubmit = async () => {
    if (isLead && !forwardOnly && !submitToLeadChecked && !forwardToClientLoopChecked) {
      notify.warning('Select at least one option: Submit to Lead or Forward to client email thread.');
      return;
    }
    if (!validateClientEmails()) return;
    if (wantsForwardLoop && !confirmClientThread) {
      notify.warning('Confirm forwarding in the original client email thread.');
      return;
    }
    if (wantsForwardLoop && !threadGraphLinked && !threadSubject.trim() && !manualSubjectDraft.trim()) {
      notify.warning('Enter the original email subject and click Find email thread before forwarding to the client.');
      return;
    }
    persistClientEmailSuggestions(clientEmails.map((e) => e.trim()).filter(Boolean));
    if (!validatePositions()) return;
    if (attachedCandidates.length === 0) return;

    const duplicateCandidate = attachedCandidates.find((candidate) => {
      if (wantsForwardLoop && !wantsSubmitToLead) {
        const existing = findSubmissionForJd(submissions, candidate.id, requirementId);
        return existing ? !isLeadReviewStatus(existing.status) : true;
      }
      if (wantsSubmitToLead && !wantsForwardLoop) {
        const stage = getSubmissionStageForJd(candidate.id, requirementId);
        return stage === 'lead' || isSubmittedToClientForJd(candidate.id, requirementId);
      }
      return isSubmittedToClientForJd(candidate.id, requirementId);
    });
    if (duplicateCandidate) {
      notify.warning(
        wantsForwardLoop && !wantsSubmitToLead
          ? 'Candidate must already be submitted to lead before forwarding to the client thread.'
          : 'Candidate already submitted to the client for this requirement.',
      );
      setIsSubmitting(false);
      return;
    }

    if (wantsForwardLoop && !wantsSubmitToLead) {
      const notAtLead = attachedCandidates.filter((candidate) => {
        const existing = findSubmissionForJd(submissions, candidate.id, requirementId);
        return !existing || !isLeadReviewStatus(existing.status);
      });
      if (notAtLead.length > 0) {
        notify.warning(
          'Some candidates are not yet submitted to lead. Check Submit to Lead or remove them before forward-only.',
        );
        setIsSubmitting(false);
        return;
      }
    }

    if (attachedCandidates.length > positionsToSubmit) {
      setPositionsError(
        `Cannot submit ${attachedCandidates.length} candidates. Maximum allowed is ${positionsToSubmit} for ${positionsToSubmit} position(s).`,
      );
      return;
    }

    if (submittingToClient === 'itc') {
      if (itcTrackerRows.length !== attachedCandidates.length) {
        notify.warning(
          'Submission tracker rows are still loading or out of sync. Wait a moment, or re-attach candidates, then try again.',
        );
        return;
      }
    }
    if (submittingToClient === 'kpmg') {
      if (kpmgTrackerRows.length !== attachedCandidates.length) {
        notify.warning(
          'Submission tracker rows are still loading or out of sync. Wait a moment, or re-attach candidates, then try again.',
        );
        return;
      }
    }
    if (submittingToClient === 'ust') {
      if (ustTrackerRows.length !== attachedCandidates.length) {
        notify.warning(
          'Submission tracker rows are still loading or out of sync. Wait a moment, or re-attach candidates, then try again.',
        );
        return;
      }
    }
    if (submittingToClient === 'ltts') {
      if (lttsTrackerRows.length !== attachedCandidates.length) {
        notify.warning(
          'Submission tracker rows are still loading or out of sync. Wait a moment, or re-attach candidates, then try again.',
        );
        return;
      }
    }
    if (submittingToClient === 'accenture') {
      if (accentureTrackerRows.length !== attachedCandidates.length) {
        notify.warning(
          'Submission tracker rows are still loading or out of sync. Wait a moment, or re-attach candidates, then try again.',
        );
        return;
      }
    }
    if (isUniversalTrackerClient(submittingToClient)) {
      if (!customClientName.trim()) {
        notify.warning('Enter the client name for Other/Custom.');
        return;
      }
      if (universalTrackerRows.length !== attachedCandidates.length) {
        notify.warning(
          'Submission tracker rows are still loading or out of sync. Wait a moment, or re-attach candidates, then try again.',
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const shouldForwardExisting = wantsForwardLoop;
      const toCreate = wantsSubmitToLead
        ? attachedCandidates.filter((candidate) => {
            const existing = findSubmissionForJd(
              submissions,
              candidate.id,
              requirementId,
              (otherId) => {
                const other = candidates.find((c) => c.id === otherId);
                return other?.email === candidate.email || other?.phone === candidate.phone;
              },
            );
            if (existing && isLeadReviewStatus(existing.status)) return false;
            if (isSubmittedToClientForJd(candidate.id, requirementId)) return false;
            return true;
          })
        : [];

      await Promise.all(
        attachedCandidates
          .filter((candidate) => {
            if (!shouldForwardExisting) return false;
            const existing = findSubmissionForJd(submissions, candidate.id, requirementId);
            return Boolean(existing && isLeadReviewStatus(existing.status));
          })
          .map(async (candidate) => {
            const existing = findSubmissionForJd(submissions, candidate.id, requirementId)!;
            await forwardSubmissionToClient(existing.id);
          }),
      );

      const createdSubmissions = await Promise.all(
        toCreate.map((candidate) =>
          submitCandidate({
            candidate: {
              name: candidate.name,
              email: candidate.email,
              phone: candidate.phone,
              currentEmployer: candidate.currentEmployer,
              experienceLabel: candidate.experienceLabel,
              technologiesRaw: candidate.technologies.join(', '),
              resumeRef: candidate.resumeRef,
            },
            jdId: requirementId,
            submittedBy: currentUser,
            existingCandidateId: candidate.id,
            resumeFile: resumeFileByCandidateId[candidate.id] ?? null,
            resumeOptional: true,
            submissionStage: 'lead',
          }),
        ),
      );

      const userKey = String(currentUser?.id ?? currentUser?.email ?? '').trim();
      if (userKey && createdSubmissions.length > 0) {
        const activityRows: RequirementActivityRow[] = createdSubmissions.map(({ submission, candidate }) => ({
          id: submission.id,
          requirementId,
          action: 'submission.created',
          summary: '',
          metadata: {
            submissionId: submission.id,
            candidateId: candidate.id,
            candidateName: candidate.name,
            recruiterId: currentUser?.id ?? null,
          },
          createdAt: submission.submittedOn ?? new Date().toISOString(),
          actorId: currentUser?.id ?? null,
          actorName: currentUser?.name ?? null,
          actorEmail: currentUser?.email ?? null,
        }));
        markActivitiesSeen(userKey, requirementId, activityRows);
      }
    } catch (err) {
      console.error('Failed to submit:', err);
      notify.error(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      setIsSubmitting(false);
      return;
    }

    try {
      const normalizedHeaderBg = normalizeHexColorOrDefault(
        trackerHeaderBgColor,
        TRACKER_HEADER_BG_DEFAULTS[submittingToClient] ?? '#e8e8e8',
      );
      const { headers: renderHeaders, rows: renderRows } = buildTrackerRenderPayload(
        trackerColumnOrder,
        selectedTrackerRows,
        attachedCandidates.map((c) => c.id),
        extraTrackerCellValues,
      );

      const normalizedThreadRecipients = needsClientThread
        ? normalizeThreadRecipients(threadRecipients)
        : null;

      const normalizedFrom = normalizeThreadFromSender(submissionFrom);
      const profileSig = readMyWorkFooterSignature();

      const emailResult = await sendClientSubmissionEmailApi({
        clientEmails: wantsSubmitToLead ? clientEmails.map((e) => e.trim()).filter(Boolean) : [],
        submissionDestination: wantsForwardLoop && !wantsSubmitToLead ? 'client' : 'lead',
        submitToLead: wantsSubmitToLead,
        forwardToClientLoop: wantsForwardLoop,
        alsoForwardToClientThread: wantsSubmitToLead && wantsForwardLoop,
        confirmClientThread: wantsForwardLoop,
        requirementId,
        candidateIds: attachedCandidates.map((c) => c.id),
        ...(normalizedThreadRecipients
          ? {
              threadToRecipients: normalizedThreadRecipients.to,
              threadCcRecipients: normalizedThreadRecipients.cc,
              threadBccRecipients: normalizedThreadRecipients.bcc,
              ...(threadSubject.trim() || manualSubjectDraft.trim()
                ? { threadSubject: (threadSubject.trim() || manualSubjectDraft.trim()) }
                : {}),
            }
          : {}),
        submittingToClient,
        ...(isUniversalTrackerClient(submittingToClient) && customClientName.trim()
          ? { customClientName: customClientName.trim() }
          : {}),
        clientTracker:
          submittingToClient === 'itc'
            ? { client: 'itc', rows: toItcInfotechApiRows(itcTrackerRows) }
            : submittingToClient === 'kpmg'
              ? { client: 'kpmg', rows: toKpmgApiRows(kpmgTrackerRows) }
              : submittingToClient === 'ust'
                ? { client: 'ust', rows: toUstApiRows(ustTrackerRows) }
                : submittingToClient === 'ltts'
                  ? { client: 'ltts', rows: toLttsApiRows(lttsTrackerRows) }
                  : submittingToClient === 'accenture'
                    ? { client: 'accenture', rows: toAccentureApiRows(accentureTrackerRows) }
                    : submittingToClient === 'metaforge'
                      ? { client: 'metaforge', rows: toMetaforgeApiRows(metaforgeTrackerRows) }
                      : submittingToClient === 'brillio'
                        ? { client: 'brillio', rows: toBrillioApiRows(brillioTrackerRows) }
                        : submittingToClient === 'happiest-minds'
                          ? {
                              client: 'happiest-minds',
                              rows: toHappiestMindsApiRows(happiestMindsTrackerRows),
                            }
                          : isUniversalTrackerClient(submittingToClient)
                            ? {
                                client: 'other-custom',
                                customClientName: customClientName.trim(),
                                rows: toUniversalApiRows(universalTrackerRows),
                              }
                            : undefined,
        clientTrackerRenderOverride:
          renderHeaders.length > 0 && renderRows.length === attachedCandidates.length
            ? {
                headers: renderHeaders,
                rows: renderRows,
                styles: { headerBgColor: normalizedHeaderBg },
              }
            : undefined,
        recruiterSignature: {
          ...profileSig,
          name: normalizedFrom.displayName,
          email: normalizedFrom.email,
          ...(currentUser?.phone?.trim() ? { phone: currentUser.phone.trim() } : {}),
        },
        emailGreeting: emailGreeting.trim() || buildSubmissionEmailGreeting(greetingToEmails, threadToNames),
        emailIntroduction: emailIntroduction.trim() || DEFAULT_SUBMISSION_EMAIL_INTRODUCTION,
        ...(Object.keys(threadToNames).length ? { threadToRecipientNames: threadToNames } : {}),
      });
      const okCount = emailResult.recipients.filter((r) => r.ok).length;
      const failMsg =
        emailResult.partialFailures?.length &&
        emailResult.partialFailures.map((f) => `${f.to}: ${f.error ?? 'failed'}`).join('; ');
      if (emailResult.dryRun) {
        notify.success(
          wantsForwardLoop && !wantsSubmitToLead
            ? 'Dry run successful: client email thread was resolved. No real email was sent.'
            : wantsSubmitToLead && wantsForwardLoop
              ? 'Dry run successful: lead submission and client thread forward were prepared.'
              : 'Dry run successful: lead submission email was prepared. No real email was sent.',
        );
      } else if (failMsg) {
        notify.warning(
          `Submission saved. Some email delivery failed: ${failMsg}. Resume files attach when stored on the server.`,
        );
      } else {
        notify.success(
          wantsForwardLoop && !wantsSubmitToLead
            ? 'Candidates forwarded in the original requirement email thread.'
            : wantsSubmitToLead && wantsForwardLoop
              ? 'Submission recorded, lead email sent, and candidates forwarded in the client email thread.'
              : 'Submission saved and sent to the selected lead for review.',
        );
      }
    } catch (err) {
      console.error('Failed to send client email:', err);
      notify.error(
        err instanceof Error
          ? wantsForwardLoop && !wantsSubmitToLead
            ? `Forward failed: ${err.message}`
            : wantsSubmitToLead && wantsForwardLoop
              ? `Submission was saved, but email delivery failed: ${err.message}`
              : `Candidates were submitted, but the lead review email could not be sent: ${err.message}`
          : 'Candidates were submitted, but the submission email could not be sent.',
      );
    } finally {
      setIsSubmitting(false);
    }

    try {
      await refresh();
    } catch (refreshErr) {
      console.warn('Failed to refresh candidate submissions after submit', refreshErr);
    }

    if (onComplete) {
      onComplete();
    } else {
      router.push(`/requirements/${requirementId}`);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      {!compact ? <PageBackNav /> : null}

      <PageHeader
        title="Submission to Client"
        subtitle={`Submit candidates for ${requirement.roleTitle} at ${requirement.clientLeadPoc}`}
      />

      {/* Submitting to client */}
      <FormSection
        title="Submission destination"
        description={
          forwardOnly
            ? 'Forward approved candidates in the original client email thread. This does not create a second submission.'
            : isLead
              ? 'Choose what to do — you can select one or both. Submit to Lead counts in metrics; forward to the loop does not add a second submission.'
              : 'Send candidate details to your assigned Lead for internal review. This counts as a submission.'
        }
      >
        {forwardOnly ? (
          <div className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
            <div className="font-semibold">Forward to client email thread</div>
            <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
              Reply in the original requirement email thread for candidates already submitted to lead.
            </p>
          </div>
        ) : isLead ? (
          <div className="max-w-3xl grid gap-3 sm:grid-cols-2">
            <label
              className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
                submitToLeadChecked
                  ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100 dark:border-blue-800 dark:bg-blue-950/30'
                  : 'border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'
              } ${attachedAllAlreadyAtLead ? 'opacity-70' : ''}`}
            >
              <input
                type="checkbox"
                checked={submitToLeadChecked}
                disabled={attachedAllAlreadyAtLead}
                onChange={(e) => {
                  setSubmitToLeadChecked(e.target.checked);
                  setClientEmailsError(null);
                }}
                className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="font-semibold text-gray-900 dark:text-zinc-100">Submit to Lead</span>
                <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                  Send to lead review email. <strong>Counts as one submission.</strong>
                </p>
                {attachedAllAlreadyAtLead ? (
                  <p className="mt-1 text-xs text-blue-800 dark:text-blue-200">
                    Already submitted to lead for selected candidate(s).
                  </p>
                ) : null}
              </span>
            </label>
            <label
              className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
                forwardToClientLoopChecked
                  ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-100 dark:border-amber-800 dark:bg-amber-950/30'
                  : 'border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'
              }`}
            >
              <input
                type="checkbox"
                checked={forwardToClientLoopChecked}
                onChange={(e) => {
                  setForwardToClientLoopChecked(e.target.checked);
                  if (!e.target.checked) setConfirmClientThread(false);
                  setClientEmailsError(null);
                }}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span>
                <span className="font-semibold text-gray-900 dark:text-zinc-100">
                  Forward to original requirement loop
                </span>
                <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                  Reply in the client/DL email thread. <strong>Not a separate submission.</strong>
                </p>
              </span>
            </label>
          </div>
        ) : (
          <div className="max-w-3xl rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20">
            <div className="font-semibold">Submit to Lead</div>
            <p className="mt-1 text-blue-900/90 dark:text-blue-200/90">
              Your submission is sent to the lead for review and counts in submission metrics.
            </p>
          </div>
        )}
        <div className="mt-4 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client">
            <Select
              value={submittingToClient}
              onChange={(e) => {
                const next = e.target.value;
                setSubmittingToClient(next);
                if (!isUniversalTrackerClient(next)) {
                  setCustomClientName('');
                }
              }}
              aria-label="Select client"
            >
              {SUBMISSION_CLIENTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option value={SUBMISSION_CLIENT_OTHER}>{SUBMISSION_CLIENT_OTHER_LABEL}</option>
              {isLegacyFreeTextSubmittingTo ? (
                <option value={submittingToClient}>{submittingToClient}</option>
              ) : null}
            </Select>
          </Field>
          {isUniversalTrackerClient(submittingToClient) ? (
            <Field label="Client name">
              <TextInput
                value={customClientName}
                onChange={(e) => setCustomClientName(e.target.value)}
                placeholder="e.g. Deloitte, TCS, Infosys"
                aria-label="Custom client name"
              />
            </Field>
          ) : null}
        </div>
        <form
          autoComplete="on"
          onSubmit={(e) => e.preventDefault()}
          className="mt-4 max-w-none space-y-3"
        >
          {needsClientThread ? (
            <div className="max-w-none space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                <div className="font-semibold text-slate-900 dark:text-slate-100">How the email loop connects</div>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>
                    <strong>Auto-ingested requirements</strong> — the app stores the Microsoft Graph message ID from{' '}
                    {threadGraphLinked ? (
                      <span className="text-emerald-700 dark:text-emerald-400">the linked mailbox message (ready)</span>
                    ) : (
                      <span>the ingestion mailbox when the DL/client email was processed</span>
                    )}
                    .
                  </li>
                  <li>
                    <strong>Manually created requirements</strong> — paste the exact original subject below and click{' '}
                    <strong>Find email thread</strong>. The app searches{' '}
                    <span className="font-mono">recruitment.application@metaforgeit.com</span> and saves the link on this
                    requirement.
                  </li>
                  <li>
                    <strong>On forward</strong> — the app calls Microsoft Graph <span className="font-mono">createReplyAll</span>{' '}
                    on that message so your submission appears in the same client/DL thread (not a new email).
                  </li>
                </ul>
              </div>
              {threadParticipantsLoading ? (
                <p className="text-sm text-gray-500 dark:text-zinc-400">Loading original email recipients…</p>
              ) : null}
              {threadParticipantsError ? (
                <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{threadParticipantsError}</p>
              ) : null}
              {!threadGraphLinked && !threadParticipantsLoading ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <Field
                    label="Original email subject"
                    hint="Required for manually created requirements. Paste the exact subject from the client or DL email, then find the thread."
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <TextInput
                        value={manualSubjectDraft}
                        onChange={(e) => setManualSubjectDraft(e.target.value)}
                        placeholder="e.g. Mail to test the Recruiter Application"
                        disabled={isSubmitting || threadLookupLoading}
                        className="min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => void handleLookupEmailThread()}
                        disabled={isSubmitting || threadLookupLoading || !manualSubjectDraft.trim()}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-100"
                      >
                        <Search className="h-4 w-4" />
                        {threadLookupLoading ? 'Finding…' : 'Find email thread'}
                      </button>
                    </div>
                  </Field>
                </div>
              ) : threadGraphLinked ? (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Original email thread linked. Recipients below are from that message.
                </p>
              ) : null}
              <EmailRecipientEditor
                value={threadRecipients}
                onChange={setThreadRecipients}
                subject={threadSubject}
                onSubjectChange={setThreadSubject}
                fromSender={submissionFrom}
                onFromSenderChange={setSubmissionFrom}
                disabled={isSubmitting || threadParticipantsLoading}
              />
            </div>
          ) : wantsSubmitToLead ? (
            <SubmissionFromEditor
              value={submissionFrom}
              onChange={setSubmissionFrom}
              disabled={isSubmitting}
            />
          ) : null}
          {wantsSubmitToLead && !forwardOnly ? (
            <>
              <datalist id="submission-client-email-suggestions">
                {savedClientEmailSuggestions.map((addr) => (
                  <option key={addr} value={addr} />
                ))}
              </datalist>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-zinc-200">Lead review email</span>
                <button
                  type="button"
                  onClick={() => setClientEmails((prev) => [...prev, ''])}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add lead email
                </button>
              </div>
              {clientEmails.map((email, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Field
                    className="min-w-0 flex-1"
                    label={index === 0 ? 'Lead email' : `Lead email ${index + 1}`}
                  >
                    <TextInput
                      value={email}
                      onChange={(e) => {
                        const v = e.target.value;
                        setClientEmails((prev) => prev.map((x, i) => (i === index ? v : x)));
                        if (clientEmailsError) setClientEmailsError(null);
                      }}
                      onBlur={() => handleClientEmailBlur(email)}
                      placeholder="lead@company.com"
                      type="email"
                      name={index === 0 ? 'client-recipient-email' : `client-recipient-email-${index + 1}`}
                      autoComplete="email"
                      list="submission-client-email-suggestions"
                    />
                  </Field>
                  {clientEmails.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setClientEmails((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="mt-7 shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-zinc-800"
                      aria-label={`Remove client email ${index + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="mt-7 w-9 shrink-0" aria-hidden />
                  )}
                </div>
              ))}
            </>
          ) : null}
          {clientEmailsError ? (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{clientEmailsError}</p>
          ) : null}
          {(wantsSubmitToLead || needsClientThread) ? (
            <SubmissionEmailContentEditor
              greeting={emailGreeting}
              onGreetingChange={(value) => {
                setGreetingTouched(true);
                setEmailGreeting(value);
              }}
              introduction={emailIntroduction}
              onIntroductionChange={(value) => {
                setIntroductionTouched(true);
                setEmailIntroduction(value);
              }}
              onResetGreeting={resetGreetingFromTo}
              onResetIntroduction={resetIntroductionDefault}
              disabled={isSubmitting}
            />
          ) : null}
        </form>
        {wantsForwardLoop ? (
          <label className="mt-3 flex max-w-xl items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <input
              type="checkbox"
              checked={confirmClientThread}
              onChange={(e) => setConfirmClientThread(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span>
              I confirm these candidates should be forwarded in the original client requirement email thread.
            </span>
          </label>
        ) : null}
        <p className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
          {wantsForwardLoop && !wantsSubmitToLead
            ? 'Candidates will be forwarded in the original requirement email thread for:'
            : wantsSubmitToLead && wantsForwardLoop
              ? 'One submission will be recorded; lead email and client thread forward for:'
              : wantsSubmitToLead
                ? 'Candidate submission will be sent to the selected lead for review for:'
                : 'Select at least one action above.'}{' '}
          <span className="font-medium text-gray-900 dark:text-zinc-100">
            {resolveSubmissionClientLabel(submittingToClient, customClientName)}
          </span>
        </p>
      </FormSection>

      {/* Requirement Summary */}
      <FormSection
        title="Requirement"
        description="Details of the position you are submitting for (read-only)"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Role</div>
            <div className="mt-1 font-medium text-gray-800">{requirement.roleTitle}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Client</div>
            <div className="mt-1 font-medium text-gray-800">{requirement.clientLeadPoc}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Experience</div>
            <div className="mt-1 font-medium text-gray-800">{requirement.experience}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Skills</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {requirement.skills.map((skill) => (
              <Badge key={skill} className="border-gray-200 bg-gray-100 text-gray-700">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      </FormSection>

      {/* Number of Positions & Add Active Candidate */}
      <FormSection
        title="Attach Candidates"
        description="Search and attach candidates for this requirement. Profiles do not need every field filled in. Use Attach resume on each row to upload PDF or DOCX (optional if already on file)."
      >
        <div className="space-y-4">
          <div className="max-w-xs">
            <Field
              label="Number of Positions to Submit"
              hint="Maximum number of candidates you can attach"
              error={positionsError ?? undefined}
            >
              <TextInput
                type="number"
                min={1}
                value={positionsToSubmit}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  setPositionsToSubmit(isNaN(v) ? 1 : Math.max(1, Math.floor(v)));
                  if (positionsError) setPositionsError(null);
                }}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowSearch((s) => !s);
                if (!showSearch) setCandidateSearch('');
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Active Candidate
            </button>
            <Link
              href={`/candidates?requirementId=${encodeURIComponent(requirementId)}`}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
            >
              Open Candidate Repository (checkboxes)
            </Link>
          </div>

            {showSearch && (
              <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                <p className="text-xs text-gray-600 dark:text-zinc-400">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">Active</span> = resume
                  on file (newest first). Same list includes everyone else — search to filter.
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    placeholder="Search by Name, Candidate ID, Email, or Contact Number"
                    className={cn(
                      'w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm',
                      'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-0',
                    )}
                    autoFocus
                  />
                </div>

                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {isLoading ? (
                    <p className="py-4 text-center text-sm text-gray-500">Loading candidates…</p>
                  ) : searchableCandidates.length === 0 ? (
                    <p className="py-4 text-center text-sm text-gray-500">
                      {candidateSearch.trim()
                        ? 'No candidates match your search.'
                        : 'No candidates yet. Add candidates on Candidate Search & Entry with a resume, then return here.'}
                    </p>
                  ) : (
                    searchableCandidates.map((c) => {
                      const stage = getSubmissionStageForJd(c.id, requirementId);
                      const alreadySubmitted = stage === 'client' || (stage === 'lead' && !isLead);
                      const stageBadge =
                        stage === 'lead'
                          ? 'Submitted to Lead'
                          : stage === 'client'
                            ? 'Submitted to Client'
                            : null;
                      return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-900">{c.name}</span>
                            {stageBadge ? (
                              <Badge className={`text-xs ${
                                stage === 'lead'
                                  ? 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300'
                                  : 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300'
                              }`}>
                                {stageBadge}
                              </Badge>
                            ) : null}
                            {hasResumeOnFile(c) && (
                              <Badge className="border-emerald-200 bg-emerald-50 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                Active
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {c.id} • {c.email} • {c.phone || '—'}
                          </div>
                          {(c.currentEmployer ||
                            c.experienceLabel ||
                            c.totalExperience != null) && (
                            <div className="mt-1 text-xs text-gray-600">
                              {c.currentEmployer ?? '—'} • Total exp: {formatCandidateTotalYears(c)}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAttachCandidate(c)}
                          disabled={limitReached || alreadySubmitted}
                          className={cn(
                            'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                            limitReached || alreadySubmitted
                              ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                              : 'bg-blue-600 text-white hover:bg-blue-700',
                          )}
                        >
                          {alreadySubmitted ? 'Already submitted' : limitReached ? 'Limit reached' : 'Attach'}
                        </button>
                      </div>
                      );
                    })
                  )}
                </div>

                {limitReached && (
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Maximum of {positionsToSubmit} candidate(s) reached. Increase &quot;Number of
                    Positions to Submit&quot; or remove an attached candidate to add more.
                  </p>
                )}
              </div>
            )}

          {/* Attached candidates list */}
          {attachedCandidates.length > 0 && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-2 text-sm font-semibold text-gray-800">
                Attached Candidates ({attachedCandidates.length} / {positionsToSubmit})
              </div>
              {attachedCandidates.length > positionsToSubmit && (
                <p className="mb-3 text-sm font-medium text-rose-700 dark:text-rose-400">
                  You have attached {attachedCandidates.length} candidate(s) but only {positionsToSubmit}{' '}
                  position(s) to submit. Remove {attachedCandidates.length - positionsToSubmit} candidate(s)
                  or increase the number of positions.
                </p>
              )}
              <div className="space-y-3">
                {attachedCandidates.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-zinc-700 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-gray-900">{c.name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        {c.id} • {c.email}
                      </span>
                      <div className="mt-1 text-xs text-gray-600 dark:text-zinc-400">
                        {resumeFileByCandidateId[c.id] ? (
                          <span className="font-medium text-blue-700 dark:text-blue-300">
                            New attachment: {resumeFileByCandidateId[c.id]!.name}
                          </span>
                        ) : hasResumeOnFile(c) ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Resume on file: {c.resumeRef}
                          </span>
                        ) : (
                          <span className="text-zinc-500 dark:text-zinc-400">
                            No resume yet — attach below (optional)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 shadow-sm transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60">
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            setResumeFileByCandidateId((prev) => ({
                              ...prev,
                              [c.id]: file ?? undefined,
                            }));
                            e.target.value = '';
                          }}
                        />
                        {hasResumeOnFile(c) || resumeFileByCandidateId[c.id]
                          ? 'Replace resume'
                          : 'Attach resume'}
                      </label>
                      {resumeFileByCandidateId[c.id] ? (
                        <button
                          type="button"
                          onClick={() =>
                            setResumeFileByCandidateId((prev) => {
                              const next = { ...prev };
                              delete next[c.id];
                              return next;
                            })
                          }
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          Clear attachment
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleRemoveCandidate(c.id)}
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                        aria-label={`Remove ${c.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </FormSection>

      {submittingToClient === 'itc' ? (
        <ItcInfotechTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          rows={itcTrackerRows}
          onRowsChange={setItcTrackerRows}
          customization={trackerCustomization}
        />
      ) : submittingToClient === 'kpmg' ? (
        <KpmgTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          rows={kpmgTrackerRows}
          onRowsChange={setKpmgTrackerRows}
          customization={trackerCustomization}
        />
      ) : submittingToClient === 'ust' ? (
        <UstTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          recruiter={ustRecruiter}
          rows={ustTrackerRows}
          onRowsChange={setUstTrackerRows}
          customization={trackerCustomization}
        />
      ) : submittingToClient === 'ltts' ? (
        <LttsTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          rows={lttsTrackerRows}
          onRowsChange={setLttsTrackerRows}
          customization={trackerCustomization}
        />
      ) : submittingToClient === 'accenture' ? (
        <AccentureTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          rows={accentureTrackerRows}
          onRowsChange={setAccentureTrackerRows}
          customization={trackerCustomization}
        />
      ) : submittingToClient === 'metaforge' ? (
        <MetaforgeTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          rows={metaforgeTrackerRows}
          onRowsChange={setMetaforgeTrackerRows}
          customization={trackerCustomization}
        />
      ) : submittingToClient === 'brillio' ? (
        <BrillioTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          rows={brillioTrackerRows}
          onRowsChange={setBrillioTrackerRows}
          customization={trackerCustomization}
        />
      ) : submittingToClient === 'happiest-minds' ? (
        <HappiestMindsTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          rows={happiestMindsTrackerRows}
          onRowsChange={setHappiestMindsTrackerRows}
          customization={trackerCustomization}
        />
      ) : isUniversalTrackerClient(submittingToClient) ? (
        <UniversalTrackerSection
          requirement={requirement}
          requirementId={requirementId}
          customClientName={customClientName}
          attachedCandidates={attachedCandidates}
          submissions={submissions}
          rows={universalTrackerRows}
          onRowsChange={setUniversalTrackerRows}
          customization={trackerCustomization}
        />
      ) : null}

      {trackerTemplateSupported ? (
        <FormSection
          title="Tracker customization"
          description="Reorder columns, hide fields, add custom ones, and set the header color — all in one compact panel."
        >
          <TrackerColumnOrderEditor
            columnOrder={trackerColumnOrder}
            onColumnOrderChange={setTrackerColumnOrder}
            newColumnName={newTrackerColumnName}
            onNewColumnNameChange={setNewTrackerColumnName}
            onExtraColumnRemoved={handleExtraColumnRemoved}
            onDirty={markTrackerCustomizationDirty}
            headerBgColor={trackerHeaderBgColor}
            defaultHeaderBgColor={TRACKER_HEADER_BG_DEFAULTS[submittingToClient] ?? '#e8e8e8'}
            onHeaderBgColorChange={setTrackerHeaderBgColor}
            customizationSaved={trackerCustomizationSaved}
            onSave={saveTrackerCustomization}
            showSaveBar={attachedCandidates.length > 0}
          />
        </FormSection>
      ) : null}

      {/* Submit — fixed footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200/80 bg-white/95 px-4 py-4 shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.15)] backdrop-blur-md transition-[left] duration-300 supports-[backdrop-filter]:bg-white/90 dark:border-zinc-800/80 dark:bg-zinc-950/95 lg:left-[var(--app-sidebar-width,300px)] lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-600 dark:text-zinc-400">
            {attachedCandidates.length === 0
              ? wantsForwardLoop && !wantsSubmitToLead
                ? 'Add candidates already submitted to lead, then forward in the client thread.'
                : wantsSubmitToLead && wantsForwardLoop
                  ? 'Add candidates — submit to lead and/or forward to the client loop.'
                  : wantsSubmitToLead
                    ? 'Add at least one candidate, then submit to lead for review.'
                    : 'Select Submit to Lead and/or Forward to client thread.'
              : wantsForwardLoop && !wantsSubmitToLead
                ? `Forward ${attachedCandidates.length} candidate(s) in the original client email thread.`
                : wantsSubmitToLead && wantsForwardLoop
                  ? `Submit ${attachedCandidates.length} candidate(s) to lead and forward in the client loop.`
                  : wantsSubmitToLead
                    ? `Submit ${attachedCandidates.length} candidate(s) to lead for review.`
                    : `Ready: ${attachedCandidates.length} candidate(s) selected.`}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              attachedCandidates.length === 0 ||
              attachedCandidates.length > positionsToSubmit
            }
            className="h-11 shrink-0 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? 'Working…'
              : wantsForwardLoop && !wantsSubmitToLead
                ? 'Forward to Client Thread'
                : wantsSubmitToLead && wantsForwardLoop
                  ? 'Submit to Lead & Forward'
                  : wantsSubmitToLead
                    ? 'Submit to Lead'
                    : 'Continue'}
          </button>
        </div>
      </div>

      {submissions.filter((s) => s.jdId === requirementId).length > 0 && (
        <div className="text-sm text-gray-500">
          {submissions.filter((s) => s.jdId === requirementId).length} submission(s) already made
          for this requirement.
        </div>
      )}
    </div>
  );
}
