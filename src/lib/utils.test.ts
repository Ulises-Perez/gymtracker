import { describe, expect, it } from 'vitest';
import { kgToLb, lbToKg, toNumber } from './utils';

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
