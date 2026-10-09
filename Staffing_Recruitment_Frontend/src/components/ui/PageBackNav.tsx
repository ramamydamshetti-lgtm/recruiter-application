'use client';

import { usePathname } from 'next/navigation';
import { BackButton, BackButtonRow } from '@/components/ui/BackButton';
import {
  getBackFallback,
  shouldShowBackButton,
  shouldShowPageBack,
} from '@/lib/navigation/backNavigation';
import { cn } from '@/lib/utils/cn';

type Props = {
  className?: string;
  label?: string;
};

/**
 * Back control for detail and child routes only.
 * Hidden on main sidebar destinations (My Work, Requirements, etc.).
 * Uses browser history when available; falls back to a sensible parent route.
 */
export function PageBackNav({ className = 'mb-3', label = 'Back' }: Props) {
  const pathname = usePathname();
  if (!shouldShowPageBack(pathname)) return null;

  return (
    <BackButtonRow className={cn(className)}>
      <BackButton fallbackHref={getBackFallback(pathname)} label={label} />
    </BackButtonRow>
  );
}

/** For rare pages that are not in PREFIXES_WITH_OWN_BACK but still need an in-page back control. */
export function ConditionalBackNav({ className = 'mb-3', label = 'Back' }: Props) {
  const pathname = usePathname();
  if (!shouldShowBackButton(pathname)) return null;

  return (
    <BackButtonRow className={cn(className)}>
      <BackButton fallbackHref={getBackFallback(pathname)} label={label} />
    </BackButtonRow>
  );
}
