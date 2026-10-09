'use client';

import React from 'react';

type Props = {
  greeting: string;
  onGreetingChange: (value: string) => void;
  introduction: string;
  onIntroductionChange: (value: string) => void;
  onResetGreeting?: () => void;
  onResetIntroduction?: () => void;
  disabled?: boolean;
};

export function SubmissionEmailContentEditor({
  greeting,
  onGreetingChange,
  introduction,
  onIntroductionChange,
  onResetGreeting,
  onResetIntroduction,
  disabled,
}: Props) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-zinc-300">
            Email greeting
          </label>
          {onResetGreeting ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onResetGreeting}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
            >
              Reset from To recipients
            </button>
          ) : null}
        </div>
        <input
          type="text"
          value={greeting}
          disabled={disabled}
          onChange={(e) => onGreetingChange(e.target.value)}
          placeholder="Dear Vinaya,"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-blue-600"
        />
        <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
          Auto-generated from To recipients. Edit if needed before sending.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-zinc-300">
            Introduction
          </label>
          {onResetIntroduction ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onResetIntroduction}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
            >
              Reset to default
            </button>
          ) : null}
        </div>
        <textarea
          value={introduction}
          disabled={disabled}
          onChange={(e) => onIntroductionChange(e.target.value)}
          rows={5}
          className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-blue-600"
        />
      </div>

      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-700 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Preview</div>
        <p className="font-medium">{greeting || 'Dear Team,'}</p>
        {introduction.split(/\n\s*\n/).map((block, i) => (
          <p key={i} className="mt-2 whitespace-pre-wrap">
            {block.trim()}
          </p>
        ))}
        <p className="mt-2 text-slate-500 italic">[Submission tracker table]</p>
        <p className="mt-2">Thank you for your time and consideration.</p>
        <p>We look forward to your feedback.</p>
      </div>
    </div>
  );
}
