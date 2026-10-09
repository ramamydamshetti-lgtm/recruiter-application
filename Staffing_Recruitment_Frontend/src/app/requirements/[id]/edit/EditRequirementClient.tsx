'use client';

import { useEffect, useState } from 'react';
import { RequirementFormPage } from '@/components/screens/CreateRequirementPage';
import { getRequirement, getRequirementAssignments } from '@/lib/api/requirements';
import type { Requirement } from '@/lib/domain/requirements/types';
import { PageBackNav } from '@/components/ui/PageBackNav';
import { useAuth } from '@/lib/contexts/AuthContext';

export function EditRequirementClient({ id }: { id: string }) {
  const { currentUser } = useAuth();
  const [requirement, setRequirement] = useState<Requirement | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRequirement(undefined);
    setError(null);
    (async () => {
      try {
        const r = await getRequirement(id);
        const assignments = await getRequirementAssignments(id);
        const activeAssigneeId = assignments.find((row) => row.status === 'ACTIVE')?.recruiterId ?? null;
        const editable =
          String(r.assignment ?? '').toUpperCase() !== 'ASSIGNED' ||
          (Boolean(activeAssigneeId) && activeAssigneeId === currentUser?.id);
        if (!cancelled) {
          setCanEdit(editable);
          setRequirement(r);
        }
      } catch (e) {
        if (!cancelled) {
          setCanEdit(null);
          setRequirement(null);
          setError(e instanceof Error ? e.message : 'Failed to load requirement');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, currentUser?.id]);

  if (error) {
    return (
      <div className="space-y-6">
        <PageBackNav />
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      </div>
    );
  }

  if (requirement === undefined) {
    return (
      <div className="space-y-6">
        <PageBackNav />
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Loading requirement…</p>
      </div>
    );
  }

  if (requirement === null) {
    return (
      <div className="space-y-6">
        <PageBackNav />
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Requirement not found.
        </div>
      </div>
    );
  }

  if (canEdit === false) {
    return (
      <div className="space-y-6">
        <PageBackNav />
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          This requirement is currently assigned to another recruiter. Only the active assignee can edit it.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageBackNav />
      <RequirementFormPage
        key={requirement.id}
        mode="edit"
        editInternalId={id}
        initialRequirement={requirement}
      />
    </div>
  );
}
