import { useQuery } from '@tanstack/react-query';

import { fetchProfileStats } from '../lib/profile-api.ts';
import { useDashboard } from './useDashboard.ts';

/**
 * The figures the profile shows, from the reads that already answer them.
 *
 * `totalWorkouts` is taken from `dashboard_summary()` — the read the Home screen already makes — rather
 * than counted a second time, which is what the phase decided. The key is the dashboard's own, so the
 * value is shared with Home and a workout that lands marks it stale once for both.
 *
 * The other two need a read of their own. `dashboard_summary()` returns the streak that ends today, and
 * "best" is over the whole history; `recent_prs` comes back capped at five, so it cannot say how many
 * records there are. Both are derived from rows the database already holds, and neither is a column.
 *
 * Disabled rather than sent with an empty id, like every read behind the auth gate: an empty id means
 * the gate has not resolved yet, and a request keyed by it can only be refused.
 */
export function useProfileStats(userId: string) {
  const dashboard = useDashboard(userId);

  const stats = useQuery({
    queryKey: ['profile-stats', userId],
    queryFn: () => fetchProfileStats(userId),
    enabled: userId !== '',
  });

  return {
    // The summary's own field name, because the schema parses it as the function returned it:
    // `total_workouts`, not a camelCase this side invents.
    totalWorkouts: dashboard.data?.total_workouts,
    bestStreak: stats.data?.bestStreak,
    totalPrs: stats.data?.totalPrs,
    /**
     * Whether the derived read failed. The dashboard read is not folded in here: its failure blanks
     * `totalWorkouts` to a dash while the other two may still be known, and one screen saying
     * "could not load" next to two figures it did load would contradict itself.
     */
    isError: stats.isError,
  };
}
