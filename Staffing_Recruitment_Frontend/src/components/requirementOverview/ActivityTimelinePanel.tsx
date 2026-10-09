'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import type { RequirementActivityRow } from '@/lib/api/requirements';
import type { RequirementAssignmentRow } from '@/lib/api/requirements';
import type { Submission } from '@/lib/domain/submissions/types';
import { formatDateTime } from '@/lib/utils/dateTime';
import { cn } from '@/lib/utils/cn';

type Props = {
  rows: RequirementActivityRow[];
  loading: boolean;
  requirement: {
    requirementId?: string;
    createdAt: string;
    status: string;
    closedDate?: string | null;
    assignedToRecruiterName?: string | null;
    assignmentAssignerName?: string | null;
    owner?: { name?: string };
  };
  assignmentRows: RequirementAssignmentRow[];
  submissions: Submission[];
};

type TimelineItem =
  | { kind: 'single'; row: RequirementActivityRow }
  | {
      kind: 'assignment-batch';
      key: string;
      action: string;
      createdAt: string;
      actorName: string | null;
      members: RequirementActivityRow[];
    };

function dayKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function actionBadgeClass(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('submission')) return 'bg-blue-100 text-blue-700';
  if (lower.includes('interview')) return 'bg-indigo-100 text-indigo-700';
  if (lower.includes('offer')) return 'bg-emerald-100 text-emerald-700';
  if (lower.includes('assign') || lower.includes('revoke')) return 'bg-amber-100 text-amber-700';
  if (lower.includes('security')) return 'bg-rose-100 text-rose-700';
  if (lower.includes('communication')) return 'bg-violet-100 text-violet-700';
  return 'bg-gray-100 text-gray-700';
}

function metadataValue(raw: unknown, key: string): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  return String((raw as Record<string, unknown>)[key] ?? '').trim();
}

function recruiterNameFromActivity(row: RequirementActivityRow): string {
  const fromMeta = metadataValue(row.metadata, 'recruiterName');
  if (fromMeta) return fromMeta;
  const summary = row.summary.trim();
  const assignedMatch = summary.match(/^Requirement assigned to (.+)$/i);
  if (assignedMatch?.[1]) return assignedMatch[1].trim();
  const revokedMatch = summary.match(/^Assignment revoked for (.+)$/i);
  if (revokedMatch?.[1]) return revokedMatch[1].trim();
  return summary;
}

function assignmentBatchKey(row: RequirementActivityRow): string | null {
  const action = row.action.trim().toUpperCase();
  if (action !== 'ASSIGNED' && action !== 'REVOKED') return null;
  const d = new Date(row.createdAt);
  const minute = Number.isNaN(d.getTime()) ? row.createdAt : d.toISOString().slice(0, 16);
  const actor =
    row.actorName?.trim() ||
    metadataValue(row.metadata, 'assignerName') ||
    metadataValue(row.metadata, 'assignedByName');
  return `${action}|${minute}|${actor}`;
}

