'use client';

import React, { useState, useMemo, useEffect, useDeferredValue, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  Mail,
  Video,
  User,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  Bell,
  Send,
  Filter,
  Search,
  Download,
  RefreshCw,
  Eye,
  AlertTriangle,
  Users,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/requirements/StatCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Field, Select, TextInput, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSubmissionsStore } from '@/lib/domain/submissions/store';
import type { Submission } from '@/lib/domain/submissions/types';
import {
  sendInterviewNotificationEmail,
  type InterviewNotificationKind,
} from '@/lib/api/notifications';
import {
  createInterview,
  deleteInterview,
  getInterviews,
  updateInterview,
  type InterviewRecord,
} from '@/lib/api/interviews';
import { patchSubmission } from '@/lib/api/submissions';
import {
  batchGetOfferLettersBySubmissions,
  recordOfferLetterResponse,
  type OfferLetterRecord,
} from '@/lib/api/offerLetters';
import { notify } from '@/lib/notify';
import { formatDateTime } from '@/lib/utils/dateTime';

const InterviewRoundSchema = z.enum(['L1', 'L2', 'Final']);
const InterviewModeSchema = z.enum(['Online', 'Offline', 'Hybrid']);
const InterviewStatusSchema = z.enum(['Scheduled', 'Completed', 'Cancelled', 'Rescheduled']);

const InterviewSchema = z.object({
  submissionId: z.string().min(1, 'Submission ID is required'),
  round: InterviewRoundSchema,
  date: z.string().min(1, 'Interview date is required'),
  time: z.string().min(1, 'Interview time is required'),
  mode: InterviewModeSchema,
  status: InterviewStatusSchema,
  location: z.string().optional(),
  meetingLink: z.string().optional(),
  candidateEmail: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email('Invalid email address').optional(),
  ),
  candidatePhone: z.string().optional(),
  sendEmail: z.boolean().default(false),
  sendWhatsApp: z.boolean().default(false),
  notes: z.string().optional(),
  reminderSent: z.boolean().default(false),
  interviewerName: z.string().optional(),
  interviewerEmail: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email('Invalid email address').optional(),
  ),
  feedback: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
  nextRoundDate: z.string().optional(),
  rescheduledFrom: z.string().optional(),
  cancellationReason: z.string().optional(),
});

type InterviewFormData = z.infer<typeof InterviewSchema>;
type Interview = InterviewFormData & {
  id: string;
  createdAt: string;
  updatedAt: string;
  candidateName: string;
  clientName: string;
  jobTitle: string;
  candidateEmail: string;
  candidatePhone: string;
  submissionStatus: string;
  finalDecision?: 'Selected' | 'Rejected';
  alerts: InterviewAlert[];
};

type InterviewAlert = {
  id: string;
  type: 'reminder' | 'reschedule' | 'cancellation' | 'feedback';
  message: string;
  timestamp: string;
  read: boolean;
};

type InterviewFilters = {
  status: string;
  round: string;
  mode: string;
  dateRange: 'today' | 'week' | 'month' | 'all';
  search: string;
  decision: 'all' | 'selected' | 'rejected';
};

type RejectModalState =
  | { kind: 'interview'; interview: Interview }
  | { kind: 'submission'; submission: Submission };

