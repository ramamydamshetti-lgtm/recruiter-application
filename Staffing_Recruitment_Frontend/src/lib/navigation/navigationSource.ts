const SIDEBAR_NAV_KEY = 'app-nav-via-sidebar-target';

/** Call from sidebar links with the destination href before route change. */
export function markNavViaSidebar(targetHref: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SIDEBAR_NAV_KEY, targetHref);
}

/** Check whether the current route was opened via sidebar (non-destructive read). */
export function isNavViaSidebarForPath(pathname: string): boolean {
  if (typeof window === 'undefined') return false;
  const target = sessionStorage.getItem(SIDEBAR_NAV_KEY);
  return Boolean(target && target === pathname);
}

/** Clear the sidebar flag after all components have read it for this route. */
export function clearNavViaSidebarForPath(pathname: string): void {
  if (typeof window === 'undefined') return;
  const target = sessionStorage.getItem(SIDEBAR_NAV_KEY);
  if (target === pathname) {
    sessionStorage.removeItem(SIDEBAR_NAV_KEY);
  }
}
