import { describe, expect, it, vi } from 'vitest';
import { newId } from './ids.ts';

describe('newId', () => {
  it('generates a UUID version 7', () => {
    const id = newId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()));

    expect(ids.size).toBe(500);
  });

  it('sorts lexicographically in creation order', () => {
    // Time-ordered ids are the whole point: they keep index inserts local and
    // let offline records sort by creation without a server timestamp.
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const first = newId();

      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
      const second = newId();

      vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
      const third = newId();

      const sorted = [third, first, second].sort();

      expect(sorted).toEqual([first, second, third]);
    } finally {
      vi.useRealTimers();
    }
  });
});
