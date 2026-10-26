/**
 * Load one admin API resource: token, loading and error state, reload. Optionally
 * refreshes on an interval while the screen is focused (the overview does, every 20 s).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { firstError } from '@/services/admin.api';
import type { ApiResult } from '@/services/gate.api';

export function useAdminData<T>(
  fetcher: (idToken: string) => Promise<ApiResult<T>>,
  deps: unknown[],
  options: { refreshMs?: number } = {}
) {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current(await getIdToken());
      if (result.success && result.data !== undefined) setData(result.data);
      else setError(firstError(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getIdToken, ...deps]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      if (!options.refreshMs) return undefined;
      const timer = setInterval(() => void reload(), options.refreshMs);
      return () => clearInterval(timer);
    }, [reload, options.refreshMs])
  );

  return { data, setData, loading, error, reload };
}
