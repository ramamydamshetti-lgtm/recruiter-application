'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  clearNavViaSidebarForPath,
  isNavViaSidebarForPath,
} from '@/lib/navigation/navigationSource';

/** Whether the current page was opened via a sidebar navigation click. */
export function useNavViaSidebar(): boolean {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const viaSidebar = useRef(false);

  if (lastPath.current !== pathname) {
    lastPath.current = pathname;
    viaSidebar.current = pathname ? isNavViaSidebarForPath(pathname) : false;
  }

  useEffect(() => {
    if (pathname) {
      clearNavViaSidebarForPath(pathname);
    }
  }, [pathname]);

  return viaSidebar.current;
}
