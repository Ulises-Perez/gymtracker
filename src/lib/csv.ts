/**
 * The CSV the export writes, and the rules that make it readable in a spreadsheet.
 *
 * This module is pure on purpose: no DOM, no Supabase, no formatting that needs a locale. The file is
 * **data and not a screen** — it is read months later and possibly by something that is not the app —
 * so every decision it carries (the header, the separator, the escaping, the row order) lives where
 * it can be tested for the price of a string comparison.
 *
 * The column names are the database's own. A file that is data should name its columns the way the
 * data is stored, and `weight_kg` is the one the rule names: regardless of how the user prefers to
 * read weights, the export is always kilos.
 */

/** The header row, in order. Tests and the exporter share it so it cannot drift apart. */
export const CSV_HEADER = [
  'date',
  'title',
  'duration_minutes',
  'exercise',
  'set_number',
  'reps',
  'weight_kg',
  'rpe',
  'is_warmup',
  'notes',
  'target_reps',
  'target_weight_min',
  'target_weight_max',
] as const;

/** The field separator: the Argentine spreadsheet convention, and no collision with a decimal comma. */
export const CSV_SEPARATOR = ';';

/**
 * UTF-8 with a byte-order mark.
 *
 * Without it a spreadsheet guesses the encoding and shows `Ã±` where the accents should be; with it
 * the first cell of every export is a BOM that every reader treats as a mark and not as data.
 */
export const CSV_BOM = '\uFEFF';

/** Row terminator, as RFC 4180 writes it. */
const CRLF = '\r\n';

export type CsvSet = {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  isWarmup: boolean;
  notes: string | null;
};

export type CsvExercise = {
  name: string;
  targetReps: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
  sets: CsvSet[];
};

export type CsvWorkout = {
  date: string;
  title: string | null;
  durationMinutes: number | null;
  exercises: CsvExercise[];
};

/**
 * Quotes a field only when it has to be quoted, and doubles the quotes inside.
 *
 * RFC 4180: a field carrying the separator, a quote or a line break is wrapped in quotes, and a quote
 * inside it is escaped by doubling. The separator here is `;`, so a comma in a title is free and a
 * semicolon is not — the reverse of the English convention, and the reason this is a rule and not an
 * accident.
 */
export function escapeCsvField(value: string): string {
  const mustQuote =
    value.includes(CSV_SEPARATOR) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');

  return mustQuote ? `"${value.replaceAll('"', '""')}"` : value;
}

/** A number as written in the file: plain, with a dot, or empty when there is nothing to write. */
function number(value: number | null): string {
  return value === null ? '' : String(value);
}

function text(value: string | null): string {
  return value === null ? '' : escapeCsvField(value);
}

/** One set, with the workout and exercise it belongs to repeated on the row. */
function setLine(workout: CsvWorkout, exercise: CsvExercise, set: CsvSet): string {
  return [
    text(workout.date),
    text(workout.title),
    number(workout.durationMinutes),
    text(exercise.name),
    String(set.setNumber),
    number(set.reps),
    number(set.weightKg),
    number(set.rpe),
    set.isWarmup ? 'true' : 'false',
    text(set.notes),
    number(exercise.targetReps),
    number(exercise.targetWeightMin),
    number(exercise.targetWeightMax),
  ].join(CSV_SEPARATOR);
}

/**
 * An exercise that has a target but no sets still gets a row, so its target is not lost; the set
 * columns stay empty. It is the same reason a workout with nothing logged against it is not dropped:
 * the export is a record of the user's data, and quietly leaving a piece out would be a lie about it.
 */
function emptySetLine(workout: CsvWorkout, exercise: CsvExercise): string {
  return [
    text(workout.date),
    text(workout.title),
    number(workout.durationMinutes),
    text(exercise.name),
    '',
    '',
    '',
    '',
    '',
    '',
    number(exercise.targetReps),
    number(exercise.targetWeightMin),
    number(exercise.targetWeightMax),
  ].join(CSV_SEPARATOR);
}

/** A workout with no exercises at all: the session happened and keeps its date, title and duration. */
function sessionOnlyLine(workout: CsvWorkout): string {
  return [
    text(workout.date),
    text(workout.title),
    number(workout.durationMinutes),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ].join(CSV_SEPARATOR);
}

/**
 * The whole file.
 *
 * One row per set. The workouts and, inside each one, the exercises come in the order the caller
 * handed them over — for the export that is the card order, the order the session had — and the sets
 * of each exercise go by set number, so the file is deterministic even when the query returned the
 * sets out of order. The header comes first and the byte-order mark before everything.
 */
export function toCsv(workouts: CsvWorkout[]): string {
  const lines: string[] = [CSV_HEADER.join(CSV_SEPARATOR)];

  for (const workout of workouts) {
    if (workout.exercises.length === 0) {
      lines.push(sessionOnlyLine(workout));

      continue;
    }

    for (const exercise of workout.exercises) {
      if (exercise.sets.length === 0) {
        lines.push(emptySetLine(workout, exercise));

        continue;
      }

      const sets = [...exercise.sets].sort((left, right) => left.setNumber - right.setNumber);

      for (const set of sets) {
        lines.push(setLine(workout, exercise, set));
      }
    }
  }

  return CSV_BOM + lines.join(CRLF) + CRLF;
}
