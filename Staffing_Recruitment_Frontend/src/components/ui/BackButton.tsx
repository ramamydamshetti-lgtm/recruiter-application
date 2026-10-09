'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Variant = 'subtle' | 'solid' | 'outline' | 'pill';

type Props = {
  /** Fallback route when there is no browser history (direct landing). */
  fallbackHref?: string;
  /** Override the label. Defaults to "Back". */
  label?: string;
  className?: string;
  /** @deprecated All variants render the same pill style for a consistent app-wide back control. */
  variant?: Variant;
};

/** Left-aligned row wrapper for back navigation. */
export function BackButtonRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex w-full items-center justify-start', className)}>{children}</div>
  );
}

/**
 * Smart back button: prefers browser history (`router.back()`) so users return
 * to the page they actually came from. Falls back to `fallbackHref` (or `/`)
 * when the route was opened directly (e.g. shared link / new tab).
 */
export function BackButton({
  fallbackHref = '/',
  label = 'Back',
  className,
}: Props) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300',
        className,
      )}
      aria-label={label}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:bg-indigo-900/50 dark:group-hover:text-indigo-300">
        <ArrowLeft className="h-4 w-4" />
      </span>
      {label}
    </button>
  );
}
