import { dashboardSummarySchema } from '../schemas/dashboard.ts';
import type { DashboardSummary } from '../schemas/dashboard.ts';
import { getSupabase } from './supabase.ts';

/**
 * The whole dashboard, in one call.
 *
 * One call and not five: the greeting, the week, the streak, the records and the last workout all
 * come from `dashboard_summary()`, which the database has had since phase 1. Five separate reads would
 * be five round trips on the connection this app is built for — a phone, often a bad one — and they
 * could disagree with each other, since each would see a different moment.
 *
 * The function is `SECURITY DEFINER` and scopes everything to `auth.uid()` itself, so there is no user
 * id to pass and nothing to filter here.
 */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const supabase = await getSupabase();

  const { data, error } = await supabase.rpc('dashboard_summary');

  if (error) {
    throw error;
  }

  // Parsed, not cast: this is where a summary that changed shape is stopped, instead of reaching the
  // screen as an `undefined` in the middle of a sentence.
  return dashboardSummarySchema.parse(data);
}
