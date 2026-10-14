/**
 * Kilos, pounds, and the one rule that matters about them.
 *
 * Everything stored is kilos. The preferred unit is a display choice, and S9 states it more strongly
 * than that: "cambiar kg/lb **no altera ningún dato histórico**". So a weight is converted on the way
 * out to the screen and converted back on the way in from the keyboard, and nothing in between. A
 * screen that stored what the user typed while they were in pounds would rewrite history the moment
 * they switched back.
 */

export type WeightUnit = 'kg' | 'lb';

/**
 * One pound is exactly 0.45359237 kg — by definition, not by measurement — so this is a conversion
 * and not an approximation of one.
 */
const KG_PER_POUND = 0.45359237;

/** What to show, for a weight that is stored in kilos. */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_POUND;
}

/**
 * What to store, for a weight the user typed in their own unit.
 *
 * The result is not rounded here. The column is `DECIMAL(6,2)`, so the database settles the precision
 * where it belongs — and rounding twice is how a conversion starts to drift.
 */
export function toStoredKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_POUND;
}

/** "72.5 kg" / "160.0 lb", with the unit spelled out so a number is never ambiguous. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${toDisplayWeight(kg, unit).toFixed(1)} ${unit}`;
}
