'use client';

import { usePathname } from 'next/navigation';
import { BackButton, BackButtonRow } from '@/components/ui/BackButton';
import { getBackFallback, shouldShowGlobalBack } from '@/lib/navigation/backNavigation';

/**
 * App-wide back control for list/dashboard pages.
 * Detail pages keep their own in-page BackButton to avoid duplicates.
 */
export function GlobalBackNav() {
  const pathname = usePathname();

  if (!shouldShowGlobalBack(pathname)) {
    return null;
  }

  return (
    <BackButtonRow className="mb-5">
      <BackButton fallbackHref={getBackFallback(pathname)} label="Back" />
    </BackButtonRow>
  );
}
