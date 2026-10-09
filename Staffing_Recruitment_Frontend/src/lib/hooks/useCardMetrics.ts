'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchCardMetrics,
  type CardMetricsPayload,
  type CardMetricsScope,
} from '@/lib/api/metrics';
import { AUTH_SESSION_CHANGED, AUTH_SESSION_CLEARED } from '@/lib/auth/session';

type Options = {
  recruiterId?: string;
  requirementId?: string;
  enabled?: boolean;
};

export function useCardMetrics(scopes: CardMetricsScope[], options?: Options) {
  const enabled = options?.enabled !== false;
  const scopeKey = scopes.join(',');
  const recruiterId = options?.recruiterId?.trim() ?? '';
  const requirementId = options?.requirementId?.trim() ?? '';

  const [data, setData] = useState<CardMetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const scopeList = scopeKey.split(',').filter(Boolean) as CardMetricsScope[];
      const payload = await fetchCardMetrics(scopeList, {
        recruiterId: recruiterId || undefined,
        requirementId: requirementId || undefined,
      });
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, scopeKey, recruiterId, requirementId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => void refresh();
    const onCleared = () => {
      setData(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_SESSION_CHANGED, onChanged);
    window.addEventListener(AUTH_SESSION_CLEARED, onCleared);
    window.addEventListener('requirements-assignment-changed', onChanged);
    window.addEventListener('app-metrics-refresh', onChanged);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED, onChanged);
      window.removeEventListener(AUTH_SESSION_CLEARED, onCleared);
      window.removeEventListener('requirements-assignment-changed', onChanged);
      window.removeEventListener('app-metrics-refresh', onChanged);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
