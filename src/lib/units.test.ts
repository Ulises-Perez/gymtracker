import { describe, expect, it } from 'vitest';

import { formatWeight, toDisplayWeight, toStoredKg } from './units.ts';

/**
 * The rule the whole module exists for is the one the last test pins: what a user types in pounds
 * becomes kilos before anything stores it. Without that, switching the unit back would rewrite the
 * history of everyone who had ever used the other one.
 */
describe('converting between kilos and pounds', () => {
  it('leaves kilos alone, in both directions', () => {
    expect(toDisplayWeight(72.5, 'kg')).toBe(72.5);
    expect(toStoredKg(72.5, 'kg')).toBe(72.5);
  });

  it('converts to pounds for a screen that is showing them', () => {
    // 100 / 0.45359237 = 220.462…
    expect(toDisplayWeight(100, 'lb')).toBeCloseTo(220.46, 2);
  });

  it('converts back to kilos for something the user typed in pounds', () => {
    // 160 lb is 72.5747792 kg, and that is what gets stored.
    expect(toStoredKg(160, 'lb')).toBeCloseTo(72.5748, 4);
  });

  it('survives the round trip within the precision of the column', () => {
    /*
     * `weight_kg` is `DECIMAL(6,2)`, so a value typed in pounds comes back through two decimal places
     * of kilos. That is a drift of under a hundredth of a pound — the column's limit and not this
     * conversion's — and it is asserted rather than assumed so nobody later "fixes" the rounding by
     * storing pounds.
     */
    const typedInPounds = 160;
    const stored = Math.round(toStoredKg(typedInPounds, 'lb') * 100) / 100;

    expect(toDisplayWeight(stored, 'lb')).toBeCloseTo(typedInPounds, 1);
  });

  it('says which unit the number is in, always', () => {
    // A bare "160" on a screen is a number the user has to guess about.
    expect(formatWeight(72.5, 'kg')).toBe('72,5 kg');
    expect(formatWeight(72.5, 'lb')).toBe('159,8 lb');
  });
});
