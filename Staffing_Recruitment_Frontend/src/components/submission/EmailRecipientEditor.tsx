'use client';

import React, { useCallback, useState } from 'react';
import { GripVertical, Mail, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { notify } from '@/lib/notify';

export type RecipientBucket = 'to' | 'cc' | 'bcc';

export type ThreadRecipientsState = {
  to: string[];
  cc: string[];
  bcc: string[];
};

/** Recruiter shown as email sender (display name + reply-to address). */
export type ThreadFromSenderState = {
  displayName: string;
  email: string;
};

type DragPayload = { bucket: RecipientBucket; index: number };

type Props = {
  value: ThreadRecipientsState;
  onChange: (next: ThreadRecipientsState) => void;
  subject?: string;
  onSubjectChange?: (subject: string) => void;
  fromSender?: ThreadFromSenderState;
  onFromSenderChange?: (next: ThreadFromSenderState) => void;
  sharedMailboxHint?: string;
  disabled?: boolean;
};

const DRAG_MIME = 'application/x-metaforge-recipient';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DragPayload;
    if (parsed?.bucket && typeof parsed.index === 'number') return parsed;
  } catch {
    return null;
  }
  return null;
}

function RecipientColumn({
  title,
  bucket,
  emails,
  dragFrom,
  dragOverBucket,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
  onAdd,
  onEdit,
  disabled,
}: {
  title: string;
  bucket: RecipientBucket;
  emails: string[];
  dragFrom: DragPayload | null;
  dragOverBucket: RecipientBucket | null;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDragOver: (bucket: RecipientBucket) => void;
  onDrop: (bucket: RecipientBucket, toIndex?: number, event?: React.DragEvent) => void;
  onRemove: (index: number) => void;
  onAdd: (email: string) => boolean;
  onEdit: (index: number, email: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const filled = emails.map((email, index) => ({ email, index })).filter(({ email }) => email.trim());

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      notify.warning('Enter an email address.');
      return;
    }
    if (!isValidEmail(trimmed)) {
      notify.warning('Enter a valid email address.');
      return;
    }
    if (onAdd(trimmed)) {
      setDraft('');
    }
  };

  const isDropTarget = dragOverBucket === bucket && dragFrom?.bucket !== bucket;

  return (
    <div
      data-allow-drag="true"
      className={cn(
        'flex min-h-[220px] flex-col rounded-xl border p-3 transition',
        isDropTarget
          ? 'border-blue-400 bg-blue-50/80 ring-2 ring-blue-200 dark:border-blue-500 dark:bg-blue-950/30 dark:ring-blue-900/50'
          : 'border-gray-200 bg-gray-50/80 dark:border-zinc-700 dark:bg-zinc-900/40',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(bucket);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(bucket, undefined, e);
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-zinc-300">
          {title}
          {filled.length ? (
            <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-700 dark:bg-zinc-700 dark:text-zinc-200">
              {filled.length}
            </span>
          ) : null}
        </h4>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {filled.length === 0 ? (
          <div
            className={cn(
              'flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-gray-500 dark:text-zinc-400',
              isDropTarget && 'border-blue-300 bg-white/70 dark:border-blue-700 dark:bg-zinc-950/50',
            )}
          >
            Drop recipients here
          </div>
        ) : (
          filled.map(({ email, index: actualIndex }) => {
            const isDragging =
              dragFrom?.bucket === bucket && dragFrom.index === actualIndex;
            return (
              <div
                key={`${bucket}-${actualIndex}-${email}`}
                draggable={!disabled}
                data-allow-drag="true"
                onDragStart={(e) => {
                  if (disabled) return;
                  const payload = { bucket, index: actualIndex };
                  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart(payload);
                }}
                onDragEnd={onDragEnd}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  onDragOver(bucket);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDrop(bucket, actualIndex, e);
                }}
                className={cn(
                  'group flex items-center gap-2 rounded-lg border bg-white px-2 py-2 shadow-sm transition dark:bg-zinc-950',
                  isDragging
                    ? 'border-blue-300 opacity-50 dark:border-blue-700'
                    : 'border-gray-200 hover:border-blue-200 dark:border-zinc-700 dark:hover:border-blue-800',
                )}
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-400 group-hover:text-blue-500" />
                <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate text-sm" title={email}>
                  {email}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(actualIndex)}
                  className="rounded p-1 text-gray-400 opacity-70 hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label={`Remove ${email}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3 dark:border-zinc-700">
        <input
          type="email"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            }
          }}
          placeholder="Add email…"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-blue-600 dark:focus:ring-blue-900/40"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={commitDraft}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

export function SubmissionFromEditor({
  value,
  onChange,
  sharedMailboxHint = 'recruitment.application@metaforgeit.com',
  disabled,
}: {
  value: ThreadFromSenderState;
  onChange: (next: ThreadFromSenderState) => void;
  sharedMailboxHint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
          From
        </h4>
        <span className="text-[10px] font-medium text-emerald-800/80 dark:text-emerald-300/80">
          Recruiter sending this submission
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-zinc-300">
            Display name
          </label>
          <input
            type="text"
            value={value.displayName}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, displayName: e.target.value })}
            placeholder="e.g. Charlie Darwin"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-emerald-600 dark:focus:ring-emerald-900/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-zinc-300">
            Reply-to email
          </label>
          <input
            type="email"
            value={value.email}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            placeholder="recruiter@metaforgeit.com"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-emerald-600 dark:focus:ring-emerald-900/40"
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
        Clients see <strong>{value.displayName.trim() || 'your name'}</strong> as the sender. Messages are
        delivered via <span className="font-mono">{sharedMailboxHint}</span>. When the client clicks{' '}
        <strong>Reply</strong>, the response goes to your reply-to email. <strong>Reply All</strong> keeps
        everyone in the original thread plus you on CC.
      </p>
    </div>
  );
}