export function InterviewTrackingPage() {
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const { submissions, addSubmission, refresh } = useSubmissionsStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [interviewsLoading, setInterviewsLoading] = useState(true);
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [alerts, setAlerts] = useState<InterviewAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rejectModal, setRejectModal] = useState<RejectModalState | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [offerBySubmission, setOfferBySubmission] = useState<Record<string, OfferLetterRecord>>({});
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerResponseModal, setOfferResponseModal] = useState<
    | { kind: 'accept'; submission: Submission }
    | { kind: 'decline'; submission: Submission }
    | null
  >(null);
  const [acceptJoiningDate, setAcceptJoiningDate] = useState('');
  const [declineOfferReason, setDeclineOfferReason] = useState('');
  const [offerResponseSubmitting, setOfferResponseSubmitting] = useState(false);
  const [filters, setFilters] = useState<InterviewFilters>({
    status: 'all',
    round: 'all',
    mode: 'all',
    dateRange: 'all',
    search: '',
    decision: 'all',
  });
  const pageSize = 10;
  const deferredSearch = useDeferredValue(filters.search);
  const recruiterFromQuery = (searchParams.get('recruiter') ?? '').trim();
  /** Optional drill-down filter; empty means current user's interviews from the API. */
  const recruiterFilterId = recruiterFromQuery;
  const form = useForm<InterviewFormData>({
    resolver: zodResolver(InterviewSchema) as any,
    defaultValues: {
      submissionId: '',
      round: 'L1',
      date: '',
      time: '',
      mode: 'Online',
      status: 'Scheduled',
      location: '',
      meetingLink: '',
      candidateEmail: '',
      candidatePhone: '',
      sendEmail: false,
      sendWhatsApp: false,
      notes: '',
      reminderSent: false,
      interviewerName: '',
      interviewerEmail: '',
      feedback: '',
      rating: undefined,
      nextRoundDate: '',
      rescheduledFrom: '',
      cancellationReason: '',
    },
  });

  const selectedMode = useWatch({ control: form.control, name: 'mode' });
  const selectedSubmissionId = useWatch({ control: form.control, name: 'submissionId' });

  const selectedSubmission = useMemo(() => {
    if (!selectedSubmissionId) return null;
    return submissions.find((s) => s.id === selectedSubmissionId) ?? null;
  }, [submissions, selectedSubmissionId]);

  useEffect(() => {
    if (!selectedSubmission) return;
    // Auto-fill candidate contact details from the selected submission.
    const email = selectedSubmission.candidate?.email ?? '';
    const phone = selectedSubmission.candidate?.phone ?? '';
    form.setValue('candidateEmail', email, { shouldDirty: true });
    form.setValue('candidatePhone', phone, { shouldDirty: true });
    // Default to sending email if we have a valid email.
    if (email && email !== 'unknown@email.com') {
      form.setValue('sendEmail', true, { shouldDirty: true });
    }
  }, [selectedSubmission, form]);

  /**
   * Deep-link entry: when the page is opened with `?scheduleSubmissionId=<id>`
   * (e.g. from the "Schedule Interview" button on the Requirement Overview
   * page's Requirement History row), pre-select that submission and open the
   * Schedule New Interview modal automatically. We wait for `submissions` to
   * load so the `<Select>` actually contains the matching `<option>`, and we
   * only fire once per submissionId per mount to avoid reopening the modal
   * when the user closes it.
   */
  const scheduleSubmissionIdParam = (searchParams.get('scheduleSubmissionId') ?? '').trim();
  const [autoOpenedScheduleId, setAutoOpenedScheduleId] = useState<string | null>(null);
  useEffect(() => {
    if (!scheduleSubmissionIdParam) return;
    if (autoOpenedScheduleId === scheduleSubmissionIdParam) return;
    if (submissions.length === 0) return;
    const target = submissions.find((s) => s.id === scheduleSubmissionIdParam);
    if (!target) return;
    form.reset({
      submissionId: target.id,
      round: 'L1',
      date: '',
      time: '',
      mode: 'Online',
      status: 'Scheduled',
      location: '',
      meetingLink: '',
      candidateEmail: target.candidate?.email ?? '',
      candidatePhone: target.candidate?.phone ?? '',
      sendEmail: false,
      sendWhatsApp: false,
      notes: '',
      reminderSent: false,
      interviewerName: '',
      interviewerEmail: '',
      feedback: '',
      rating: undefined,
      nextRoundDate: '',
      rescheduledFrom: '',
      cancellationReason: '',
    });
    setEditingInterview(null);
    setIsModalOpen(true);
    setAutoOpenedScheduleId(scheduleSubmissionIdParam);
  }, [scheduleSubmissionIdParam, submissions, autoOpenedScheduleId, form]);

  function localDateTimeParts(iso: string): { date: string; time: string } {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return { date: '', time: '' };
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    return { date, time };
  }

  function recordToInterview(rec: InterviewRecord): Interview {
    const { date, time } = localDateTimeParts(rec.scheduledAt);
    const submissionStatus = submissions.find((s) => s.id === rec.submissionId)?.status ?? 'Unknown';

    return {
      submissionId: rec.submissionId,
      round: rec.round as any,
      date,
      time,
      mode: rec.mode as any,
      status: rec.status as any,
      location: rec.location ?? '',
      meetingLink: rec.meetingLink ?? '',
      candidateEmail: rec.candidate.email ?? '',
      candidatePhone: rec.candidate.phone ?? '',
      sendEmail: false,
      sendWhatsApp: false,
      notes: rec.notes ?? '',
      reminderSent: false,
      interviewerName: '',
      interviewerEmail: '',
      feedback: rec.feedback ?? '',
      rating: rec.rating ?? undefined,
      nextRoundDate: '',
      rescheduledFrom: '',
      cancellationReason: '',
      id: rec.id,
      createdAt: rec.createdAt ?? rec.scheduledAt,
      updatedAt: rec.updatedAt ?? rec.scheduledAt,
      candidateName: rec.candidate.name,
      clientName: rec.requirement.clientName,
      jobTitle: rec.requirement.roleTitle,
      submissionStatus,
      finalDecision: rec.finalDecision ? (rec.finalDecision === 'SELECTED' ? 'Selected' : rec.finalDecision === 'REJECTED' ? 'Rejected' : undefined) : undefined,
      alerts: [],
    };
  }

  const loadInterviews = useCallback(async () => {
    if (!currentUser?.id) {
      setInterviewsLoading(false);
      return;
    }
    setInterviewsLoading(true);
    try {
      const records = await getInterviews({
        ...(recruiterFilterId ? { recruiterId: recruiterFilterId } : {}),
        limit: 500,
      });
      setInterviews(records.map(recordToInterview));
    } catch (e) {
      console.error('Failed to load interviews', e);
      notify.error(e instanceof Error ? e.message : 'Failed to load interviews.');
    } finally {
      setInterviewsLoading(false);
    }
  }, [currentUser?.id, recruiterFilterId, submissions]);

  useEffect(() => {
    void loadInterviews();
  }, [loadInterviews]);

  useEffect(() => {
    void refresh({ scope: 'team', limit: 500 });
  }, [refresh]);

  function mapFormStatusToKind(status: string): InterviewNotificationKind {
    if (status === 'Rescheduled') return 'rescheduled';
    if (status === 'Cancelled') return 'cancelled';
    return 'scheduled';
  }

  /** Sends interview notification via backend (Microsoft Graph / SMTP). */
  const sendInterviewEmail = async (
    candidateEmail: string,
    candidateName: string,
    interviewDetails: InterviewFormData,
    extras: { jobTitle?: string; clientName?: string },
    kindOverride?: InterviewNotificationKind,
  ) => {
    if (!candidateEmail || candidateEmail === 'unknown@email.com') return;

    try {
      await sendInterviewNotificationEmail({
        candidateEmail,
        candidateName,
        jobTitle: extras.jobTitle,
        clientName: extras.clientName,
        round: interviewDetails.round,
        date: interviewDetails.date,
        time: interviewDetails.time,
        mode: interviewDetails.mode,
        status: interviewDetails.status,
        location: interviewDetails.location,
        meetingLink: interviewDetails.meetingLink,
        notes: interviewDetails.notes,
        kind: kindOverride ?? mapFormStatusToKind(interviewDetails.status),
      });
      notify.success('Interview notification email was sent to the candidate.');
    } catch (e) {
      console.error(e);
      notify.error(
        e instanceof Error ? e.message : 'Could not send email. Check mail configuration and try again.',
      );
    }
  };

  // Function to send interview schedule via WhatsApp
  const sendInterviewWhatsApp = (candidatePhone: string, candidateName: string, interviewDetails: any) => {
    if (!candidatePhone) return;
    
    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = candidatePhone.replace(/[\s\-\(\)]/g, '');
    const whatsappUrl = cleanPhone.startsWith('+') 
      ? `https://wa.me/${cleanPhone.substring(1)}`
      : `https://wa.me/91${cleanPhone}`; // Default to India if no country code
    
    const message = encodeURIComponent(
      `Dear ${candidateName},\n\n` +
        `Your interview has been scheduled:\n\n` +
        `📅 Date: ${interviewDetails.date}\n` +
        `⏰ Time: ${interviewDetails.time}\n` +
        `🔄 Round: ${interviewDetails.round}\n` +
        `📱 Mode: ${interviewDetails.mode}\n` +
        `${interviewDetails.meetingLink ? `🔗 Meeting: ${interviewDetails.meetingLink}\n` : ''}` +
        `${interviewDetails.location ? `📍 Location: ${interviewDetails.location}\n` : ''}` +
        `${interviewDetails.notes ? `📝 Notes: ${interviewDetails.notes}\n` : ''}\n\n` +
        `Please confirm your attendance.\n\n` +
        `Best regards,\n${currentUser?.name || 'Recruitment Team'}`
    );
    
    window.open(`${whatsappUrl}?text=${message}`, '_blank');
  };

  function toInterviewDateIso(date: string, time: string): string | null {
    const d = (date ?? '').trim();
    const t = (time ?? '').trim();
    if (!d || !t) return null;
    const dt = new Date(`${d}T${t}:00`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }

  const handleSubmit = async (data: InterviewFormData) => {
    const interviewIso = toInterviewDateIso(data.date, data.time);
    if (!interviewIso) {
      notify.warning('Please enter a valid date and time.');
      return;
    }
    const scheduledAt = interviewIso;
    const submission = submissions.find((s) => s.id === data.submissionId);
    if (!submission) {
      notify.warning('Please select a valid submission.');
      return;
    }
    if (currentUser?.id && submission.submittedBy.id !== currentUser.id) {
      notify.error('You can only schedule interviews for submissions you created.');
      return;
    }

    setIsSubmitting(true);
    const wasEditing = Boolean(editingInterview);
    try {
      if (editingInterview) {
        await updateInterview(editingInterview.id, {
          round: data.round,
          mode: data.mode,
          status: data.status,
          scheduledAt,
          location: data.location || null,
          meetingLink: data.meetingLink || null,
          notes: data.notes || null,
          feedback: data.feedback || undefined,
          rating: data.rating ?? null,
        } as any);

        if (submission.status !== 'Interview' && data.status !== 'Cancelled') {
          await patchSubmission(submission.id, { status: 'Interview' });
        }

        const candidateEmail = data.candidateEmail || editingInterview.candidateEmail;
        const candidatePhone = data.candidatePhone || editingInterview.candidatePhone;
        const candidateName = editingInterview.candidateName;

        if (data.sendEmail && candidateEmail) {
          await sendInterviewEmail(candidateEmail, candidateName, data, {
            jobTitle: editingInterview.jobTitle,
            clientName: editingInterview.clientName,
          });
        }
        if (data.sendWhatsApp && candidatePhone) {
          sendInterviewWhatsApp(candidatePhone, candidateName, data);
        }
      } else {
        await createInterview({
          submissionId: submission.id,
          round: data.round,
          mode: data.mode,
          status: data.status,
          scheduledAt,
          location: data.location || null,
          meetingLink: data.meetingLink || null,
          notes: data.notes || null,
        });

        if (submission.status !== 'Interview') {
          try {
            await patchSubmission(submission.id, { status: 'Interview' });
          } catch (patchErr) {
            console.warn('Interview saved but submission status was not updated', patchErr);
          }
        }

        const candidateName = submission.candidate.name || 'Candidate';
        if (data.sendEmail && (data.candidateEmail || submission.candidate.email)) {
          await sendInterviewEmail(
            data.candidateEmail || submission.candidate.email || '',
            candidateName,
            data,
            {
              jobTitle: submission.requirement.roleTitle,
              clientName: submission.requirement.clientName,
            },
          );
        }
        if (data.sendWhatsApp && (data.candidatePhone || submission.candidate.phone)) {
          sendInterviewWhatsApp(
            data.candidatePhone || submission.candidate.phone || '',
            candidateName,
            data,
          );
        }
      }

      await refresh({ scope: 'team', limit: 500 });
      setIsModalOpen(false);
      setEditingInterview(null);
      form.reset();
      await loadInterviews();
      window.dispatchEvent(new CustomEvent('app-metrics-refresh'));
      notify.success(wasEditing ? 'Interview updated successfully.' : 'Interview scheduled successfully.');
    } catch (e) {
      console.error('Failed to save interview', e);
      notify.error(e instanceof Error ? e.message : 'Failed to save interview. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (interview: Interview) => {
    setEditingInterview(interview);
    form.reset({
      submissionId: interview.submissionId,
      round: interview.round,
      date: interview.date,
      time: interview.time,
      mode: interview.mode,
      status: interview.status,
      location: interview.location || '',
      meetingLink: interview.meetingLink || '',
      candidateEmail: interview.candidateEmail || '',
      candidatePhone: interview.candidatePhone || '',
      sendEmail: interview.sendEmail || false,
      sendWhatsApp: interview.sendWhatsApp || false,
      notes: interview.notes || '',
      reminderSent: interview.reminderSent,
      interviewerName: interview.interviewerName || '',
      interviewerEmail: interview.interviewerEmail || '',
      feedback: interview.feedback || '',
      rating: interview.rating,
      nextRoundDate: interview.nextRoundDate || '',
      rescheduledFrom: interview.rescheduledFrom || '',
      cancellationReason: interview.cancellationReason || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = (interviewId: string) => {
    void (async () => {
      try {
        await deleteInterview(interviewId);
      } catch (e) {
        console.error(e);
      } finally {
        setInterviews((prev) => prev.filter((interview) => interview.id !== interviewId));
        void loadInterviews();
        window.dispatchEvent(new CustomEvent('app-metrics-refresh'));
      }
    })();
  };

  const sendReminder = async (interviewId: string) => {
    const interview = interviews.find(i => i.id === interviewId);
    if (!interview) return;

    if (!interview.candidateEmail || interview.candidateEmail === 'unknown@email.com') {
      notify.warning('Add a valid candidate email on this interview before sending a reminder.');
      return;
    }

    try {
      await sendInterviewNotificationEmail({
        candidateEmail: interview.candidateEmail,
        candidateName: interview.candidateName,
        jobTitle: interview.jobTitle !== 'Unknown' ? interview.jobTitle : undefined,
        clientName: interview.clientName !== 'Unknown' ? interview.clientName : undefined,
        round: interview.round,
        date: interview.date,
        time: interview.time,
        mode: interview.mode,
        status: interview.status,
        location: interview.location,
        meetingLink: interview.meetingLink,
        notes: interview.notes,
        kind: 'reminder',
      });
      notify.success(`Reminder email sent to ${interview.candidateName}.`);
    } catch (e) {
      console.error(e);
      notify.error(
        e instanceof Error ? e.message : 'Could not send reminder email.',
      );
      return;
    }

    setInterviews(prev => prev.map(i => 
      i.id === interviewId ? { ...i, reminderSent: true } : i
    ));
    createAlert('reminder', `Interview reminder emailed to ${interview.candidateName} (${interview.round})`, interviewId);
  };

  const markInterviewOutcome = async (
    interview: Interview,
    outcome: 'Selected' | 'Rejected',
    rejectionReasonText?: string,
  ): Promise<boolean> => {
    const baseSubmission = submissions.find((s) => s.id === interview.submissionId);
    if (!baseSubmission) {
      notify.error('Base submission not found for this interview.');
      return false;
    }

    const submittedBy = currentUser ?? baseSubmission.submittedBy;
    const trimmedReason = rejectionReasonText?.trim() ?? '';
    try {
      await addSubmission({
        candidate: baseSubmission.candidate,
        requirement: baseSubmission.requirement,
        submittedBy,
        status: outcome,
        submittedOn: new Date().toISOString(),
        selectedDate: baseSubmission.selectedDate ?? null,
        interviewDate: new Date().toISOString(),
        ...(outcome === 'Rejected' ? { rejectionReason: trimmedReason } : {}),
      });
      await refresh();

      try {
        await updateInterview(interview.id, {
          status: 'Completed',
          finalDecision: outcome === 'Selected' ? 'SELECTED' : 'REJECTED',
        } as any);
      } catch (e) {
        console.error('Failed to persist interview decision', e);
      }

      setInterviews((prev) =>
        prev.map((item) =>
          item.id === interview.id
            ? {
                ...item,
                status: 'Completed',
                finalDecision: outcome,
                feedback:
                  outcome === 'Selected'
                    ? 'Selected in interview'
                    : trimmedReason || 'Rejected in interview',
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      createAlert(
        'feedback',
        `${interview.candidateName} marked as ${outcome === 'Selected' ? 'Selected in interview' : 'Rejected in interview'}.`,
        interview.id,
      );
      notify.success(
        outcome === 'Selected'
          ? 'Candidate marked as Selected in Interview.'
          : 'Candidate marked as Rejected in Interview.',
      );
      await loadInterviews();
      return true;
    } catch (e) {
      console.error('Failed to mark interview outcome', e);
      notify.error('Failed to update interview outcome. Please try again.');
      return false;
    }
  };

  const markFinalDecisionForSubmission = async (
    submission: Submission,
    outcome: 'Selected' | 'Rejected',
    rejectionReasonText?: string,
  ): Promise<boolean> => {
    if (!currentUser) {
      notify.warning('You must be logged in to update final decision.');
      return false;
    }
    const trimmedReason = rejectionReasonText?.trim() ?? '';
    try {
      await addSubmission({
        candidate: submission.candidate,
        requirement: submission.requirement,
        submittedBy: submission.submittedBy,
        status: outcome,
        submittedOn: new Date().toISOString(),
        selectedDate: submission.selectedDate ?? new Date().toISOString(),
        interviewDate: new Date().toISOString(),
        ...(outcome === 'Rejected' ? { rejectionReason: trimmedReason } : {}),
      });
      await refresh();
      notify.success(
        outcome === 'Selected'
          ? 'Candidate marked as Selected in Interview.'
          : 'Candidate marked as Rejected in Interview.',
      );
      return true;
    } catch (e) {
      console.error('Failed to mark submission outcome', e);
      notify.error('Failed to update final decision. Please try again.');
      return false;
    }
  };

  const confirmReject = async () => {
    if (!rejectModal || rejectSubmitting) return;
    const reason = rejectReason.trim();
    if (!reason) {
      notify.warning('Please enter a reason for rejection. This field is required.');
      return;
    }
    setRejectSubmitting(true);
    try {
      const ok =
        rejectModal.kind === 'interview'
          ? await markInterviewOutcome(rejectModal.interview, 'Rejected', reason)
          : await markFinalDecisionForSubmission(rejectModal.submission, 'Rejected', reason);
      if (ok) {
        setRejectModal(null);
        setRejectReason('');
      }
    } finally {
      setRejectSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'Completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'Rescheduled': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getRoundColor = (round: string) => {
    switch (round) {
      case 'L1': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'L2': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200';
      case 'Final': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  // Advanced filtering logic
  const filteredInterviews = useMemo(() => {
    let filtered = interviews;

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(i => i.status === filters.status);
    }

    // Round filter
    if (filters.round !== 'all') {
      filtered = filtered.filter(i => i.round === filters.round);
    }

    // Outcome filter (selected / rejected)
    if (filters.decision !== 'all') {
      filtered = filtered.filter((i) => {
        const d = (i.finalDecision ?? '').toLowerCase();
        return d === filters.decision;
      });
    }

    // Mode filter
    if (filters.mode !== 'all') {
      filtered = filtered.filter(i => i.mode === filters.mode);
    }

    // Date range filter
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (filters.dateRange === 'today') {
      filtered = filtered.filter(i => new Date(i.date) >= today);
    } else if (filters.dateRange === 'week') {
      const weekFromNow = new Date(today);
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      filtered = filtered.filter(i => {
        const interviewDate = new Date(i.date);
        return interviewDate >= today && interviewDate <= weekFromNow;
      });
    } else if (filters.dateRange === 'month') {
      const monthFromNow = new Date(today);
      monthFromNow.setMonth(monthFromNow.getMonth() + 1);
      filtered = filtered.filter(i => {
        const interviewDate = new Date(i.date);
        return interviewDate >= today && interviewDate <= monthFromNow;
      });
    }

    // Search filter
    if (deferredSearch) {
      const searchLower = deferredSearch.toLowerCase();
      filtered = filtered.filter(i => 
        i.candidateName.toLowerCase().includes(searchLower) ||
        i.jobTitle.toLowerCase().includes(searchLower) ||
        i.clientName.toLowerCase().includes(searchLower) ||
        i.interviewerName?.toLowerCase().includes(searchLower) ||
        i.submissionId.toLowerCase().includes(searchLower)
      );
    }

    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [interviews, filters, deferredSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredInterviews.length / pageSize);
  const paginatedInterviews = filteredInterviews.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Alert management
  const unreadAlerts = useMemo(() => {
    const allAlerts = interviews.flatMap(i => i.alerts);
    return allAlerts.filter(alert => !alert.read);
  }, [interviews]);

  const markAlertAsRead = (alertId: string) => {
    setInterviews(prev => prev.map(interview => ({
      ...interview,
      alerts: interview.alerts.map(alert =>
        alert.id === alertId ? { ...alert, read: true } : alert
      )
    })));
  };

  const createAlert = (type: InterviewAlert['type'], message: string, interviewId: string) => {
    const newAlert: InterviewAlert = {
      id: `alert-${Date.now()}`,
      type,
      message,
      timestamp: new Date().toISOString(),
      read: false,
    };

    setInterviews(prev => prev.map(interview =>
      interview.id === interviewId
        ? { ...interview, alerts: [...interview.alerts, newAlert] }
        : interview
    ));
  };

  const columns: Column<Interview>[] = [
    {
      key: 'candidateName',
      header: 'Candidate',
      cell: (interview: Interview) => (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-gray-500" />
          <span className="font-medium">{interview.candidateName}</span>
        </div>
      ),
    },
    {
      key: 'jobTitle',
      header: 'Position',
      cell: (interview: Interview) => (
        <div>
          <div className="font-medium">{interview.jobTitle}</div>
          <div className="text-sm text-gray-500">{interview.clientName}</div>
        </div>
      ),
    },
    {
      key: 'round',
      header: 'Round',
      cell: (interview: Interview) => (
        <Badge className={getRoundColor(interview.round)}>
          {interview.round}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: 'Date & Time',
      cell: (interview: Interview) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <div>
            <div className="font-medium">{interview.date}</div>
            <div className="text-sm text-gray-500">{interview.time}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Mode',
      cell: (interview: Interview) => (
        <div className="flex items-center gap-2">
          {interview.mode === 'Online' && <Video className="h-4 w-4 text-blue-500" />}
          {interview.mode === 'Offline' && <MapPin className="h-4 w-4 text-green-500" />}
          {interview.mode === 'Hybrid' && <Phone className="h-4 w-4 text-purple-500" />}
          <span>{interview.mode}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (interview: Interview) => (
        <Badge className={getStatusColor(interview.status)}>
          {interview.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (interview: Interview) => (
        <div className="flex items-center gap-2">
          {!interview.reminderSent && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => sendReminder(interview.id)}
              className="text-blue-600 border-blue-600"
            >
              <Bell className="h-3 w-3 mr-1" />
              Remind
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleEdit(interview)}
          >
            <Edit className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void markInterviewOutcome(interview, 'Selected')}
            className="text-emerald-700 border-emerald-600"
          >
            Selected in Interview
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRejectModal({ kind: 'interview', interview });
              setRejectReason('');
            }}
            className="text-rose-700 border-rose-600"
          >
            Rejected in Interview
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDelete(interview.id)}
            className="text-red-600 border-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const interviewOnDay = (isoDate: string, dayStart: Date) => {
      if (!isoDate) return false;
      const d = new Date(isoDate);
      if (Number.isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      return d.getTime() === dayStart.getTime();
    };

    const interviewInRange = (isoDate: string, start: Date, end: Date) => {
      if (!isoDate) return false;
      const d = new Date(isoDate);
      if (Number.isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      return d >= start && d <= end;
    };

    return {
      total: interviews.length,
      scheduled: interviews.filter((i) => i.status === 'Scheduled').length,
      completed: interviews.filter((i) => i.status === 'Completed').length,
      today: interviews.filter((i) => interviewOnDay(i.date, today)).length,
      thisWeek: interviews.filter((i) => interviewInRange(i.date, today, weekEnd)).length,
      remindersSent: interviews.filter((i) => i.reminderSent).length,
      pendingAlerts: unreadAlerts.length,
    };
  }, [interviews, unreadAlerts]);

  const scheduleableSubmissions = useMemo(() => {
    const ownerId = recruiterFilterId || currentUser?.id;
    return submissions
      .filter(
        (s) =>
          s.status === 'Submitted to Client' ||
          s.status === 'Submitted' ||
          s.status === 'Interview' ||
          s.status === 'Selected',
      )
      .filter((s) => (ownerId ? s.submittedBy.id === ownerId : true))
      .sort((a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime());
  }, [submissions, recruiterFilterId, currentUser?.id]);

  const selectedForInterviewSubmissions = useMemo(() => {
    return [...submissions]
      .filter(
        (s) =>
          s.status === 'Interview' ||
          s.status === 'Selected' ||
          (s.status === 'Rejected' && !!s.interviewDate),
      )
      .filter((s) => (!recruiterFilterId ? true : s.submittedBy.id === recruiterFilterId))
      .sort((a, b) => new Date(b.submittedOn).getTime() - new Date(a.submittedOn).getTime());
  }, [submissions, recruiterFilterId]);

  const offerTrackIds = useMemo(
    () =>
      selectedForInterviewSubmissions
        .filter((s) => s.status === 'Selected' && !!s.interviewDate)
        .map((s) => s.id),
    [selectedForInterviewSubmissions],
  );

  const offerTrackKey = useMemo(() => [...offerTrackIds].sort().join(','), [offerTrackIds]);

  useEffect(() => {
    if (offerTrackIds.length === 0) {
      setOfferBySubmission({});
      setOffersLoading(false);
      return;
    }
    let cancelled = false;
    setOffersLoading(true);
    (async () => {
      try {
        const offers = await batchGetOfferLettersBySubmissions(offerTrackIds);
        if (!cancelled) setOfferBySubmission(offers);
      } catch (e) {
        console.error(e);
        if (!cancelled) setOfferBySubmission({});
      } finally {
        if (!cancelled) setOffersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerTrackKey]);

  const releasedOfferSubmissions = useMemo(() => {
    return selectedForInterviewSubmissions.filter((s) => {
      if (s.status !== 'Selected' || !s.interviewDate) return false;
      const o = offerBySubmission[s.id];
      return o && ['RELEASED', 'ACCEPTED', 'DECLINED'].includes(o.status);
    });
  }, [selectedForInterviewSubmissions, offerBySubmission]);

  async function submitOfferAcceptInterview() {
    const m = offerResponseModal;
    if (!m || m.kind !== 'accept' || !acceptJoiningDate.trim()) return;
    setOfferResponseSubmitting(true);
    try {
      const saved = await recordOfferLetterResponse(m.submission.id, {
        decision: 'accept',
        acceptedJoiningDate: `${acceptJoiningDate.trim()}T12:00:00.000Z`,
      });
      setOfferBySubmission((prev) => ({ ...prev, [m.submission.id]: saved }));
      setOfferResponseModal(null);
      setAcceptJoiningDate('');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to record acceptance');
    } finally {
      setOfferResponseSubmitting(false);
    }
  }

  async function submitOfferDeclineInterview() {
    const m = offerResponseModal;
    if (!m || m.kind !== 'decline' || !declineOfferReason.trim()) return;
    setOfferResponseSubmitting(true);
    try {
      const saved = await recordOfferLetterResponse(m.submission.id, {
        decision: 'decline',
        declineReason: declineOfferReason.trim(),
      });
      setOfferBySubmission((prev) => ({ ...prev, [m.submission.id]: saved }));
      setOfferResponseModal(null);
      setDeclineOfferReason('');
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to record decline');
    } finally {
      setOfferResponseSubmitting(false);
    }
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const cardFocus = searchParams.get('card');
  useEffect(() => {
    if (!cardFocus) return;
    const c = cardFocus.trim().toLowerCase();
    if (c === 'total') {
      setFilters({
        status: 'all',
        round: 'all',
        mode: 'all',
        dateRange: 'all',
        search: '',
        decision: 'all',
      });
    } else if (c === 'scheduled') {
      setFilters((prev) => ({ ...prev, status: 'Scheduled' }));
    } else if (c === 'completed') {
      setFilters((prev) => ({ ...prev, status: 'Completed' }));
    } else if (c === 'today') {
      setFilters((prev) => ({ ...prev, dateRange: 'today', status: 'all' }));
    } else if (c === 'week') {
      setFilters((prev) => ({ ...prev, dateRange: 'week', status: 'all' }));
    } else if (c === 'alerts') {
      setShowAlerts(true);
      window.setTimeout(() => {
        document
          .getElementById('interview-alerts-panel')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
      return;
    }
    requestAnimationFrame(() => {
      document
        .getElementById('interview-schedule-anchor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [cardFocus]);

  const roundFromQuery = (searchParams.get('round') ?? '').trim();
  const statusFromQuery = (searchParams.get('status') ?? '').trim();
  const decisionFromQuery = (searchParams.get('decision') ?? '').trim().toLowerCase();

  useEffect(() => {
    if (!roundFromQuery && !statusFromQuery && !decisionFromQuery) return;

    const validRounds = new Set(['L1', 'L2', 'Final']);
    const validStatuses = new Set(['Scheduled', 'Completed', 'Cancelled', 'Rescheduled']);
    const validDecisions = new Set(['selected', 'rejected']);

    setFilters((prev) => ({
      ...prev,
      ...(validRounds.has(roundFromQuery) ? { round: roundFromQuery } : {}),
      ...(validStatuses.has(statusFromQuery) ? { status: statusFromQuery } : {}),
      ...(validDecisions.has(decisionFromQuery)
        ? { decision: decisionFromQuery as 'selected' | 'rejected' }
        : {}),
    }));

    requestAnimationFrame(() => {
      document
        .getElementById('interview-schedule-anchor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [roundFromQuery, statusFromQuery, decisionFromQuery]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interview Tracking"
        subtitle="Manage and track all candidate interviews"
        right={
          <div className="flex items-center gap-3">
            {/* Alerts Button */}
            <Button
              variant="outline"
              onClick={() => setShowAlerts(!showAlerts)}
              className="relative"
            >
              <Bell className="h-4 w-4" />
              {unreadAlerts.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {unreadAlerts.length}
                </span>
              )}
            </Button>
            
            {/* Refresh Button */}
            <Button
              variant="outline"
              onClick={() => {
                void refresh({ scope: 'team', limit: 500 });
                void loadInterviews();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            
            {/* Schedule Interview Button */}
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Interview
            </Button>
          </div>
        }
      />

      {/* Alerts Panel */}
      {showAlerts && (
        <div
          id="interview-alerts-panel"
          className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alerts & Notifications
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAlerts(false)}
            >
              ×
            </Button>
          </div>
          
          {unreadAlerts.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No new alerts</p>
          ) : (
            <div className="space-y-2">
              {unreadAlerts.map(alert => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(alert.timestamp)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markAlertAsRead(alert.id)}
                  >
                    Mark as read
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-3 mb-4">
          <Filter className="h-4 w-4 text-gray-500" />
          <h3 className="font-semibold">Filters</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          {/* Search */}
          <Field label="Search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <TextInput
                placeholder="Search candidates..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-10"
              />
            </div>
          </Field>
          
          {/* Status Filter */}
          <Field label="Status">
            <Select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="all">All Status</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Rescheduled">Rescheduled</option>
            </Select>
          </Field>
          
          {/* Round Filter */}
          <Field label="Round">
            <Select
              value={filters.round}
              onChange={(e) => setFilters(prev => ({ ...prev, round: e.target.value }))}
            >
              <option value="all">All Rounds</option>
              <option value="L1">L1</option>
              <option value="L2">L2</option>
              <option value="Final">Final</option>
            </Select>
          </Field>
          
          {/* Mode Filter */}
          <Field label="Mode">
            <Select
              value={filters.mode}
              onChange={(e) => setFilters(prev => ({ ...prev, mode: e.target.value }))}
            >
              <option value="all">All Modes</option>
              <option value="Online">Online</option>
              <option value="Offline">Offline</option>
              <option value="Hybrid">Hybrid</option>
            </Select>
          </Field>
          
          {/* Date Range Filter */}
          <Field label="Date Range">
            <Select
              value={filters.dateRange}
              onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as any }))}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </Select>
          </Field>
          
          {/* Clear Filters */}
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => setFilters({
                status: 'all',
                round: 'all',
                mode: 'all',
                dateRange: 'all',
                search: '',
              })}
              className="w-full"
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Interviews"
          value={stats.total}
          icon={<Calendar className="h-5 w-5" />}
          color="blue"
          href="/interviews?card=total"
        />
        <StatCard
          label="Scheduled"
          value={stats.scheduled}
          icon={<Clock className="h-5 w-5" />}
          color="amber"
          href="/interviews?card=scheduled"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="emerald"
          href="/interviews?card=completed"
        />
        <StatCard
          label="Today"
          value={stats.today}
          icon={<AlertCircle className="h-5 w-5" />}
          color="purple"
          href="/interviews?card=today"
        />
        <StatCard
          label="This Week"
          value={stats.thisWeek}
          icon={<TrendingUp className="h-5 w-5" />}
          color="indigo"
          href="/interviews?card=week"
        />
        <StatCard
          label="Pending Alerts"
          value={stats.pendingAlerts}
          icon={<Bell className="h-5 w-5" />}
          color="rose"
          href="/interviews?card=alerts"
        />
      </div>

      {/* Enhanced Interviews Table with Pagination */}
      <div
        id="interview-schedule-anchor"
        className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 scroll-mt-4"
      >
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Interview Schedule</h3>
            <div className="text-sm text-gray-500">
              Showing {paginatedInterviews.length} of {filteredInterviews.length} interviews
            </div>
          </div>
        </div>
        
        {interviewsLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-zinc-400">
            Loading interviews…
          </div>
        ) : (
        <DataTable
          columns={columns}
          rows={paginatedInterviews}
          getRowKey={(interview) => interview.id}
          emptyText={
            interviews.length === 0
              ? 'No interviews scheduled yet. Click "Schedule Interview" to add one for your submissions.'
              : 'No interviews match the current filters.'
          }
          mobileCard={(interview: Interview) => (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{interview.candidateName}</div>
                  <div className="text-sm text-gray-500">{interview.jobTitle}</div>
                </div>
                <Badge className={getStatusColor(interview.status)}>
                  {interview.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium">Round:</span> {interview.round}
                </div>
                <div>
                  <span className="font-medium">Date:</span> {interview.date}
                </div>
                <div>
                  <span className="font-medium">Time:</span> {interview.time}
                </div>
                <div>
                  <span className="font-medium">Mode:</span> {interview.mode}
                </div>
              </div>
            </div>
          )}
        />
        )}
        
        {/* Pagination */}
        {!interviewsLoading && totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 py-1 text-sm">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Final Decision (Selected/Rejected in interview) */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Final Decision</h3>
            <div className="text-sm text-gray-500">
              {selectedForInterviewSubmissions.length} candidate(s)
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
            Candidates selected for interview can be marked as <b>Selected in interview</b> or <b>Rejected in interview</b>.
          </p>
        </div>

        <DataTable
          columns={[
            {
              key: 'candidate',
              header: 'Candidate',
              cell: (s: Submission) => (
                <div className="font-medium text-gray-900 dark:text-zinc-50">
                  {s.candidate.name}
                </div>
              ),
            },
            {
              key: 'reqId',
              header: 'Requirement ID',
              cell: (s: Submission) => (
                <span className="font-mono text-xs text-gray-900 dark:text-zinc-50">
                  {s.requirement.requirementId ?? s.requirement.id}
                </span>
              ),
            },
            {
              key: 'req',
              header: 'Requirement',
              cell: (s: Submission) => (
                <div>
                  <div className="font-medium text-gray-900 dark:text-zinc-50">
                    {s.requirement.roleTitle}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-zinc-400">
                    {s.requirement.clientName}
                  </div>
                </div>
              ),
            },
            {
              key: 'decision',
              header: 'Decision',
              cell: (s: Submission) => {
                if (s.status === 'Rejected') {
                  return (
                    <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                      Rejected in Interview
                    </Badge>
                  );
                }

                if (s.status === 'Interview') {
                  return (
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      Interview Scheduled
                    </Badge>
                  );
                }

                if (s.status === 'Selected' && s.interviewDate) {
                  return (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Selected in Interview
                    </Badge>
                  );
                }

                return (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    Selected for Interview
                  </Badge>
                );
              },
            },
            {
              key: 'rejectionReason',
              header: 'Rejection reason',
              cell: (s: Submission) =>
                s.status === 'Rejected' && s.rejectionReason?.trim() ? (
                  <span className="text-sm text-gray-700 dark:text-zinc-300 max-w-xs block">
                    {s.rejectionReason}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-zinc-500">—</span>
                ),
            },
            {
              key: 'offerLetter',
              header: 'Offer letter',
              cell: (s: Submission) => {
                const canOffer = s.status === 'Selected' && !!s.interviewDate;
                if (!canOffer) {
                  return <span className="text-xs text-gray-400 dark:text-zinc-500">—</span>;
                }
                return (
                  <Link
                    href={`/submissions/${s.id}#offer-letter`}
                    className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Open
                  </Link>
                );
              },
            },
            {
              key: 'actions',
              header: 'Update',
              cell: (s: Submission) => {
                const isFinal =
                  s.status === 'Rejected' ||
                  (s.status === 'Selected' && !!s.interviewDate) ||
                  s.status === 'Interview';
                if (isFinal) {
                  return (
                    <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
                      {s.status === 'Interview' ? 'Use schedule table' : 'Final'}
                    </span>
                  );
                }

                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void markFinalDecisionForSubmission(s, 'Selected')}
                      className="text-emerald-700 border-emerald-600"
                    >
                      Select
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectModal({ kind: 'submission', submission: s });
                        setRejectReason('');
                      }}
                      className="text-rose-700 border-rose-600"
                    >
                      Reject
                    </Button>
                  </div>
                );
              },
            },
          ]}
          rows={selectedForInterviewSubmissions}
          getRowKey={(s) => s.id}
          emptyText="No candidates are selected for interview yet."
          mobileCard={(s: Submission) => {
            const decisionBadge =
              s.status === 'Rejected' ? (
                <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                  Rejected in Interview
                </Badge>
              ) : s.status === 'Interview' ? (
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  Interview Scheduled
                </Badge>
              ) : s.status === 'Selected' && s.interviewDate ? (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                  Selected in Interview
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Selected for Interview
                </Badge>
              );

            const showActions = s.status === 'Selected' && !s.interviewDate;

            return (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-zinc-50">
                      {s.candidate.name}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-zinc-400">
                      {s.requirement.roleTitle} • {s.requirement.clientName}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                      Req: {s.requirement.requirementId ?? s.requirement.id}
                    </div>
                  </div>
                  {decisionBadge}
                </div>

                {s.status === 'Rejected' && s.rejectionReason?.trim() ? (
                  <p className="text-sm text-gray-600 dark:text-zinc-400 border-t border-gray-100 dark:border-slate-700 pt-2">
                    {s.rejectionReason}
                  </p>
                ) : null}

                {s.status === 'Selected' && s.interviewDate ? (
                  <Link
                    href={`/submissions/${s.id}#offer-letter`}
                    className="inline-flex text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Offer letter →
                  </Link>
                ) : null}

                {showActions ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void markFinalDecisionForSubmission(s, 'Selected')}
                      className="text-emerald-700 border-emerald-600"
                    >
                      Select
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectModal({ kind: 'submission', submission: s });
                        setRejectReason('');
                      }}
                      className="text-rose-700 border-rose-600"
                    >
                      Reject
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
                    Final decision recorded
                  </div>
                )}
              </div>
            );
          }}
        />
      </div>

      {/* Released offer letter — accept / decline */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Released offer letter</h3>
            <div className="text-sm text-gray-500 dark:text-zinc-400">
              {offersLoading ? 'Loading…' : `${releasedOfferSubmissions.length} candidate(s)`}
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
            For offers already <b>released</b> from the submission page, record if the candidate{' '}
            <b>accepted</b> (with agreed <b>joining date</b> for internal records) or <b>declined</b> (with a
            reason).
          </p>
        </div>

        {offersLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading offer data…</div>
        ) : releasedOfferSubmissions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-zinc-400">
            No released offer letters yet. When you release an offer on a submission, it will appear here for
            response tracking.
          </div>
        ) : (
          <DataTable<Submission>
            columns={[
              {
                key: 'candidate',
                header: 'Candidate',
                cell: (s: Submission) => (
                  <div className="font-medium text-gray-900 dark:text-zinc-50">{s.candidate.name}</div>
                ),
              },
              {
                key: 'reqId',
                header: 'Requirement ID',
                cell: (s: Submission) => (
                  <span className="font-mono text-xs text-gray-900 dark:text-zinc-50">
                    {s.requirement.requirementId ?? s.requirement.id}
                  </span>
                ),
              },
              {
                key: 'released',
                header: 'Released',
                cell: (s: Submission) => {
                  const o = offerBySubmission[s.id];
                  const t = o?.releasedAt ? formatDateTime(o.releasedAt) : '—';
                  return <span className="text-sm text-gray-700 dark:text-zinc-300">{t}</span>;
                },
              },
              {
                key: 'response',
                header: 'Response',
                cell: (s: Submission) => {
                  const o = offerBySubmission[s.id];
                  const st = o?.status;
                  if (st === 'RELEASED') {
                    return (
                      <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                        Pending
                      </Badge>
                    );
                  }
                  if (st === 'ACCEPTED') {
                    return (
                      <Badge className="bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-200">
                        Accepted
                      </Badge>
                    );
                  }
                  if (st === 'DECLINED') {
                    return (
                      <Badge className="bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200">
                        Declined
                      </Badge>
                    );
                  }
                  return <span className="text-xs text-gray-400">—</span>;
                },
              },
              {
                key: 'detail',
                header: 'Joining / reason',
                cell: (s: Submission) => {
                  const o = offerBySubmission[s.id];
                  if (o?.status === 'ACCEPTED' && o.acceptedJoiningDate) {
                    return (
                      <span className="text-sm text-gray-700 dark:text-zinc-300">
                        Joins:{' '}
                        {new Date(o.acceptedJoiningDate).toLocaleDateString(undefined, {
                          dateStyle: 'medium',
                        })}
                      </span>
                    );
                  }
                  if (o?.status === 'DECLINED' && o.declineReason?.trim()) {
                    return (
                      <span className="text-sm text-gray-700 dark:text-zinc-300 max-w-xs line-clamp-2 block">
                        {o.declineReason}
                      </span>
                    );
                  }
                  return <span className="text-xs text-gray-400 dark:text-zinc-500">—</span>;
                },
              },
              {
                key: 'submission',
                header: 'Submission',
                cell: (s: Submission) => (
                  <Link
                    href={`/submissions/${s.id}#offer-letter`}
                    className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Open
                  </Link>
                ),
              },
              {
                key: 'actions',
                header: 'Update',
                cell: (s: Submission) => {
                  const o = offerBySubmission[s.id];
                  if (o?.status !== 'RELEASED') {
                    return (
                      <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">Recorded</span>
                    );
                  }
                  return (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAcceptJoiningDate(o.joiningDate ? o.joiningDate.slice(0, 10) : '');
                          setOfferResponseModal({ kind: 'accept', submission: s });
                        }}
                        className="text-teal-800 border-teal-600 dark:text-teal-300"
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDeclineOfferReason('');
                          setOfferResponseModal({ kind: 'decline', submission: s });
                        }}
                        className="text-rose-800 border-rose-600 dark:text-rose-300"
                      >
                        Decline
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            rows={releasedOfferSubmissions}
            getRowKey={(s) => s.id}
            emptyText=""
            mobileCard={(s: Submission) => {
              const o = offerBySubmission[s.id];
              return (
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="font-semibold text-gray-900 dark:text-zinc-50">{s.candidate.name}</div>
                  <div className="text-xs text-gray-500 dark:text-zinc-400">
                    Req: {s.requirement.requirementId ?? s.requirement.id}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-zinc-400">
                    Released:{' '}
                    {o?.releasedAt ? formatDateTime(o.releasedAt) : '—'}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href={`/submissions/${s.id}#offer-letter`}
                      className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Open submission
                    </Link>
                    {o?.status === 'RELEASED' ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAcceptJoiningDate(o.joiningDate ? o.joiningDate.slice(0, 10) : '');
                            setOfferResponseModal({ kind: 'accept', submission: s });
                          }}
                          className="text-teal-800 border-teal-600"
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDeclineOfferReason('');
                            setOfferResponseModal({ kind: 'decline', submission: s });
                          }}
                          className="text-rose-800 border-rose-600"
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">Response recorded</span>
                    )}
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      <Modal
        isOpen={rejectModal !== null}
        onClose={() => {
          if (rejectSubmitting) return;
          setRejectModal(null);
          setRejectReason('');
        }}
        title={
          rejectModal
            ? rejectModal.kind === 'interview'
              ? `Reject — ${rejectModal.interview.candidateName}`
              : `Reject — ${rejectModal.submission.candidate.name}`
            : 'Reject candidate'
        }
        className="max-w-lg"
      >
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">
          A rejection reason is <span className="font-medium text-gray-800 dark:text-zinc-200">required</span>. It is stored on the submission and shown in Final Decision.
        </p>
        <Textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={4}
          maxLength={2000}
          required
          aria-required
          placeholder="e.g. Client chose another profile; technical gap on required stack"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={rejectSubmitting}
            onClick={() => {
              setRejectModal(null);
              setRejectReason('');
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={rejectSubmitting || !rejectReason.trim()}
            onClick={() => void confirmReject()}
          >
            {rejectSubmitting ? 'Saving…' : 'Confirm rejection'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={offerResponseModal?.kind === 'accept'}
        onClose={() => {
          if (offerResponseSubmitting) return;
          setOfferResponseModal(null);
          setAcceptJoiningDate('');
        }}
        title={
          offerResponseModal?.kind === 'accept'
            ? `Accept offer — ${offerResponseModal.submission.candidate.name}`
            : 'Accept offer'
        }
        className="max-w-md"
      >
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">
          Enter the agreed joining date stored internally when the candidate accepts.
        </p>
        <Field label="Joining date">
          <TextInput
            type="date"
            value={acceptJoiningDate}
            onChange={(e) => setAcceptJoiningDate(e.target.value)}
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={offerResponseSubmitting}
            onClick={() => {
              setOfferResponseModal(null);
              setAcceptJoiningDate('');
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={offerResponseSubmitting || !acceptJoiningDate.trim()}
            onClick={() => void submitOfferAcceptInterview()}
          >
            {offerResponseSubmitting ? 'Saving…' : 'Save acceptance'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={offerResponseModal?.kind === 'decline'}
        onClose={() => {
          if (offerResponseSubmitting) return;
          setOfferResponseModal(null);
          setDeclineOfferReason('');
        }}
        title={
          offerResponseModal?.kind === 'decline'
            ? `Decline offer — ${offerResponseModal.submission.candidate.name}`
            : 'Decline offer'
        }
        className="max-w-lg"
      >
        <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">
          A reason is <span className="font-medium text-gray-800 dark:text-zinc-200">required</span>. It is
          stored on the offer record.
        </p>
        <Textarea
          value={declineOfferReason}
          onChange={(e) => setDeclineOfferReason(e.target.value)}
          rows={4}
          maxLength={8000}
          placeholder="e.g. Accepted another offer; compensation mismatch"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={offerResponseSubmitting}
            onClick={() => {
              setOfferResponseModal(null);
              setDeclineOfferReason('');
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={offerResponseSubmitting || !declineOfferReason.trim()}
            onClick={() => void submitOfferDeclineInterview()}
          >
            {offerResponseSubmitting ? 'Saving…' : 'Save decline'}
          </Button>
        </div>
      </Modal>

      {/* Interview Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingInterview(null);
          form.reset();
        }}
        title={editingInterview ? 'Edit Interview' : 'Schedule New Interview'}
      >
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Submission" error={form.formState.errors.submissionId?.message}>
              <Select {...form.register('submissionId')} disabled={scheduleableSubmissions.length === 0}>
                <option value="">
                  {scheduleableSubmissions.length === 0
                    ? 'No submissions available — submit a candidate first'
                    : 'Select submission'}
                </option>
                {scheduleableSubmissions.map((submission) => (
                  <option key={submission.id} value={submission.id}>
                    {submission.candidate.name} - {submission.requirement.roleTitle} ({submission.status})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Interview Round" error={form.formState.errors.round?.message}>
              <Select {...form.register('round')}>
                <option value="L1">L1 - Technical Round</option>
                <option value="L2">L2 - Managerial Round</option>
                <option value="Final">Final - HR Round</option>
              </Select>
            </Field>
            <Field label="Date" error={form.formState.errors.date?.message}>
              <TextInput
                type="date"
                {...form.register('date')}
                min={new Date().toISOString().split('T')[0]}
              />
            </Field>
            <Field label="Time" error={form.formState.errors.time?.message}>
              <TextInput type="time" {...form.register('time')} />
            </Field>
            <Field label="Interview Mode" error={form.formState.errors.mode?.message}>
              <Select {...form.register('mode')}>
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
                <option value="Hybrid">Hybrid</option>
              </Select>
            </Field>
            <Field label="Status" error={form.formState.errors.status?.message}>
              <Select {...form.register('status')}>
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Rescheduled">Rescheduled</option>
              </Select>
            </Field>
          </div>

          {selectedMode === 'Online' && (
            <Field label="Meeting Link (Optional)" error={form.formState.errors.meetingLink?.message}>
              <TextInput
                {...form.register('meetingLink')}
                placeholder="https://meet.google.com/xxx-xxx-xxx"
              />
            </Field>
          )}

          {selectedMode === 'Offline' && (
            <Field label="Location" error={form.formState.errors.location?.message}>
              <TextInput
                {...form.register('location')}
                placeholder="Client office address"
              />
            </Field>
          )}

          {selectedMode === 'Hybrid' && (
            <Field label="Meeting Link (Optional)" error={form.formState.errors.meetingLink?.message}>
              <TextInput
                {...form.register('meetingLink')}
                placeholder="https://meet.google.com/xxx-xxx-xxx"
              />
            </Field>
          )}

          {/* Candidate Contact Information */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Candidate Email" error={form.formState.errors.candidateEmail?.message}>
              <TextInput
                type="email"
                {...form.register('candidateEmail')}
                placeholder="candidate@email.com"
              />
            </Field>
            <Field label="Candidate Phone" error={form.formState.errors.candidatePhone?.message}>
              <TextInput
                type="tel"
                {...form.register('candidatePhone')}
                placeholder="+91 98765 43210"
              />
            </Field>
          </div>

          {/* Communication Options */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Send Interview Schedule
            </h4>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...form.register('sendEmail')}
                  className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Send via Email
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...form.register('sendWhatsApp')}
                  className="mr-2 h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Send via WhatsApp
                </span>
              </label>
            </div>
          </div>

          <Field label="Notes" error={form.formState.errors.notes?.message}>
            <Textarea
              {...form.register('notes')}
              placeholder="Additional interview details, requirements, etc."
              rows={3}
            />
          </Field>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsModalOpen(false);
                setEditingInterview(null);
                form.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || (!editingInterview && scheduleableSubmissions.length === 0)}
            >
              {isSubmitting
                ? 'Saving…'
                : editingInterview
                  ? 'Update Interview'
                  : 'Schedule Interview'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
