import type { NewPersonalRecord } from '../../schemas/workout.ts';

/**
 * The new marks the server found, said back to the user.
 *
 * This is the one thing in a session the user cannot work out for themselves: the
 * comparison against their own stored records happens inside `save_workout`, in the same
 * transaction that writes the sets. So the screen's whole job here is to say it back in
 * Spanish without inventing anything — least of all a previous mark where there was none.
 */

type PersonalRecordsProps = {
  records: NewPersonalRecord[];
  /** Exercise names by id. The result carries only the id, as everywhere else. */
  names: Map<string, string>;
  onDismiss: () => void;
};

export function PersonalRecords({ records, names, onDismiss }: PersonalRecordsProps) {
  if (records.length === 0) {
    return null;
  }

  return (
    <section
      // A live region, because it appears after the user acts and nothing moved them
      // there: the session ends and the news arrives.
      role="status"
      aria-label="Récords nuevos"
      className="pr-arrive ring-primary/40 mt-6 rounded-md p-4 ring-1"
    >
      <h2 className="text-lg font-semibold">🎉 Récords nuevos</h2>

      <ul className="mt-2 space-y-2">
        {records.map((record, index) => (
          /*
           * Keyed by position and not by the exercise, because the same lift appears more than
           * once: every set that beat the previous best is a record, so one session can return a
           * ladder for a single exercise. Keying by the id collided, and React said so the moment
           * a real browser produced three records for Press Banca. The index is safe here because
           * the list is rendered once and is never reordered or filtered.
           */
          <li key={index}>
            <span className="font-medium">{names.get(record.exercise_id) ?? 'Ejercicio'}</span>
            <span className="text-muted block text-sm">{comparison(record)}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onDismiss}
        className="ring-white/15 hover:bg-bg mt-3 min-h-12 w-full rounded-md px-4 ring-1"
      >
        Listo
      </button>
    </section>
  );
}

/**
 * A first-ever record arrives with no previous mark, so the sentence changes shape instead
 * of comparing against a number nobody lifted. Printing "0.0 kg" would be a claim, not a
 * formatting slip.
 *
 * Both absences are checked because the schema declares the field `nullish`: a key that is
 * there and null and a key that never arrived mean the same thing here, and testing only
 * for null would let the second one reach `toFixed`.
 */
function comparison(record: NewPersonalRecord): string {
  const previous = record.old_1rm;

  if (previous === null || previous === undefined) {
    return `primera marca: ${kg(record.new_1rm)} de 1RM`;
  }

  return `antes ${kg(previous)} → ${kg(record.new_1rm)} de 1RM`;
}

/**
 * One decimal: that is what the column holds, and it is the smallest change a pair of
 * plates can actually make.
 */
function kg(value: number): string {
  return `${value.toFixed(1)} kg`;
}
