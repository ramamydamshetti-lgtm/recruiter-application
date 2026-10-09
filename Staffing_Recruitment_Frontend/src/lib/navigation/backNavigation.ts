/** Home route — no global back button. */
const HOME_PATH = '/my-work';

/** Top-level routes opened from the main sidebar — never show a back button. */
export const SIDEBAR_TOP_LEVEL_ROUTES = [
  '/my-work',
  '/requirements',
  '/candidates/new',
  '/submissions',
  '/interviews',
  '/reports',
  '/my-profile',
] as const;

/** Auth and landing routes — no app back control. */
const AUTH_AND_LANDING_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
]);

/** Exact routes that render their own back button (not matched by trailing-slash prefixes). */
const EXACT_PAGES_WITH_OWN_BACK = new Set(['/reports/generate', '/candidates']);

/** Nested routes that render their own back button in the page shell. */
const PREFIXES_WITH_OWN_BACK = [
  '/requirements/',
  '/submissions/',
  '/candidates/',
  '/clients/',
];

/** True when the page already renders a back control — GlobalBackNav must stay hidden. */
export function pageProvidesOwnBack(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (EXACT_PAGES_WITH_OWN_BACK.has(pathname)) return true;
  return PREFIXES_WITH_OWN_BACK.some((prefix) => pathname.startsWith(prefix));
}

export function isSidebarTopLevelRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (SIDEBAR_TOP_LEVEL_ROUTES as readonly string[]).includes(pathname);
}

type BackNavOptions = {
  /** @deprecated Sidebar top-level routes never show a back button. */
  viaSidebar?: boolean;
};

/** True on detail/child routes; false on sidebar home pages and auth screens. */
export function shouldShowBackButton(
  pathname: string | null | undefined,
  _options?: BackNavOptions,
): boolean {
  if (!pathname) return false;
  if (AUTH_AND_LANDING_ROUTES.has(pathname)) return false;
  if (isSidebarTopLevelRoute(pathname)) return false;
  return true;
}

export function shouldShowGlobalBack(
  pathname: string | null | undefined,
  options?: BackNavOptions,
): boolean {
  if (!pathname) return false;
  if (pathname === HOME_PATH) return false;
  if (!shouldShowBackButton(pathname, options)) return false;
  if (pageProvidesOwnBack(pathname)) return false;
  return true;
}

/** Use on pages that render their own back button (respects sidebar direct-nav hide). */
export function shouldShowPageBack(
  pathname: string | null | undefined,
  options?: BackNavOptions,
): boolean {
  if (!pageProvidesOwnBack(pathname)) return false;
  return shouldShowBackButton(pathname, options);
}

/** Sensible fallback when the user landed directly (no browser history). */
export function getBackFallback(pathname: string | null | undefined): string {
  if (!pathname) return HOME_PATH;
  if (pathname.startsWith('/reports')) return '/reports';
  if (pathname.startsWith('/requirements')) return '/requirements';
  if (pathname.startsWith('/submissions')) return '/submissions';
  if (pathname.startsWith('/interviews')) return '/interviews';
  if (pathname === '/candidates') return HOME_PATH;
  if (pathname.startsWith('/candidates/')) return '/candidates/new';
  if (pathname.startsWith('/clients')) return '/clients';
  if (pathname === '/my-profile') return HOME_PATH;
  return HOME_PATH;
}
