'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import {
  ClipboardList,
  Send,
  MessageSquare,
  CheckCircle2,
  Search,
  User,
  Mail,
  Briefcase,
  Phone,
  Camera,
  Save,
  Edit3,
  ImagePlus,
  Trash2,
} from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/requirements/StatCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/requirements/StatusBadge';
import {
  ActivityTimeline,
  type TimelineItem,
} from '@/components/ui/ActivityTimeline';

import { useAuth } from '@/lib/contexts/AuthContext';
import { useRequirementsStore } from '@/lib/domain/requirements/store';
import { getRequirements } from '@/lib/api/requirements';
import {
  getDashboardStatus,
  isRecruiterMyWorkAssignedRequirement,
  recruiterOwnsRequirement,
  requirementDetailHref,
} from '@/lib/domain/requirements/logic';
import type { Requirement } from '@/lib/domain/requirements/types';
import { useSubmissionsStore } from '@/lib/domain/submissions/store';
import type { Submission, SubmissionStatus } from '@/lib/domain/submissions/types';
import { isAnySubmittedStatus } from '@/lib/domain/submissions/status';
import { profilePhotoStorageKey, profileStorageKey } from '@/lib/auth/session';
import { useCardMetrics } from '@/lib/hooks/useCardMetrics';

function mapRoleToDbRole(_role: string): 'RECRUITER' | undefined {
  return 'RECRUITER';
}

function mapDbRoleToUiRole(role: string | undefined | null): string {
  const r = String(role ?? '').trim().toUpperCase();
  if (r === 'LEAD') return 'Lead';
  if (r === 'ADMIN') return 'Admin';
  if (r === 'RECRUITER') return 'Recruiter';
  return 'Recruiter';
}

type EditableProfile = {
  name: string;
  email: string;
  role: string;
  phone: string;
  submittingTo: string;
};

type EditForm = EditableProfile & {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const passwordChangeSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    const anyFilled =
      data.currentPassword.trim() ||
      data.newPassword.trim() ||
      data.confirmPassword.trim();
    if (!anyFilled) return;
    if (!data.currentPassword.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current password is required when changing password',
        path: ['currentPassword'],
      });
    }
    if (!data.newPassword.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New password is required when changing password',
        path: ['newPassword'],
      });
    }
    if (!data.confirmPassword.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confirm password is required when changing password',
        path: ['confirmPassword'],
      });
    }
  })
  .superRefine((data, ctx) => {
    if (data.newPassword.length > 0 && data.newPassword.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New password must be at least 8 characters',
        path: ['newPassword'],
      });
    }
  })
  .superRefine((data, ctx) => {
    if (data.newPassword && data.confirmPassword && data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confirm password must match new password',
        path: ['confirmPassword'],
      });
    }
  });

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

type WorkFilter = 'Assigned' | 'Submitted' | 'SelectedForInterview';

type WorkRow = {
  key: string;
  requirementInternalId?: string;
  requirementId: string;
  requirementName: string;
  client: string;
  type: 'Requirement' | 'Candidate';
  candidateName?: string;
  candidateEmail?: string;
  statusLabel: string;
  submittedOn?: string;
};

const MY_WORK_ROWS_PER_PAGE = 5;

const WORK_FILTER_OPTIONS: Array<{ value: WorkFilter; label: string }> = [
  { value: 'Assigned', label: 'Assigned' },
  { value: 'Submitted', label: 'Submitted' },
  { value: 'SelectedForInterview', label: 'Selected for Interview' },
];

function requirementMatchesWorkFilter(
  r: Requirement,
  filter: WorkFilter,
  recruiterSubmittedRequirementIds: ReadonlySet<string>,
): boolean {
  if (filter !== 'Assigned') return false;
  return isRecruiterMyWorkAssignedRequirement(r, recruiterSubmittedRequirementIds);
}

function submissionMatchesWorkFilter(s: Submission, filter: WorkFilter): boolean {
  if (filter === 'Submitted') return isAnySubmittedStatus(s.status);
  if (filter === 'SelectedForInterview') {
    return s.status === 'Selected' && !s.interviewDate;
  }
  return false;
}

