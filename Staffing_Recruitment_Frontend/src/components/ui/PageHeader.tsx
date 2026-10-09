import React from 'react';
import { BackButton, BackButtonRow } from '@/components/ui/BackButton';

export function PageHeader({
  title,
  subtitle,
  right,
  showBack,
  backFallback = '/my-work',
  backLabel = 'Back',
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Optional in-page back (detail pages). List pages use GlobalBackNav in AppShell. */
  showBack?: boolean;
  backFallback?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {showBack ? (
          <BackButtonRow className="mb-3">
            <BackButton fallbackHref={backFallback} label={backLabel} />
          </BackButtonRow>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-zinc-50">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="flex items-center gap-3">{right}</div> : null}
    </div>
  );
}