export function EmailRecipientEditor({
  value,
  onChange,
  subject,
  onSubjectChange,
  fromSender,
  onFromSenderChange,
  sharedMailboxHint,
  disabled,
}: Props) {
  const [dragFrom, setDragFrom] = useState<DragPayload | null>(null);
  const [dragOverBucket, setDragOverBucket] = useState<RecipientBucket | null>(null);

  const moveRecipient = useCallback(
    (from: DragPayload, toBucket: RecipientBucket, toIndex?: number) => {
      const source = [...value[from.bucket]];
      const email = source[from.index]?.trim();
      if (!email) return;

      if (from.bucket === toBucket) {
        if (toIndex == null || toIndex === from.index) return;
        source.splice(from.index, 1);
        const insertAt = toIndex > from.index ? toIndex - 1 : toIndex;
        source.splice(insertAt, 0, email);
        onChange({ ...value, [toBucket]: source });
        return;
      }

      source.splice(from.index, 1);
      const dest = [...value[toBucket].filter((e) => e.trim() && e.trim() !== email)];
      if (toIndex != null && toIndex >= 0) {
        dest.splice(toIndex, 0, email);
      } else {
        dest.push(email);
      }

      onChange({
        ...value,
        [from.bucket]: source,
        [toBucket]: dest,
      });
    },
    [onChange, value],
  );

  const handleDrop = useCallback(
    (toBucket: RecipientBucket, toIndex?: number, event?: React.DragEvent) => {
      const from = (event ? parseDragPayload(event) : null) ?? dragFrom;
      if (!from) return;
      moveRecipient(from, toBucket, toIndex);
      setDragFrom(null);
      setDragOverBucket(null);
    },
    [dragFrom, moveRecipient],
  );

  const updateBucket = useCallback(
    (bucket: RecipientBucket, emails: string[]) => {
      onChange({ ...value, [bucket]: emails });
    },
    [onChange, value],
  );

  const columnProps = (bucket: RecipientBucket, title: string) => ({
    title,
    bucket,
    emails: value[bucket],
    dragFrom,
    dragOverBucket,
    disabled,
    onDragStart: setDragFrom,
    onDragEnd: () => {
      setDragFrom(null);
      setDragOverBucket(null);
    },
    onDragOver: setDragOverBucket,
    onDrop: (b: RecipientBucket, toIndex?: number, event?: React.DragEvent) =>
      handleDrop(b, toIndex, event),
    onRemove: (index: number) => {
      const next = value[bucket].filter((_, i) => i !== index);
      updateBucket(bucket, next);
    },
    onAdd: (email: string) => {
      const trimmed = email.trim();
      if (!trimmed || !isValidEmail(trimmed)) return false;
      const existing = new Set(
        [...value.to, ...value.cc, ...value.bcc].map((e) => e.trim().toLowerCase()),
      );
      if (existing.has(trimmed.toLowerCase())) {
        notify.warning('That email is already in the recipient list.');
        return false;
      }
      updateBucket(bucket, [...value[bucket].filter((e) => e.trim()), trimmed]);
      return true;
    },
    onEdit: (index: number, email: string) => {
      const next = [...value[bucket]];
      next[index] = email;
      updateBucket(bucket, next);
    },
  });

  return (
    <div className="space-y-3" data-allow-drag="true">
      {subject != null ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/30">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-200">
            Thread subject
          </label>
          {onSubjectChange ? (
            <input
              type="text"
              value={subject}
              disabled={disabled}
              onChange={(e) => onSubjectChange(e.target.value)}
              className="w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-blue-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-blue-800 dark:bg-zinc-950 dark:text-blue-100"
              placeholder="Original requirement email subject"
            />
          ) : (
            <p className="text-sm text-blue-900 dark:text-blue-100">{subject}</p>
          )}
          <p className="mt-1 text-[11px] text-blue-700/80 dark:text-blue-300/80">
            Pre-filled from the original requirement. Edits apply to this reply; the message stays in the same
            email thread.
          </p>
        </div>
      ) : null}
      {fromSender && onFromSenderChange ? (
        <SubmissionFromEditor
          value={fromSender}
          onChange={onFromSenderChange}
          sharedMailboxHint={sharedMailboxHint}
          disabled={disabled}
        />
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        <RecipientColumn {...columnProps('to', 'To')} />
        <RecipientColumn {...columnProps('cc', 'CC')} />
        <RecipientColumn {...columnProps('bcc', 'BCC')} />
      </div>
      <p className="text-xs text-gray-500 dark:text-zinc-400">
        Drag email chips between To, CC, and BCC. Use Add at the bottom of each column for new recipients.
      </p>
    </div>
  );
}

export function normalizeThreadFromSender(state: ThreadFromSenderState): ThreadFromSenderState {
  return {
    displayName: state.displayName.trim(),
    email: state.email.trim(),
  };
}

export function normalizeThreadRecipients(state: ThreadRecipientsState): ThreadRecipientsState {
  const clean = (rows: string[]) => [...new Set(rows.map((e) => e.trim()).filter(Boolean))];
  return {
    to: clean(state.to),
    cc: clean(state.cc),
    bcc: clean(state.bcc),
  };
}
