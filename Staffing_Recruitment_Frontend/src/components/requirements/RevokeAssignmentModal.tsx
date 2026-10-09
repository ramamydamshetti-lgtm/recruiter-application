'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { UserMinus, X } from 'lucide-react';
import {
  groupRevokeTargetsByRequirement,
  revokeTargetKey,
  type RevokeAssignmentTarget,
} from '@/lib/domain/requirements/revokeAssignment';

type Props = {
  open: boolean;
  targets: RevokeAssignmentTarget[];
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (selected: RevokeAssignmentTarget[]) => Promise<void>;
};

export function RevokeAssignmentModal({
  open,
  targets,
  submitting = false,
  onClose,
  onConfirm,
}: Props) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSelectedKeys(new Set());
  }, [open, targets]);

  const groups = useMemo(() => groupRevokeTargetsByRequirement(targets), [targets]);

  if (!open) return null;

  const toggle = (target: RevokeAssignmentTarget) => {
    const key = revokeTargetKey(target);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedTargets = targets.filter((t) => selectedKeys.has(revokeTargetKey(t)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
            Revoke assignment
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-96 space-y-4 overflow-y-auto p-6">
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            This requirement has multiple recruiters assigned. Select who should be removed from the
            assignment.
          </p>

          {groups.map((group) => (
            <div
              key={group.requirementId}
              className="rounded-xl border border-gray-200 dark:border-zinc-700"
            >
              {groups.length > 1 ? (
                <div className="border-b border-gray-100 px-4 py-2 dark:border-zinc-800">
                  <div className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                    {group.requirementId}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-zinc-400">{group.roleTitle}</div>
                </div>
              ) : null}
              <div className="space-y-1 p-2">
                {group.recruiters.map((target) => {
                  const key = revokeTargetKey(target);
                  const checked = selectedKeys.has(key);
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-gray-50 dark:hover:bg-zinc-800"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(target)}
                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-zinc-600 dark:bg-zinc-800"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                          {target.recruiterName}
                        </div>
                        {target.recruiterEmail ? (
                          <div className="truncate text-xs text-gray-500 dark:text-zinc-400">
                            {target.recruiterEmail}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || selectedTargets.length === 0}
            onClick={() => void onConfirm(selectedTargets)}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            <UserMinus className="h-4 w-4" />
            Revoke {selectedTargets.length > 0 ? `(${selectedTargets.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
