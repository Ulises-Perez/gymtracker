import { useState } from 'react';

import { toCsv } from '../lib/csv.ts';
import { downloadCsv, exportFileName } from '../lib/download.ts';
import { fetchAllWorkouts } from '../lib/export-api.ts';

/**
 * The export action: read the whole history, turn it into a file, hand it to the browser.
 *
 * It is an action and not a query because it is not cached state — the file is written once and the
 * data behind it is not rendered anywhere. The read itself is `fetchAllWorkouts`, which pages to the
 * end; this hook only owns the two things a button needs: whether it is running and what to say in
 * Spanish when it fails.
 *
 * The pending shape is the one the screen already uses for signing out — a local flag, the label as
 * the indicator, `disabled` and `aria-busy` on the control — rather than a spinner, which the plan
 * forbids.
 */

export const EXPORT_ERROR = 'No pudimos exportar el historial. Probá de nuevo.';

export function useExportWorkouts(userId: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportWorkouts = async () => {
    setError(null);
    setPending(true);

    try {
      const workouts = await fetchAllWorkouts(userId);

      downloadCsv(exportFileName(), toCsv(workouts));
    } catch {
      /*
       * A failed read downloads nothing at all. Falling back to an empty file would be worse than an
       * error: a header-only CSV looks exactly like a user with no history.
       */
      setError(EXPORT_ERROR);
    } finally {
      setPending(false);
    }
  };

  return { pending, error, exportWorkouts };
}
