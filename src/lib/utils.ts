const KG_PER_LB = 2.20462;

/** Kilograms to pounds. Display only: storage is always kg. */
export function kgToLb(kg: number): number {
  return kg * KG_PER_LB;
}

/** Pounds to kilograms. Display only: storage is always kg. */
export function lbToKg(lb: number): number {
  return lb / KG_PER_LB;
}

/**
 * Single sanctioned conversion point for Postgres `DECIMAL` columns.
 *
 * `supabase-js` returns numeric/decimal columns as strings, so arithmetic on a
 * raw `weight_kg`, `best_1rm` or `total_volume` silently concatenates instead of
 * summing. Every read of a DECIMAL column must go through here.
 */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
}
