import { describe, expect, it } from 'vitest';

import { CSV_HEADER, escapeCsvField, toCsv } from './csv.ts';
import type { CsvWorkout } from './csv.ts';

/**
 * The exported file is **data and not a screen**: it is read in a spreadsheet, months later, and
 * possibly by something that is not the app. Everything that makes it readable lives here, in a
 * module with no DOM and no Supabase, so the escaping and the row order are cheap to test.
 */

const EMPTY_TARGET = { targetReps: null, targetWeightMin: null, targetWeightMax: null };

function workout(overrides: Partial<CsvWorkout> = {}): CsvWorkout {
  return {
    date: '2026-10-14',
    title: 'Piernas',
    durationMinutes: 52,
    exercises: [],
    ...overrides,
  };
}

/** The rows without the byte-order mark and without the trailing terminator. */
function lines(csv: string): string[] {
  const rows = csv.replace(/^\uFEFF/, '').split('\r\n');

  if (rows.at(-1) === '') {
    rows.pop();
  }

  return rows;
}

/**
 * A row spelled out field by field, in the header's order: date, title, duration, exercise,
 * set_number, reps, weight_kg, rpe, is_warmup, notes, target_reps, target_weight_min,
 * target_weight_max.
 */
function row(fields: string[]): string {
  return fields.join(';');
}

describe('escapeCsvField', () => {
  it('quotes a field that carries the separator, a quote or a newline, and doubles the quotes', () => {
    // RFC 4180: a quote inside a quoted field is escaped by doubling it, and the field that carries
    // the separator has to be quoted or the column boundary moves and the whole row shifts.
    expect(escapeCsvField('Día; de "piernas"\ny algo más')).toBe(
      '"Día; de ""piernas""\ny algo más"',
    );
    expect(escapeCsvField('Piernas')).toBe('Piernas');
    expect(escapeCsvField('')).toBe('');
  });

  /**
   * A cell that starts with a formula character is a program to a spreadsheet. The file is
   * data, and it can be opened by someone who never typed the string — the title travels
   * through the session, and a shared device is one of the app's own scenarios.
   */
  it('neutralises a cell a spreadsheet would run as a formula', () => {
    expect(escapeCsvField('=1+1')).toBe("'=1+1");
    expect(escapeCsvField('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
    expect(escapeCsvField('-1+1')).toBe("'-1+1");
    expect(escapeCsvField('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
  });

  it('keeps the neutralising apostrophe inside the quotes when the field also needs them', () => {
    expect(escapeCsvField('=1+1;echo')).toBe('"\'=1+1;echo"');
  });
});

describe('toCsv', () => {
  it('starts with a byte-order mark so a spreadsheet shows the accents instead of mojibake', () => {
    expect(toCsv([workout()]).startsWith('\uFEFF')).toBe(true);
  });

  it('writes the documented header first, in order', () => {
    expect(lines(toCsv([workout()]))[0]).toBe(CSV_HEADER.join(';'));
    expect(CSV_HEADER).toEqual([
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
    ]);
  });

  it('writes one row per set, with the workout repeated on each row', () => {
    const csv = toCsv([
      workout({
        exercises: [
          {
            name: 'Sentadilla',
            ...EMPTY_TARGET,
            sets: [
              { setNumber: 1, reps: 5, weightKg: 100, rpe: 8, isWarmup: false, notes: null },
              {
                setNumber: 2,
                reps: 5,
                weightKg: 102.5,
                rpe: null,
                isWarmup: true,
                notes: 'espalda recta',
              },
            ],
          },
        ],
      }),
    ]);

    expect(lines(csv)).toEqual([
      CSV_HEADER.join(';'),
      row([
        '2026-10-14',
        'Piernas',
        '52',
        'Sentadilla',
        '1',
        '5',
        '100',
        '8',
        'false',
        '',
        '',
        '',
        '',
      ]),
      row([
        '2026-10-14',
        'Piernas',
        '52',
        'Sentadilla',
        '2',
        '5',
        '102.5',
        '',
        'true',
        'espalda recta',
        '',
        '',
        '',
      ]),
    ]);
  });

  it('shows a workout without sets with its set columns empty instead of dropping it', () => {
    const csv = toCsv([workout({ title: 'Día suelto', durationMinutes: 30 })]);

    // Dropping it would be a lie about the user's data: the session happened even if nothing was
    // logged against it, so it keeps its date, title and duration and leaves the set columns blank.
    expect(lines(csv)[1]).toBe(
      row(['2026-10-14', 'Día suelto', '30', '', '', '', '', '', '', '', '', '', '']),
    );
  });

  it('keeps an exercise with a target but no sets, so the target is not lost', () => {
    const csv = toCsv([
      workout({
        exercises: [
          {
            name: 'Press banca',
            targetReps: 10,
            targetWeightMin: 60,
            targetWeightMax: 80,
            sets: [],
          },
        ],
      }),
    ]);

    expect(lines(csv)[1]).toBe(
      row(['2026-10-14', 'Piernas', '52', 'Press banca', '', '', '', '', '', '', '10', '60', '80']),
    );
  });

  it('writes a missing value as empty and never as zero', () => {
    const csv = toCsv([
      workout({
        title: null,
        durationMinutes: null,
        exercises: [
          {
            name: 'Sentadilla',
            ...EMPTY_TARGET,
            sets: [
              { setNumber: 1, reps: null, weightKg: null, rpe: null, isWarmup: false, notes: null },
            ],
          },
        ],
      }),
    ]);

    // `Number('')` is 0, so an unwritten field that was passed through a parser would claim the
    // person lifted nothing. The empty field has to stay empty.
    expect(lines(csv)[1]).toBe(
      row(['2026-10-14', '', '', 'Sentadilla', '1', '', '', '', 'false', '', '', '', '']),
    );
  });

  it('sorts the sets by their number even when the query handed them over out of order', () => {
    const csv = toCsv([
      workout({
        exercises: [
          {
            name: 'Sentadilla',
            ...EMPTY_TARGET,
            sets: [
              { setNumber: 2, reps: 5, weightKg: 80, rpe: null, isWarmup: false, notes: null },
              { setNumber: 1, reps: 5, weightKg: 70, rpe: null, isWarmup: false, notes: null },
            ],
          },
        ],
      }),
    ]);

    expect(
      lines(csv)
        .slice(1)
        .map((line) => line.split(';')[4]),
    ).toEqual(['1', '2']);
  });
});
