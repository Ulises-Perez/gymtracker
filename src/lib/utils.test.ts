import { describe, expect, it, vi } from 'vitest';
import {
  kgToLb,
  lbToKg,
  localIsoDate,
  normalizeForSearch,
  parseDecimalInput,
  toNumber,
} from './utils';

describe('toNumber', () => {
  it('parses the DECIMAL strings returned by supabase-js', () => {
    expect(toNumber('72.50')).toBe(72.5);
    expect(toNumber('0.00')).toBe(0);
    expect(toNumber('1234.56')).toBe(1234.56);
  });

  it('passes numbers through unchanged', () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-40)).toBe(-40);
  });

  it('defaults nullish and unparseable input to zero', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('')).toBe(0);
    expect(toNumber('not-a-number')).toBe(0);
  });

  it('adds instead of concatenating when summing DECIMAL strings', () => {
    const weights: string[] = ['72.50', '80.25'];
    const total = weights.reduce((sum, weight) => sum + toNumber(weight), 0);

    expect(total).toBe(152.75);
  });
});

describe('kg/lb conversion', () => {
  it('converts 100 kg to 220.462 lb', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
  });

  it('round trips within a small epsilon', () => {
    expect(lbToKg(kgToLb(70))).toBeCloseTo(70, 10);
    expect(kgToLb(lbToKg(154.324))).toBeCloseTo(154.324, 10);
  });
});

describe('localIsoDate', () => {
  /*
   * The date a workout belongs to is the one on the user's wall clock, not the
   * UTC instant. `new Date().toISOString().slice(0, 10)` looks equivalent and is
   * not: in Argentina a 22:00 session would be filed under tomorrow's date, and
   * the mistake only shows up in the evening and only west of UTC.
   */
  it('reads the calendar date from the local clock', () => {
    // Built from local components, so the expectation holds in every timezone.
    expect(localIsoDate(new Date(2026, 9, 13, 22, 0))).toBe('2026-10-13');
  });

  it('pads single-digit months and days', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05');
  });

  it('keeps a late-December local date in its own year', () => {
    expect(localIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('defaults to now', () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date(2026, 9, 13, 8, 0));

      expect(localIsoDate()).toBe('2026-10-13');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('normalizeForSearch', () => {
  /*
   * Foldea acentos y mayúsculas para que la búsqueda del catálogo no dependa de
   * que el usuario escriba las tildes. Nadie busca "Extensión en Polea" con
   * tilde en un teclado de teléfono a mitad de una serie.
   */
  it('strips the accents', () => {
    expect(normalizeForSearch('Extensión en Polea')).toBe('extension en polea');
    expect(normalizeForSearch('Pájaros')).toBe('pajaros');
    expect(normalizeForSearch('Cuádriceps')).toBe('cuadriceps');
  });

  it('lowercases and trims', () => {
    expect(normalizeForSearch('  Press Banca  ')).toBe('press banca');
  });

  it('is idempotent, so a normalized value can be normalized again', () => {
    const once = normalizeForSearch('Búlgaro');

    expect(normalizeForSearch(once)).toBe(once);
  });

  it('leaves text without accents alone', () => {
    expect(normalizeForSearch('Sentadilla')).toBe('sentadilla');
  });
});

describe('parseDecimalInput', () => {
  /*
   * Los pesos en Argentina se escriben con coma: "72,5". Un input
   * `type="number"` **rechaza la coma** (el valor queda vacío), así que estos
   * campos son de texto con `inputMode="decimal"` y el parseo vive acá.
   */
  it('accepts the decimal comma', () => {
    expect(parseDecimalInput('72,5')).toBe(72.5);
    expect(parseDecimalInput('0,25')).toBe(0.25);
  });

  it('accepts a decimal point too', () => {
    expect(parseDecimalInput('72.5')).toBe(72.5);
  });

  it('parses whole numbers', () => {
    expect(parseDecimalInput('10')).toBe(10);
    expect(parseDecimalInput('0')).toBe(0);
  });

  it('treats an empty field as "no value", not as zero', () => {
    // `Number('')` is 0, which would silently turn a skipped field into a 0 kg
    // set — the difference between "not filled in" and "lifted nothing".
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('   ')).toBeNull();
  });

  it('keeps a half-typed number usable while the user is still typing', () => {
    expect(parseDecimalInput('72,')).toBe(72);
  });

  it('returns null for what is not a number', () => {
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('7a')).toBeNull();
  });
});
