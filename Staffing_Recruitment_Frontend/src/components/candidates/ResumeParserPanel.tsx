'use client';

import React, { useCallback, useRef, useState } from 'react';
import { FileText, Loader2, UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { FileUpload } from '@/components/ui/FileUpload';
import {
  bulkQueueCounts,
  type BulkReviewQueueItem,
  type BulkReviewStatus,
} from '@/lib/candidates/bulkReviewQueue';

const ACCEPT = ['.pdf', '.doc', '.docx', '.txt'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_BULK_FILES = 50;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function validateResumeFile(file: File): string | null {
  const ext = getFileExtension(file.name);
  if (!ACCEPT.includes(ext)) {
    return `Invalid file type. Accepted: PDF, DOC, DOCX, TXT.`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File exceeds ${formatBytes(MAX_SIZE_BYTES)} limit.`;
  }
  return null;
}

function ReviewStatusBadge({ status }: { status: BulkReviewStatus }) {
  const styles: Record<BulkReviewStatus, string> = {
    pending:
      'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    reviewing:
      'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200',
    submitted:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
    error: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200',
  };
  const labels: Record<BulkReviewStatus, string> = {
    pending: 'Pending',
    reviewing: 'Reviewing',
    submitted: 'Submitted',
    error: 'Failed',
  };
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', styles[status])}>
      {labels[status]}
    </span>
  );
}

export type ResumeParseMode = 'single' | 'bulk';

type ResumeParserPanelProps = {
  mode: ResumeParseMode;
  onModeChange: (mode: ResumeParseMode) => void;
  resumeFile: File | null;
  onResumeFileChange: (file: File | null) => void;
  bulkFiles: File[];
  onBulkFilesChange: (files: File[]) => void;
  bulkReviewQueue: BulkReviewQueueItem[];
  onBulkReviewQueueChange: (items: BulkReviewQueueItem[]) => void;
  activeBulkReviewId: string | null;
  isParsing: boolean;
  parseHint: string | null;
  onParseSingle: () => void;
  onParseBulk: () => void;
  onPreviewResume: () => void;
  onLoadQueueItem: (itemId: string) => void;
  onSubmitAllParsed: () => void;
  isSubmittingAll: boolean;
  compact?: boolean;
  hidden?: boolean;
};

export function ResumeParserPanel({
  mode,
  onModeChange,
  resumeFile,
  onResumeFileChange,
  bulkFiles,
  onBulkFilesChange,
  bulkReviewQueue,
  onBulkReviewQueueChange,
  activeBulkReviewId,
  isParsing,
  parseHint,
  onParseSingle,
  onParseBulk,
  onPreviewResume,
  onLoadQueueItem,
  onSubmitAllParsed,
  isSubmittingAll,
  compact,
  hidden,
}: ResumeParserPanelProps) {
  const [bulkDragActive, setBulkDragActive] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const queueCounts = bulkQueueCounts(bulkReviewQueue);
  const pendingSubmitCount = bulkReviewQueue.filter(
    (i) => i.reviewStatus === 'pending' || i.reviewStatus === 'reviewing',
  ).length;

  const addBulkFiles = useCallback(
    (incoming: FileList | File[]) => {
      setBulkError(null);
      const next = [...bulkFiles];
      const errors: string[] = [];

      for (const file of Array.from(incoming)) {
        if (next.length >= MAX_BULK_FILES) {
          errors.push(`Maximum ${MAX_BULK_FILES} files per batch.`);
          break;
        }
        const err = validateResumeFile(file);
        if (err) {
          errors.push(`${file.name}: ${err}`);
          continue;
        }
        if (next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
          continue;
        }
        next.push(file);
      }

      if (errors.length) setBulkError(errors[0] ?? null);
      onBulkFilesChange(next);
      onBulkReviewQueueChange([]);
    },
    [bulkFiles, onBulkFilesChange, onBulkReviewQueueChange],
  );

  const removeBulkFile = (index: number) => {
    const next = bulkFiles.filter((_, i) => i !== index);
    onBulkFilesChange(next);
    onBulkReviewQueueChange([]);
  };

  if (hidden) return null;

  if (compact && mode === 'bulk' && bulkReviewQueue.length > 0) {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-800/60 dark:bg-indigo-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">
              Bulk review queue
            </h2>
            <p className="mt-0.5 text-xs text-indigo-900/80 dark:text-indigo-200/80">
              {queueCounts.submitted} submitted · {queueCounts.pending} pending
              {queueCounts.reviewing > 0 ? ` · ${queueCounts.reviewing} reviewing` : ''}
              {queueCounts.failed > 0 ? ` · ${queueCounts.failed} failed` : ''}
            </p>
          </div>
        </div>
        <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto">
          {bulkReviewQueue.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs',
                item.id === activeBulkReviewId
                  ? 'bg-indigo-100 dark:bg-indigo-900/50'
                  : 'bg-white/80 dark:bg-zinc-900/80',
              )}
            >
              <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                {item.parsed.candidateName || item.sourceFile}
              </span>
              <ReviewStatusBadge status={item.reviewStatus} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-4 sm:p-6 dark:border-emerald-800/50 dark:bg-emerald-950/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Resume Parser</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
            Drop one or many resumes (PDF, DOCX, DOC, TXT). Metaforge AI fills candidate details
            automatically. In bulk mode, review and submit each candidate — the queue keeps all
            parsed resumes until you finish.
          </p>
        </div>

        <div className="inline-flex shrink-0 rounded-xl border border-emerald-200 bg-white p-1 dark:border-emerald-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => onModeChange('single')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              mode === 'single'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-800',
            )}
          >
            Single candidate
          </button>
          <button
            type="button"
            onClick={() => onModeChange('bulk')}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition',
              mode === 'single'
                ? 'text-gray-600 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-zinc-800'
                : 'bg-emerald-600 text-white shadow-sm',
            )}
          >
            Bulk import
          </button>
        </div>
      </div>

      {mode === 'single' ? (
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full sm:min-w-[300px] lg:max-w-md">
            <FileUpload config="resume" value={resumeFile} onChange={(f) => onResumeFileChange(f)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onPreviewResume}
                disabled={!resumeFile}
                className="shrink-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                View
              </button>
              <button
                type="button"
                disabled={!resumeFile || isParsing}
                onClick={onParseSingle}
                className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isParsing ? 'Parsing…' : 'Parse resume'}
              </button>
            </div>
            {parseHint ? (
              <p className="max-w-xl text-xs text-gray-600 dark:text-zinc-400" role="status">
                {parseHint}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <label
            onDrop={(e) => {
              e.preventDefault();
              setBulkDragActive(false);
              if (e.dataTransfer.files?.length) addBulkFiles(e.dataTransfer.files);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setBulkDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setBulkDragActive(false);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition',
              'border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/40',
              'dark:border-zinc-700 dark:bg-zinc-900/60 dark:hover:border-emerald-600',
              bulkDragActive && 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30',
            )}
          >
            <input
              ref={bulkInputRef}
              type="file"
              multiple
              accept={ACCEPT.join(',')}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) addBulkFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <UploadCloud className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-2 text-sm font-medium text-gray-800 dark:text-zinc-100">
              Drop resumes here or{' '}
              <span className="text-emerald-700 dark:text-emerald-300">browse files</span>
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
              Up to {MAX_BULK_FILES} files • PDF, DOCX, DOC, TXT • Max {formatBytes(MAX_SIZE_BYTES)} each
            </p>
          </label>

          {bulkError ? (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{bulkError}</p>
          ) : null}

          {bulkFiles.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-zinc-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-zinc-100">
                  {bulkFiles.length} file{bulkFiles.length === 1 ? '' : 's'} selected
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onBulkFilesChange([]);
                    onBulkReviewQueueChange([]);
                  }}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Clear all
                </button>
              </div>
              <ul className="max-h-40 divide-y divide-gray-100 overflow-y-auto dark:divide-zinc-800">
                {bulkFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-800 dark:text-zinc-100">{file.name}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBulkFile(index)}
                      className="rounded-lg p-1 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!bulkFiles.length || isParsing}
              onClick={onParseBulk}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isParsing ? 'Parsing resumes…' : `Parse ${bulkFiles.length || ''} resume${bulkFiles.length === 1 ? '' : 's'}`}
            </button>
            {pendingSubmitCount > 0 ? (
              <button
                type="button"
                disabled={isSubmittingAll || isParsing}
                onClick={onSubmitAllParsed}
                className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200"
              >
                {isSubmittingAll ? 'Submitting all…' : `Quick submit all pending (${pendingSubmitCount})`}
              </button>
            ) : null}
          </div>

          {parseHint ? (
            <p className="text-xs text-gray-600 dark:text-zinc-400" role="status">
              {parseHint}
            </p>
          ) : null}

          {bulkReviewQueue.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-zinc-100">
                  Review queue — {queueCounts.submitted} submitted, {queueCounts.pending} pending
                  {queueCounts.reviewing > 0 ? `, ${queueCounts.reviewing} reviewing` : ''}
                  {queueCounts.failed > 0 ? `, ${queueCounts.failed} failed` : ''}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  Load each candidate, review details, and submit. Submitted candidates stay in the
                  list; the next pending candidate opens automatically.
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-2 font-semibold">File</th>
                      <th className="px-4 py-2 font-semibold">Name</th>
                      <th className="px-4 py-2 font-semibold">Email</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                      <th className="px-4 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {bulkReviewQueue.map((item) => (
                      <tr
                        key={item.id}
                        className={cn(
                          item.id === activeBulkReviewId && 'bg-indigo-50/80 dark:bg-indigo-950/20',
                        )}
                      >
                        <td className="max-w-[140px] truncate px-4 py-2.5 text-gray-700 dark:text-zinc-300">
                          {item.sourceFile}
                        </td>
                        <td className="px-4 py-2.5 text-gray-900 dark:text-zinc-100">
                          {item.reviewStatus !== 'error' ? item.parsed.candidateName || '—' : '—'}
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-2.5 text-gray-700 dark:text-zinc-300">
                          {item.reviewStatus !== 'error' ? item.parsed.email || '—' : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <ReviewStatusBadge status={item.reviewStatus} />
                        </td>
                        <td className="px-4 py-2.5">
                          {item.reviewStatus === 'submitted' ? (
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              Done
                            </span>
                          ) : item.reviewStatus === 'error' ? (
                            <span
                              className="text-xs text-red-600 dark:text-red-400"
                              title={item.parseError}
                            >
                              Parse failed
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onLoadQueueItem(item.id)}
                              className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                            >
                              {item.reviewStatus === 'reviewing' ? 'Continue review' : 'Load & review'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
