import { useQuery } from '@tanstack/react-query';

import { fetchDashboardSummary } from '../lib/dashboard-api.ts';

/**
 * The dashboard, from the one call that paints it.
 *
 * The user id is in the key even though the read takes no argument — the function scopes itself with
 * `auth.uid()`. The cache outlives the session, and on a shared device the second account must not be
 * served the first one's streak, which is exactly what a key without an owner would do.
 *
 * Disabled with an empty id, like the catalogue and the history: this screen is behind the auth gate,
 * so an empty id means the gate has not resolved yet.
 */
export function useDashboard(userId: string) {
  return useQuery({
    queryKey: ['dashboard', userId],
    queryFn: fetchDashboardSummary,
    enabled: userId !== '',
  });
}
