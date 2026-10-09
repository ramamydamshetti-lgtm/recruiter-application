'use client';

import { useEffect, useRef } from 'react';

/**
 * Soft refresh cadence for the command center. Prefer polling because SSE cannot attach Bearer tokens in browsers.
 * Optional EventSource could be added later with cookie auth or token query param.
 */
export function useRequirementOverviewLiveSync(opts: {
  enabled: boolean;
  pollMs?: number;
  onRefresh: () => void;
}) {
  const onRefresh = useRef(opts.onRefresh);
  onRefresh.current = opts.onRefresh;

  useEffect(() => {
    if (!opts.enabled) return;
    const ms = opts.pollMs ?? 30000;
    const id = window.setInterval(() => {
      onRefresh.current();
    }, ms);
    return () => window.clearInterval(id);
  }, [opts.enabled, opts.pollMs]);
}
