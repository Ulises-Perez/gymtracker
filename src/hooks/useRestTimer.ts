import { useCallback, useEffect, useState } from 'react';

/**
 * The rest timer between sets.
 *
 * The countdown is **derived from an end timestamp**, never accumulated by ticks.
 * iOS freezes timers in a backgrounded tab, so a countdown that decremented itself
 * would come back frozen and a two-minute rest would still show two minutes after
 * ten. The interval below does nothing but force a re-render; the number always
 * comes from the clock.
 *
 * Coming back is the other half of that: `visibilitychange` and `focus` re-read
 * the clock, so the display is right the instant the user looks at it instead of at
 * whatever tick happens next.
 */

export type RestTimer = {
  remainingMs: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
};

/** How often the display is refreshed while a rest is running. */
const TICK_MS = 250;

export function useRestTimer(seconds: number): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) {
      return;
    }

    const id = setInterval(() => {
      const current = Date.now();

      setNow(current);

      // The rest is over: stop the interval rather than leave it ticking for the
      // rest of the session. `remainingMs` is already clamped to zero, so clearing
      // the end timestamp changes nothing the user sees.
      if (current >= endsAt) {
        setEndsAt(null);
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [endsAt]);

  useEffect(() => {
    const syncNow = () => setNow(Date.now());

    document.addEventListener('visibilitychange', syncNow);
    window.addEventListener('focus', syncNow);

    return () => {
      document.removeEventListener('visibilitychange', syncNow);
      window.removeEventListener('focus', syncNow);
    };
  }, []);

  const start = useCallback(() => {
    const startedAt = Date.now();

    setNow(startedAt);
    setEndsAt(startedAt + seconds * 1000);
  }, [seconds]);

  const stop = useCallback(() => setEndsAt(null), []);

  const remainingMs = endsAt === null ? 0 : Math.max(0, endsAt - now);

  return {
    remainingMs,
    isRunning: endsAt !== null && remainingMs > 0,
    start,
    stop,
  };
}
