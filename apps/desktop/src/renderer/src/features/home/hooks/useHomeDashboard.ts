import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { HomeDashboardResponse } from '@vatrushka/shared';

import { getHomeDashboard } from '../api/getHomeDashboard';

const HOME_CACHE_PREFIX = 'vatrushka.home.dashboard.';

export function homeDashboardQueryKey(userId: string): readonly ['home-dashboard', string] {
  return ['home-dashboard', userId] as const;
}

function readCachedDashboard(userId: string): HomeDashboardResponse | undefined {
  try {
    const raw = localStorage.getItem(`${HOME_CACHE_PREFIX}${userId}`);
    if (raw === null) return undefined;
    const value = JSON.parse(raw) as Partial<HomeDashboardResponse>;
    if (value.user?.id !== userId || !Array.isArray(value.servers) || !Array.isArray(value.continueItems)) return undefined;
    return value as HomeDashboardResponse;
  } catch {
    return undefined;
  }
}

export function useHomeDashboard(userId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: homeDashboardQueryKey(userId ?? 'anonymous'),
    queryFn: getHomeDashboard,
    enabled: enabled && userId !== undefined,
    placeholderData: (previous) => userId === undefined ? previous : readCachedDashboard(userId) ?? previous,
    refetchInterval: enabled ? 15_000 : false,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (userId === undefined || query.data === undefined || query.data.user.id !== userId) return;
    try {
      localStorage.setItem(`${HOME_CACHE_PREFIX}${userId}`, JSON.stringify(query.data));
    } catch {
      // A full storage quota must not make Home unusable.
    }
  }, [query.data, userId]);

  return query;
}