function collapseAssignmentActivities(rows: RequirementActivityRow[]): TimelineItem[] {
  const singles: RequirementActivityRow[] = [];
  const batchMap = new Map<string, RequirementActivityRow[]>();

  for (const row of rows) {
    const key = assignmentBatchKey(row);
    if (!key) {
      singles.push(row);
      continue;
    }
    const bucket = batchMap.get(key);
    if (bucket) bucket.push(row);
    else batchMap.set(key, [row]);
  }

  const items: TimelineItem[] = singles.map((row) => ({ kind: 'single', row }));

  for (const [key, members] of batchMap.entries()) {
    if (members.length === 1) {
      items.push({ kind: 'single', row: members[0] });
      continue;
    }
    const sortedMembers = [...members].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    items.push({
      kind: 'assignment-batch',
      key,
      action: sortedMembers[0].action,
      createdAt: sortedMembers[0].createdAt,
      actorName: sortedMembers[0].actorName,
      members: sortedMembers,
    });
  }

  return items.sort((a, b) => {
    const ta = a.kind === 'single' ? a.row.createdAt : a.createdAt;
    const tb = b.kind === 'single' ? b.row.createdAt : b.createdAt;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
}

function metadataLines(raw: unknown, summary: string): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const m = raw as Record<string, unknown>;
  const lines: string[] = [];

  const push = (label: string, value: unknown) => {
    const v = String(value ?? '').trim();
    if (!v) return;
    if (label === 'Recruiter' && summary.toLowerCase().includes(v.toLowerCase())) return;
    lines.push(`${label}: ${v}`);
  };

  push('Candidate', m.candidateName);
  push('Recruiter', m.recruiterName);
  push('Round', m.round);
  push('Status', m.status ?? m.newStatus);
  push('Previous Status', m.oldStatus);
  push('Final Decision', m.finalDecision);
  push('Recipient', m.recipient);

  if (typeof m.scheduledAt === 'string' && m.scheduledAt.trim()) {
    lines.push(`Scheduled At: ${formatDateTime(m.scheduledAt)}`);
  }
  if (typeof m.acceptedJoiningDate === 'string' && m.acceptedJoiningDate.trim()) {
    lines.push(`Joining Date: ${formatDateTime(m.acceptedJoiningDate)}`);
  }
  if (typeof m.declineReason === 'string' && m.declineReason.trim()) {
    lines.push(`Reason: ${m.declineReason}`);
  }
  if (typeof m.rejectionReason === 'string' && m.rejectionReason.trim()) {
    lines.push(`Reason: ${m.rejectionReason}`);
  }

  return lines.slice(0, 6);
}

function AssignmentBatchTimelineCard({
  item,
  defaultExpanded = false,
}: {
  item: Extract<TimelineItem, { kind: 'assignment-batch' }>;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isAssigned = item.action.toUpperCase() === 'ASSIGNED';
  const recruiterNames = useMemo(
    () =>
      [...new Set(item.members.map((row) => recruiterNameFromActivity(row)).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    [item.members],
  );
  const previewNames = recruiterNames.slice(0, 4);
  const overflowCount = Math.max(0, recruiterNames.length - previewNames.length);

  return (
    <div className="rounded-lg border border-amber-100 bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">
            {isAssigned
              ? `${recruiterNames.length} recruiters assigned`
              : `${recruiterNames.length} assignments revoked`}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500">
            <span>{formatDateTime(item.createdAt)}</span>
            {item.actorName ? <span>· {item.actorName}</span> : null}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[10px] uppercase',
                actionBadgeClass(item.action),
              )}
            >
              {item.action}
            </span>
          </div>
          {!expanded && previewNames.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {previewNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex max-w-[10rem] items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="truncate">{name}</span>
                </span>
              ))}
              {overflowCount > 0 ? (
                <span className="text-[11px] font-medium text-blue-700">+{overflowCount} more</span>
              ) : null}
            </div>
          )}
        </div>
        <span className="mt-1 shrink-0 text-gray-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="max-h-56 overflow-y-auto">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {recruiterNames.map((name) => (
                <div
                  key={name}
                  className="truncate rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-800"
                >
                  {name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ActivityTimelinePanel({ rows, loading, requirement, assignmentRows, submissions }: Props) {
  const [visible, setVisible] = useState(40);

  const timelineItems = useMemo(() => collapseAssignmentActivities(rows), [rows]);
  const slice = timelineItems.slice(0, visible);

  const recruiterSubmissionStats = useMemo(() => {
    const byRecruiter = new Map<string, number>();
    for (const sub of submissions) {
      const who = sub.submittedBy?.name?.trim() || sub.submittedBy?.email?.trim() || 'Unknown recruiter';
      byRecruiter.set(who, (byRecruiter.get(who) ?? 0) + 1);
    }
    return [...byRecruiter.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [submissions]);

  const statusCounts = useMemo(() => {
    let submitted = 0;
    let interview = 0;
    let selected = 0;
    let rejected = 0;
    for (const sub of submissions) {
      if (
        sub.status === 'Submitted' ||
        sub.status === 'Submitted to Lead' ||
        sub.status === 'Submitted to Client'
      ) {
        submitted += 1;
      }
      else if (sub.status === 'Interview') interview += 1;
      else if (sub.status === 'Selected') selected += 1;
      else if (sub.status === 'Rejected') rejected += 1;
    }
    return { submitted, interview, selected, rejected };
  }, [submissions]);

  const activeAssigneeCount = useMemo(
    () => assignmentRows.filter((row) => row.status === 'ACTIVE').length,
    [assignmentRows],
  );
  const assignedBy =
    requirement.assignmentAssignerName?.trim() ||
    assignmentRows.find((r) => r.status === 'ACTIVE')?.assignerName ||
    '—';

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center text-sm text-gray-500">
        No audit events yet for this requirement.
      </div>
    );
  }

  let lastDay = '';
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Requirement</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{requirement.requirementId ?? '—'}</div>
            <div className="mt-1 text-xs text-gray-500">Created: {formatDateTime(requirement.createdAt)}</div>
            <div className="text-xs text-gray-500">
              Current status: <span className="font-medium text-gray-700">{requirement.status}</span>
            </div>
            {requirement.closedDate ? (
              <div className="text-xs text-gray-500">Closed: {formatDateTime(requirement.closedDate)}</div>
            ) : null}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Assignment</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {activeAssigneeCount > 0
                ? `${activeAssigneeCount} active recruiter${activeAssigneeCount === 1 ? '' : 's'}`
                : 'Unassigned'}
            </div>
            <div className="mt-1 text-xs text-gray-500">Assigned by: {assignedBy}</div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Submissions</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{submissions.length} total</div>
            <div className="mt-1 text-xs text-gray-500">Submitted: {statusCounts.submitted}</div>
            <div className="text-xs text-gray-500">Interview: {statusCounts.interview}</div>
            <div className="text-xs text-gray-500">Selected: {statusCounts.selected}</div>
            <div className="text-xs text-gray-500">Rejected: {statusCounts.rejected}</div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Recruiters working</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{recruiterSubmissionStats.length}</div>
            <div className="mt-1 space-y-1 text-xs text-gray-600">
              {recruiterSubmissionStats.slice(0, 3).map((r) => (
                <div key={r.name} className="truncate">
                  {r.name}: {r.count}
                </div>
              ))}
              {recruiterSubmissionStats.length === 0 ? <div>No recruiter submissions yet</div> : null}
            </div>
          </div>
        </div>
      </div>

      <ul className="relative ml-3 border-l border-gray-200 pl-6">
        {slice.map((item, index) => {
          const createdAt = item.kind === 'single' ? item.row.createdAt : item.createdAt;
          const dk = dayKey(createdAt);
          const showHeader = dk !== lastDay;
          lastDay = dk;
          const itemKey = item.kind === 'single' ? item.row.id : item.key;

          return (
            <React.Fragment key={itemKey}>
              {showHeader && (
                <li className="-ml-6 mb-3 list-none">
                  <div className="bg-white/95 py-1 text-xs font-bold uppercase tracking-wide text-gray-400">
                    {dk}
                  </div>
                </li>
              )}
              <li className="relative pb-6 last:pb-2">
                <span className="absolute -left-[21px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white" />
                {item.kind === 'assignment-batch' ? (
                  <AssignmentBatchTimelineCard
                    item={item}
                    defaultExpanded={index === 0}
                  />
                ) : (
                  <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="text-sm font-semibold text-gray-900">{item.row.summary}</div>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-gray-500">
                      <span>{formatDateTime(item.row.createdAt)}</span>
                      {item.row.actorName && <span>· {item.row.actorName}</span>}
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${actionBadgeClass(item.row.action)}`}
                      >
                        {item.row.action}
                      </span>
                    </div>
                    {metadataLines(item.row.metadata, item.row.summary).length > 0 && (
                      <div className="mt-2 grid gap-1 rounded-md bg-gray-50 p-2 text-[11px] text-gray-600 sm:grid-cols-2">
                        {metadataLines(item.row.metadata, item.row.summary).map((line, idx) => (
                          <div key={`${item.row.id}-md-${idx}`} className="truncate">
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ul>
      {visible < timelineItems.length && (
        <button
          type="button"
          className="mt-2 w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          onClick={() => setVisible((v) => v + 40)}
        >
          Load more ({timelineItems.length - visible} remaining)
        </button>
      )}
    </div>
  );
}
