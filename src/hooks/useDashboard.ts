import { useQuery } from '@tanstack/react-query';

import { fetchDashboardSummary } from '../lib/dashboard-api.ts';
import { localIsoDate } from '../lib/utils.ts';

/**
 * The dashboard, from the one call that paints it.
 *
 * The user id is in the key even though the read takes no argument — the function scopes itself with
 * `auth.uid()`. The cache outlives the session, and on a shared device the second account must not be
 * served the first one's streak, which is exactly what a key without an owner would do.
 *
 * The local day is in the key too: the summary is about "today" and "this week", and a tab left open
 * across midnight must not keep answering about yesterday. The day is read from the local clock and
 * passed to the RPC, because the server's date is UTC.
 *
 * Disabled with an empty id, like the catalogue and the history: this screen is behind the auth gate,
 * so an empty id means the gate has not resolved yet.
 */
export function useDashboard(userId: string) {
  const today = localIsoDate();

  return useQuery({
    queryKey: ['dashboard', userId, today],
    queryFn: () => fetchDashboardSummary(today),
    enabled: userId !== '',
  });
}
