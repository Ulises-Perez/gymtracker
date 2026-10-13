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
 * Folds a string for search: no accents, no case, no stray spaces.
 *
 * `fuse.js` matches characters, so it has no way to know that "extension" and
 * "Extensión" are the same word. The catalogue is Spanish and nobody types the
 * accent on a phone keyboard in the middle of a set, so the indexed names and the
 * query both go through here before they meet.
 *
 * NFD splits an accented letter into the letter plus a combining mark, and the
 * combining-marks block is what gets stripped. It is idempotent, so normalising an
 * already-normalised value is safe.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Today's calendar date, as the user would write it.
 *
 * Built from the local getters, never from `toISOString()`. The two look
 * interchangeable and are not: the UTC date of a 22:00 session in Argentina is
 * tomorrow, so the workout would be filed under the wrong day. The mistake shows
 * up only in the evening and only west of UTC, which is the worst way for a bug
 * to behave.
 */
export function localIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Parses what someone typed into a numeric field.
 *
 * The decimal comma is the reason this exists at all: weights are written "72,5"
 * in Argentina, and a `type="number"` input **refuses a comma outright** — it
 * reports an empty value — so the set fields are text inputs with
 * `inputMode="decimal"` and the parsing happens here instead of in the browser.
 *
 * An empty field is `null`, never 0: `Number('')` is 0, which would quietly turn a
 * field the user skipped into a 0 kg set. A half-typed "72," parses as 72 so the
 * value stays usable while the user is still typing; it is the caller's business
 * whether that intermediate value is committed.
 */
export function parseDecimalInput(value: string): number | null {
  // Only the first comma: nobody types thousands separators into a set field.
  const cleaned = value.trim().replace(',', '.');

  if (cleaned === '') {
    return null;
  }

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
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
