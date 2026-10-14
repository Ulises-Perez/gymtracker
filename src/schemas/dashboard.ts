import { z } from 'zod';

/**
 * The contract of `dashboard_summary()`, in `src/lib`.
 *
 * The generated `Database` type sees this function's result as opaque `Json`, so this schema — not
 * the generated types — is what holds the SQL and the screen together. It is the same situation as
 * `save_workout`'s payload, and it is why the shape is written down twice on purpose: once where it
 * is built, and once where it is read.
 *
 * On the numbers: the aggregates inside the JSON are `DECIMAL`, and they reach the client as strings
 * like every other `DECIMAL` in this project (A5). `z.coerce.number()` accepts either, so the screen
 * gets numbers to format without a conversion hiding in a component.
 *
 * `last_workout` is nullable because a user with no workouts has none, and that is an everyday state
 * rather than an error — the day someone signs up.
 */
export const recentPrSchema = z.object({
  exercise_id: z.uuid(),
  // The name comes with the summary so the dashboard does not have to resolve it against the
  // catalogue, which is a screen away and may not be loaded.
  exercise_name: z.string(),
  best_1rm: z.coerce.number().nullish(),
  max_weight_kg: z.coerce.number().nullish(),
  max_reps: z.number().int().nullish(),
  achieved_at: z.iso.date(),
});

export const lastWorkoutSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  title: z.string().nullish(),
  duration_minutes: z.number().int().nullish(),
  exercise_count: z.number().int(),
});

export const dashboardSummarySchema = z.object({
  streak: z.number().int().nonnegative(),
  /** The days of the current week that have a workout, as `YYYY-MM-DD`. */
  week_days: z.array(z.iso.date()),
  /** The five most recent records, newest first. */
  recent_prs: z.array(recentPrSchema),
  last_workout: lastWorkoutSchema.nullish(),
  total_workouts: z.number().int().nonnegative(),
});

export type RecentPr = z.infer<typeof recentPrSchema>;
export type LastWorkout = z.infer<typeof lastWorkoutSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