function isRequirementWorkFilter(filter: WorkFilter): boolean {
  return filter === 'Assigned';
}

export function MyWorkPage() {
  const { currentUser, refresh: refreshAuth } = useAuth();
  const { requirements } = useRequirementsStore();
  const { submissions } = useSubmissionsStore();

  const currentUserId = currentUser?.id ?? '';
  const [workSearchClient, setWorkSearchClient] = useState('');
  const [workSearchRequirementId, setWorkSearchRequirementId] = useState('');
  const [workFilter, setWorkFilter] = useState<WorkFilter>('Assigned');
  const [workTablePage, setWorkTablePage] = useState(1);
  const [recentSubmissionStatusFilter, setRecentSubmissionStatusFilter] = useState<
    'All' | SubmissionStatus
  >('All');
  const [explicitlyAssignedRequirementIds, setExplicitlyAssignedRequirementIds] = useState<Set<string>>(new Set());
  const [myAssignedRequirements, setMyAssignedRequirements] = useState<Requirement[]>([]);
  const [latestMyAssignmentByRequirementId, setLatestMyAssignmentByRequirementId] = useState<Record<string, string>>({});

  const { data: cardMetrics } = useCardMetrics(['myWork'], {
    recruiterId: currentUserId,
    enabled: !!currentUserId,
  });

  const mySubmissions = useMemo(() => {
    return submissions
      .filter((s) => s && s.submittedBy && s.submittedBy.id === currentUserId)
      .sort(
        (a, b) =>
          new Date(b.submittedOn).getTime() -
          new Date(a.submittedOn).getTime(),
      );
  }, [submissions, currentUserId]);

  const filteredMySubmissions = useMemo(() => {
    if (recentSubmissionStatusFilter === 'All') return mySubmissions;
    return mySubmissions.filter((s) => s.status === recentSubmissionStatusFilter);
  }, [mySubmissions, recentSubmissionStatusFilter]);

  const metrics = useMemo(
    () => ({
      totalSubmissions: cardMetrics?.myWork?.totalSubmissions ?? 0,
      interviews: cardMetrics?.myWork?.interviewsHandled ?? 0,
      selected: cardMetrics?.myWork?.selectionsAchieved ?? 0,
      assignedRequirements: cardMetrics?.myWork?.assignedRequirements ?? 0,
    }),
    [cardMetrics],
  );

  const mySubmittedRequirementIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of mySubmissions) {
      const reqId = s.requirement?.id;
      if (reqId) ids.add(reqId);
    }
    return ids;
  }, [mySubmissions]);

  const requirementsForWork = useMemo(() => {
    const byId = new Map<string, Requirement>();
    for (const r of requirements) {
      if (r && !r.isDeleted) byId.set(r.id, r);
    }
    for (const r of myAssignedRequirements) {
      if (r && !r.isDeleted) byId.set(r.id, r);
    }
    return Array.from(byId.values()).filter((r) => explicitlyAssignedRequirementIds.has(r.id));
  }, [requirements, myAssignedRequirements, explicitlyAssignedRequirementIds]);

  useEffect(() => {
    let cancelled = false;
    const myId = (currentUserId || '').trim();

    if (!myId) {
      setExplicitlyAssignedRequirementIds(new Set());
      setMyAssignedRequirements([]);
      setLatestMyAssignmentByRequirementId({});
      return;
    }

    (async () => {
      try {
        const mine = await getRequirements({ recruiterId: myId, limit: 500 });
        if (cancelled) return;
        const found = new Set(mine.map((r) => r.id));
        const latestAssignedOnByReq: Record<string, string> = {};
        for (const r of mine) {
          const ts = r.updatedAt || r.createdAt;
          if (ts) latestAssignedOnByReq[r.id] = ts;
        }
        setExplicitlyAssignedRequirementIds(found);
        setMyAssignedRequirements(mine);
        setLatestMyAssignmentByRequirementId(latestAssignedOnByReq);
      } catch (e) {
        console.error('Failed to load assigned requirements for My Work', e);
        if (!cancelled) {
          const fallback = requirements.filter(
            (r) => r && !r.isDeleted && recruiterOwnsRequirement(r, myId),
          );
          setExplicitlyAssignedRequirementIds(new Set(fallback.map((r) => r.id)));
          setMyAssignedRequirements(fallback);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requirements, currentUserId]);

  useEffect(() => {
    const onAssignmentChanged = () => {
      const myId = (currentUserId || '').trim();
      if (!myId) return;
      void getRequirements({ recruiterId: myId, limit: 500 })
        .then((mine) => {
          setExplicitlyAssignedRequirementIds(new Set(mine.map((r) => r.id)));
          setMyAssignedRequirements(mine);
        })
        .catch(() => undefined);
    };
    window.addEventListener('requirements-assignment-changed', onAssignmentChanged);
    return () => window.removeEventListener('requirements-assignment-changed', onAssignmentChanged);
  }, [currentUserId]);

  const workRows = useMemo<WorkRow[]>(() => {
    const requirementIdQuery = workSearchRequirementId.trim().toLowerCase();
    const clientQuery = workSearchClient.trim().toLowerCase();

    const matchesCommonFilters = (requirementId: string, client: string) => {
      const reqMatch = !requirementIdQuery || requirementId.toLowerCase().includes(requirementIdQuery);
      const clientMatch = !clientQuery || client.toLowerCase().includes(clientQuery);
      return reqMatch && clientMatch;
    };

    const rows: WorkRow[] = [];

    if (isRequirementWorkFilter(workFilter)) {
      requirementsForWork.forEach((r) => {
        if (!requirementMatchesWorkFilter(r, workFilter, mySubmittedRequirementIds)) return;
        const reqId = r.requirementId ?? r.id;
        const client = r.clientLeadPoc ?? '';
        if (!matchesCommonFilters(reqId, client)) return;

        rows.push({
          key: `req-${r.id}`,
          requirementInternalId: r.id,
          requirementId: reqId,
          requirementName: r.roleTitle ?? 'Unknown',
          client,
          type: 'Requirement',
          statusLabel: 'Assigned',
          submittedOn: latestMyAssignmentByRequirementId[r.id] || r.updatedAt || r.createdAt,
        });
      });
    } else {
      mySubmissions.forEach((s) => {
        if (!submissionMatchesWorkFilter(s, workFilter)) return;

        const reqId = s.requirement?.requirementId ?? s.requirement?.id ?? '';
        const client = s.requirement?.clientName ?? '';
        if (!matchesCommonFilters(reqId, client)) return;

        rows.push({
          key: `sub-${s.id}`,
          requirementInternalId: s.requirement?.id,
          requirementId: reqId,
          requirementName: s.requirement?.roleTitle || 'Unknown',
          client,
          type: 'Candidate',
          candidateName: s.candidate?.name || 'Unknown',
          candidateEmail: s.candidate?.email || '—',
          statusLabel: s.status,
          submittedOn: s.submittedOn,
        });
      });
    }

    return rows.sort((a, b) => {
      const ta = a.submittedOn ? new Date(a.submittedOn).getTime() : 0;
      const tb = b.submittedOn ? new Date(b.submittedOn).getTime() : 0;
      return tb - ta;
    });
  }, [
    requirementsForWork,
    mySubmissions,
    workFilter,
    workSearchRequirementId,
    workSearchClient,
    mySubmittedRequirementIds,
    latestMyAssignmentByRequirementId,
  ]);
  const isAssignedMode = workFilter === 'Assigned';
  const workTableTotalPages = Math.max(1, Math.ceil(workRows.length / MY_WORK_ROWS_PER_PAGE));
  const paginatedWorkRows = useMemo(() => {
    const start = (workTablePage - 1) * MY_WORK_ROWS_PER_PAGE;
    return workRows.slice(start, start + MY_WORK_ROWS_PER_PAGE);
  }, [workRows, workTablePage]);
  const workTableStart = workRows.length === 0 ? 0 : (workTablePage - 1) * MY_WORK_ROWS_PER_PAGE + 1;
  const workTableEnd = Math.min(workTablePage * MY_WORK_ROWS_PER_PAGE, workRows.length);
  const timestampHeaderLabel =
    workFilter === 'Assigned'
      ? 'Timestamp (Assigned On)'
      : workFilter === 'SelectedForInterview'
        ? 'Timestamp (Selected For Interview)'
        : 'Submitted On';

  useEffect(() => {
    setWorkTablePage(1);
  }, [workFilter, workSearchClient, workSearchRequirementId]);

  useEffect(() => {
    setWorkTablePage((p) => Math.min(p, workTableTotalPages));
  }, [workTableTotalPages]);

  const defaultProfile: EditableProfile = useMemo(
    () => ({
      name:
        currentUser?.name ??
        [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') ??
        '',
      email: currentUser?.email ?? '',
      role: mapDbRoleToUiRole(currentUser?.role ?? currentUser?.title),
      phone: currentUser?.phone ?? '',
      submittingTo: currentUser?.submittingTo ?? '',
    }),
    [currentUser],
  );

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [editable, setEditable] = useState<EditableProfile>(defaultProfile);

  useEffect(() => {
    if (!currentUserId) {
      setEditable(defaultProfile);
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const s = localStorage.getItem(profileStorageKey(currentUserId));
      if (s) {
        const parsed = JSON.parse(s) as EditableProfile;
        const parsedEmail = (parsed.email ?? '').trim().toLowerCase();
        const userEmail = (defaultProfile.email ?? '').trim().toLowerCase();
        if (parsedEmail && userEmail && parsedEmail !== userEmail) {
          setEditable(defaultProfile);
          return;
        }
        setEditable({
          name: parsed.name ?? defaultProfile.name,
          email: parsed.email ?? defaultProfile.email,
          role: parsed.role ?? defaultProfile.role,
          phone: parsed.phone ?? '',
          submittingTo: parsed.submittingTo ?? '',
        });
      } else {
        setEditable(defaultProfile);
      }
    } catch (_) {
      setEditable(defaultProfile);
    }
  }, [currentUserId, defaultProfile]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(() => ({
    ...editable,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  }));
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Prefer server-backed avatar.
    if (!currentUserId) return;
    const avatar = (currentUser as any)?.avatar as string | null | undefined;
    if (avatar) {
      setPhotoUrl(`/api/users/${currentUserId}/avatar`);
      return;
    }
    // Fallback to localStorage only for legacy values (avoid persisting blob: URLs).
    if (typeof window === 'undefined') return;
    const s = localStorage.getItem(profilePhotoStorageKey(currentUserId));
    if (s && s.startsWith('/api/users/')) setPhotoUrl(s);
    else setPhotoUrl(null);
  }, [currentUserId, currentUser]);

  useEffect(() => {
    if (!currentUserId || typeof window === 'undefined') return;
    try {
      localStorage.setItem(profileStorageKey(currentUserId), JSON.stringify(editable));
    } catch (_) {}
  }, [editable, currentUserId]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    setPhotoFile(file);
  };

  const handleRemovePhoto = () => {
    setPhotoUrl(null);
    setPhotoFile(null);
    try {
      if (currentUserId) localStorage.removeItem(profilePhotoStorageKey(currentUserId));
    } catch (_) {}

    // Best-effort backend removal.
    try {
      const token = localStorage.getItem('token');
      if (token) {
        void fetch('/api/auth/me/avatar', {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }).then(() => refreshAuth());
      }
    } catch (_) {
      // Ignore
    }
  };

  const clearPasswordFields = () => {
    setEditForm((f) => ({
      ...f,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }));
    setPasswordErrors({});
  };

  const handleSaveProfile = async () => {
    const hasAnyPassword =
      editForm.currentPassword.trim() ||
      editForm.newPassword.trim() ||
      editForm.confirmPassword.trim();

    if (hasAnyPassword) {
      const result = passwordChangeSchema.safeParse({
        currentPassword: editForm.currentPassword,
        newPassword: editForm.newPassword,
        confirmPassword: editForm.confirmPassword,
      });

      if (!result.success) {
        const issues = result.error.issues;
        const errors: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
        for (const issue of issues) {
          const path = issue.path[0];
          if (path === 'currentPassword') errors.currentPassword = issue.message;
          else if (path === 'newPassword') errors.newPassword = issue.message;
          else if (path === 'confirmPassword') errors.confirmPassword = issue.message;
        }
        setPasswordErrors(errors);
        return;
      }

      setPasswordErrors({});
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setPasswordErrors({ currentPassword: 'Please login again' });
          return;
        }
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: editForm.currentPassword,
            newPassword: editForm.newPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPasswordErrors({ currentPassword: data.error ?? 'Failed to change password' });
          return;
        }
      } catch {
        setPasswordErrors({ currentPassword: 'Failed to change password' });
        return;
      }
      clearPasswordFields();
    }

    // Persist Basic Information into the database (users table)
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        // Fallback to local-only behavior if user is not authenticated.
        setEditable({
          name: editForm.name,
          email: editForm.email,
          role: editForm.role,
          phone: editForm.phone,
          submittingTo: editForm.submittingTo,
        });
        setEditing(false);
        return;
      }

      // Upload avatar first so it is stored in the backend.
      if (photoFile) {
        const form = new FormData();
        form.append('avatar', photoFile);
        const avatarRes = await fetch('/api/auth/me/avatar', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        });

        if (!avatarRes.ok) {
          const avatarErr = await avatarRes.text().catch(() => '');
          console.error('Failed to upload avatar:', avatarRes.status, avatarErr);
          // Continue with other profile changes even if avatar upload fails.
        } else {
          setPhotoFile(null);
          await refreshAuth();
        }
      }

      const trimmedName = editForm.name.trim();
      const parts = trimmedName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] ?? '';
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';

      const phone = editForm.phone.trim();
      const canSendPhone = phone.length >= 10 && phone.length <= 20 ? phone : undefined;

      const payload: Record<string, unknown> = {
        email: editForm.email.trim(),
      };

      // Backend validates firstName/lastName/phone only if provided.
      if (firstName.length >= 2) payload.firstName = firstName;
      if (lastName.length >= 2) payload.lastName = lastName;
      if (canSendPhone) payload.phone = canSendPhone;

      const dbRole = mapRoleToDbRole(editForm.role);
      if (dbRole) payload.role = dbRole;

      const submittingTo = editForm.submittingTo.trim();
      payload.submittingTo = submittingTo.length ? submittingTo : null;

      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Failed to persist profile:', res.status, errText);
        return;
      }

      // Update UI with latest DB-backed user values.
      await refreshAuth();
    } catch (e) {
      console.error('Profile persistence failed:', e);
      return;
    }

    setEditable({
      name: editForm.name,
      email: editForm.email,
      role: editForm.role,
      phone: editForm.phone,
      submittingTo: editForm.submittingTo,
    });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditForm({
      ...editable,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setPasswordErrors({});
    setEditing(false);
  };

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    const myReqs = requirements.filter(
      (r) => r && !r.isDeleted && recruiterOwnsRequirement(r, currentUserId),
    );
    const mySubs = submissions.filter((s) => s && s.submittedBy && s.submittedBy.id === currentUserId);

    myReqs.forEach((r) => {
      if (r && r.id && r.roleTitle && r.clientLeadPoc) {
        items.push({
          id: `req-${r.id}`,
          title: `Assigned ${r.roleTitle} requirement to self`,
          description: `${r.clientLeadPoc} · ${r.roleTitle}`,
          href: `/requirements/${r.id}`,
          timestamp: r.updatedAt || r.createdAt,
        });
      }
    });
    mySubs.forEach((s) => {
      if (s && s.id) {
        items.push({
          id: `sub-${s.id}`,
          title: `Submitted candidate for ${s.requirement?.roleTitle || 'Unknown'}`,
          description: `${s.requirement?.clientName || 'Unknown'} · ${s.candidate?.name || 'Unknown'}`,
          href: `/submissions?submissionId=${encodeURIComponent(s.id)}`,
          timestamp: s.submittedOn,
        });
      }
    });

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items.slice(0, 8);
  }, [requirements, submissions, currentUserId]);

  const myRequirementsQuery =
    currentUserId !== ''
      ? `recruiter=${encodeURIComponent(currentUserId)}`
      : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Work"
        subtitle="Your personal assignments, submissions, and daily activity"
      />

      {/* Performance Summary – single row, no duplicates */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-zinc-200">
          Performance Summary
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Submissions"
            value={metrics.totalSubmissions}
            icon={<Send className="h-5 w-5" />}
            color="emerald"
            href={
              myRequirementsQuery
                ? `/submissions?submittedById=${encodeURIComponent(currentUserId)}`
                : '/submissions'
            }
          />
          <StatCard
            label="Interviews Handled"
            value={metrics.interviews}
            icon={<MessageSquare className="h-5 w-5" />}
            color="amber"
            href={
              myRequirementsQuery
                ? `/interviews?recruiter=${encodeURIComponent(currentUserId)}`
                : '/interviews'
            }
          />
          <StatCard
            label="Selections Achieved"
            value={metrics.selected}
            icon={<CheckCircle2 className="h-5 w-5" />}
            color="purple"
            href={
              myRequirementsQuery
                ? `/requirements?status=Selected&${myRequirementsQuery}`
                : '/requirements?status=Selected'
            }
          />
          <StatCard
            label="Assigned Requirements"
            value={metrics.assignedRequirements}
            icon={<ClipboardList className="h-5 w-5" />}
            color="blue"
            href={
              myRequirementsQuery
                ? `/requirements?status=Assigned&${myRequirementsQuery}`
                : '/requirements?status=Assigned'
            }
          />
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200">
            Active Requirements + Submitted Candidates
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
            Your open workload across currently active job demands.
          </p>
        </div>

        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
              <input
                type="text"
                value={workSearchClient}
                onChange={(e) => setWorkSearchClient(e.target.value)}
                placeholder="Search by client"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
              />
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
              <input
                type="text"
                value={workSearchRequirementId}
                onChange={(e) => setWorkSearchRequirementId(e.target.value)}
                placeholder="Search by requirement ID"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
              />
            </div>
            <div>
              <select
                value={workFilter}
                onChange={(e) => setWorkFilter(e.target.value as WorkFilter)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
              >
                {WORK_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Requirement ID</th>
                  <th className="px-4 py-3">Requirement Name</th>
                  <th className="px-4 py-3">Client</th>
                  {!isAssignedMode && <th className="px-4 py-3">Candidate</th>}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">{timestampHeaderLabel}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedWorkRows.map((row) => (
                  <tr key={row.key} className="border-b border-gray-200/70 dark:border-zinc-800/70">
                    <td className="px-4 py-3">{row.type}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-zinc-50">
                      <Link
                        href={`/requirements/${encodeURIComponent(row.requirementInternalId || row.requirementId)}`}
                        className="hover:underline"
                        title="Open Requirement Overview"
                      >
                        {row.requirementId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.requirementName}</td>
                    <td className="px-4 py-3">{row.client || '—'}</td>
                    {!isAssignedMode && (
                      <td className="px-4 py-3">
                        {row.type === 'Candidate' ? (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-zinc-50">
                              {row.candidateName}
                            </div>
                            <div className="text-xs text-gray-600 dark:text-zinc-400">
                              {row.candidateEmail}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {row.type === 'Candidate' ? (
                        <StatusBadge status={row.statusLabel as Submission['status']} />
                      ) : (
                        row.statusLabel
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.submittedOn
                        ? new Date(row.submittedOn).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
                {paginatedWorkRows.length === 0 ? (
                  <tr>
                    <td colSpan={isAssignedMode ? 6 : 7} className="px-4 py-8 text-center text-sm text-gray-600 dark:text-zinc-400">
                      No records match your current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        {workRows.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              Showing {workTableStart}-{workTableEnd} of {workRows.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWorkTablePage((p) => Math.max(p - 1, 1))}
                disabled={workTablePage === 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                ‹
              </button>
              <span className="min-w-[100px] text-center text-sm font-medium text-gray-700 dark:text-zinc-300">
                Page {workTablePage} of {workTableTotalPages}
              </span>
              <button
                onClick={() => setWorkTablePage((p) => Math.min(p + 1, workTableTotalPages))}
                disabled={workTablePage === workTableTotalPages}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 2 */}
      <section className="space-y-4">
      <div className="flex justify-end">
        <select
          value={recentSubmissionStatusFilter}
          onChange={(e) =>
            setRecentSubmissionStatusFilter(e.target.value as 'All' | SubmissionStatus)
          }
          className="h-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-400 focus:ring-4 focus:ring-gray-200/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-800/60"
        >
          <option value="All">All Status</option>
          <option value="Submitted to Lead">Submitted to Lead</option>
          <option value="Submitted to Client">Submitted to Client</option>
          <option value="Submitted">Submitted (legacy)</option>
          <option value="Interview">Interview</option>
          <option value="Selected">Selected</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>
      <DataTable
        title="My Recent Submissions"
        subtitle="Your latest candidate activity across requirements."
        columns={[
          {
            key: 'candidate',
            header: 'Candidate Name',
            cell: (s) => (
              <Link
                href={
                  s.candidate?.id
                    ? `/candidates/${encodeURIComponent(s.candidate.id)}`
                    : '/candidates'
                }
                className="font-semibold text-gray-900 hover:underline dark:text-zinc-50"
                title="View full profile"
              >
                {s.candidate?.name || 'Unknown'}
              </Link>
            ),
          },
          {
            key: 'recruiter',
            header: 'Recruiter',
            cell: (s) => (
              <span className="text-gray-700 dark:text-zinc-300">
                {s.submittedBy?.name || s.submittedBy?.email || 'Unknown'}
              </span>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            cell: (s) => (
              <Link
                href={requirementDetailHref(s.requirement ?? {})}
                className="text-gray-900 hover:underline dark:text-zinc-50"
              >
                {s.requirement?.roleTitle || 'Unknown'}
              </Link>
            ),
          },
          {
            key: 'client',
            header: 'Client',
            cell: (s) => (
              <span className="text-gray-700 dark:text-zinc-300">
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
              <span className="tabular-nums">
                {fmtDate(s.submittedOn)}
              </span>
            ),
          },
        ]}
        rows={filteredMySubmissions}
        rowsPerPage={5}
        emptyText="No submissions found for your user."
        mobileCard={(s) => (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={
                    s.candidate?.id
                      ? `/candidates/${encodeURIComponent(s.candidate.id)}`
                      : '/candidates'
                  }
                  className="text-sm font-semibold text-gray-900 hover:underline dark:text-zinc-50"
                  title="View full profile"
                >
                  {s.candidate?.name || 'Unknown'}
                </Link>
                <div className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
                  {s.candidate?.currentCompany || 'Unknown'}
                </div>
                <div className="mt-2">
                  <StatusBadge status={s.status} />
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-zinc-400">
                {fmtDate(s.submittedOn)}
              </div>
            </div>
            <div className="mt-4 text-sm">
              <div className="text-xs text-gray-500 dark:text-zinc-400">
                Role
              </div>
              <Link
                href={requirementDetailHref(s.requirement ?? {})}
                className="font-medium text-gray-900 hover:underline dark:text-zinc-50"
              >
                {s.requirement?.roleTitle || 'Unknown'}
              </Link>
              <div className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                Recruiter
              </div>
              <div className="text-sm text-gray-700 dark:text-zinc-300">
                {s.submittedBy?.name || s.submittedBy?.email || 'Unknown'}
              </div>
              <div className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                Client
              </div>
              <div className="text-sm text-gray-700 dark:text-zinc-300">
                {s.requirement?.clientName || 'Unknown Client'}
              </div>
            </div>
          </div>
        )}
      />
      </section>

      {/* Section 3 */}
      <ActivityTimeline items={timeline} />
    </div>
  );
}

