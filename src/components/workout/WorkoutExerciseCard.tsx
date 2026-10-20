import { useId, useRef, useState } from 'react';

import { useLastSets } from '../../hooks/useCatalog.ts';
import type { LastSet } from '../../lib/catalog-api.ts';
import { parseDecimalInput, workoutNumberRefusal } from '../../lib/utils.ts';
import type { WorkoutNumberField } from '../../lib/utils.ts';
import type {
  WorkoutExerciseDraft,
  WorkoutSetDraft,
  WorkoutSetPatch,
  WorkoutTargetPatch,
} from '../../stores/workout-store.ts';

/**
 * One exercise inside the workout in progress, with its sets.
 *
 * The card owns no state: everything it shows comes from the draft the store
 * persists, and every tap goes back out as a callback. That is what keeps a
 * half-finished workout safe across a reload — there is nothing here to lose.
 *
 * The two defaults the plan asks for both live in `seedForNextSet`, because they
 * are the same question ("what does this set start from?") answered twice.
 */

type WorkoutExerciseCardProps = {
  name: string;
  card: WorkoutExerciseDraft;
  onAddSet: (seed?: WorkoutSetPatch) => void;
  onUpdateSet: (setId: string, patch: WorkoutSetPatch) => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
  onSetTarget: (patch: WorkoutTargetPatch) => void;
};

export function WorkoutExerciseCard({
  name,
  card,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onRemoveExercise,
  onSetTarget,
}: WorkoutExerciseCardProps) {
  const lastSets = useLastSets(card.exerciseId);
  const history = lastSets.data ?? [];

  /**
   * What the next set starts from.
   *
   * From the second set on it is the set just above: repeating the same weight is
   * the common case and it saves two taps per set. The first set of the card has
   * no set above it, so it starts from where the exercise ended last session —
   * which is the weight the user is about to lift again.
   *
   * Warmup is deliberately not inherited. Warmups come first, so a new set is a
   * work set unless the user says otherwise.
   */
  function seedForNextSet(): WorkoutSetPatch | undefined {
    const previous = card.sets.at(-1);

    if (previous) {
      return { reps: previous.reps, weightKg: previous.weightKg };
    }

    const last = history.at(-1);

    return last ? { reps: last.reps, weightKg: last.weightKg } : undefined;
  }

  return (
    <section className="border-text border-t-2 pt-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/*
           * The display face at its own weight, not the interface face pushed heavier: the craft
           * floor is explicit that the closest installed face is a failure and not a fallback. The
           * name of the exercise is a printed title in this notebook.
           */}
          <h2 className="font-display truncate text-lg font-extrabold tracking-tight uppercase">
            {name}
          </h2>
          {history.length > 0 ? (
            <p className="text-muted tabular mt-1 text-sm">{formatHistory(history)}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemoveExercise}
          aria-label={`Quitar ${name}`}
          className="text-muted hover:text-danger inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center"
        >
          <CloseGlyph />
        </button>
      </header>

      {/*
       * The target lives on the card and not in the picker. In the picker it would change the
       * "one tap and out" the dialog was built around and put the aim behind a second screen, and
       * once set there would be no way to correct it mid-session — which is exactly when someone
       * finds out the range they typed was wrong.
       */}
      <div className="mt-3">
        <p className="text-muted text-xs">Objetivo (opcional)</p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <NumberCell
            label="Reps del objetivo"
            shortLabel="Reps"
            field="reps"
            value={card.targetReps}
            onChange={(value) => onSetTarget({ targetReps: value })}
          />
          <NumberCell
            label="Peso mínimo del objetivo"
            shortLabel="Mín kg"
            field="weightKg"
            value={card.targetWeightMin}
            onChange={(value) => onSetTarget({ targetWeightMin: value })}
          />
          <NumberCell
            label="Peso máximo del objetivo"
            shortLabel="Máx kg"
            field="weightKg"
            value={card.targetWeightMax}
            onChange={(value) => onSetTarget({ targetWeightMax: value })}
          />
        </div>
      </div>

      <ul aria-label={`Series de ${name}`} className="mt-3">
        {card.sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            position={index + 1}
            onChange={(patch) => onUpdateSet(set.id, patch)}
            onRemove={() => onRemoveSet(set.id)}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onAddSet(seedForNextSet())}
        className="border-rule hover:bg-surface mt-3 min-h-12 w-full rounded-sm border px-4 text-sm"
      >
        + serie
      </button>
    </section>
  );
}

/**
 * "último: 8 × 75 kg"
 *
 * The heaviest set of the last session, with its reps — one set, not the list. This used to print
 * every set on purpose, so that a drop set read as two numbers instead of an average telling the
 * user to lift something they never lifted. The reasoning still holds and the line grew long enough
 * to stop being read, which defeats the point of showing it at all. What is left is still a weight
 * they really lifted: the heaviest set's, not a mean of them.
 *
 * Ties go to the set with more reps, because that is the one that says more about what they can do.
 * The caller only renders this when there is at least one set, which is why `reduce` can start from
 * the first one.
 */
function formatHistory(sets: LastSet[]): string {
  const best = sets.reduce((winner, set) =>
    set.weightKg > winner.weightKg ||
    (set.weightKg === winner.weightKg && (set.reps ?? 0) > (winner.reps ?? 0))
      ? set
      : winner,
  );

  return `último: ${best.reps ?? '?'} × ${best.weightKg} kg`;
}

function SetRow({
  set,
  position,
  onChange,
  onRemove,
}: {
  set: WorkoutSetDraft;
  position: number;
  onChange: (patch: WorkoutSetPatch) => void;
  onRemove: () => void;
}) {
  const reps = useCorrection(set.reps, (value) => onChange({ reps: value }));
  const weight = useCorrection(set.weightKg, (value) => onChange({ weightKg: value }));

  return (
    <li className="border-rule grid grid-cols-[1.25rem_1fr_1fr_2.75rem] items-end gap-2 border-b pb-2">
      {/* The margin's number, which is where a notebook writes it. The set is already named in
          every label of the row, so this one is decoration for assistive technology. */}
      <span aria-hidden="true" className="font-display text-muted pb-3 text-base leading-none">
        {position}ª
      </span>

      {/*
       * Text inputs with a decimal keyboard rather than `type="number"`: a number
       * input refuses the comma that weights are written with here, and it reports
       * an empty value instead of an error, so the user would just see their typing
       * disappear.
       *
       * They are uncontrolled on purpose. The value is committed on every change the
       * contract accepts, but the field keeps its own text: a controlled input would
       * rewrite "72," to "72" mid-keystroke and the next digit would land after it.
       * A value the contract refuses is not committed at all, and the cell says why
       * (`NumberCell`) instead of quietly storing something the payload would reject.
       */}
      <NumberCell
        label={`Reps serie ${position}`}
        shortLabel="Reps"
        field="reps"
        value={set.reps}
        replaced={reps.replaced}
        onFocus={reps.takeHold}
        onChange={reps.correct}
      />
      <NumberCell
        label={`Peso en kg serie ${position}`}
        shortLabel="kg"
        field="weightKg"
        value={set.weightKg}
        replaced={weight.replaced}
        onFocus={weight.takeHold}
        onChange={weight.correct}
      />

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Borrar serie ${position}`}
        className="text-muted hover:text-danger inline-flex min-h-12 items-center justify-center"
      >
        <CloseGlyph />
      </button>
    </li>
  );
}

/**
 * The notebook's correction mark, per cell.
 *
 * The value is taken hold of when the field is touched (`takeHold`) and not on every keystroke,
 * because a keystroke is not a correction: from 100, typing 102,5 goes through "1" and "10", and
 * crossing those out would be marking the typing instead of what was replaced. What gets crossed is
 * the value that was really in the row when the hand arrived, and it is crossed only while the
 * committed value is a different one: type the original back and nothing was replaced, so nothing
 * is crossed.
 *
 * It lives here and not in the draft on purpose. This is what happened in front of the user, not part
 * of the session: persisting it would put a display decision into a payload the server already knows
 * the shape of, and into a table that has no column for it.
 */
function useCorrection(committed: number | null, commit: (value: number | null) => void) {
  const held = useRef<number | null>(null);
  const [replaced, setReplaced] = useState<number | null>(null);

  return {
    replaced,
    takeHold: () => {
      held.current = committed;
    },
    correct: (value: number | null) => {
      commit(value);
      setReplaced(held.current !== null && value !== held.current ? held.current : null);
    },
  };
}

/**
 * The visible text is short and the accessible name is not: two different strings on purpose.
 *
 * A screen reader hears "Peso en kg serie 1" — the unit and which set — while the eye reads just
 * "kg", because the full phrase wrapped onto a second line the moment the correction's crossed value
 * shared the row with it, on the row where the last value somebody typed is the whole point. The
 * visible span is `aria-hidden`, so what gets announced is the name and never the abbreviation. And
 * they cannot all be called "Peso": the names have to tell three sets apart for assistive
 * technology, even when the visible text repeats.
 *
 * The crossed value is announced as "Valor anterior" instead of being swept out of the tree: the
 * correction is information, and the users who cannot see the crossing are the ones who would lose
 * it. The figures are tabular so a column does not move while it is being written.
 *
 * **A refused value is not written down, and the field says why.** The rule is the save contract's own
 * (`workoutNumberRefusal`), asked here before the value can reach the draft, so the draft cannot hold
 * a number the payload would reject. Three decisions follow from that, and they are the deliberate
 * part:
 *
 * - **The text stays exactly as typed.** These fields are uncontrolled on purpose, and rewriting
 *   "10,5" to something else mid-keystroke would take the typing away from the person who is in the
 *   middle of fixing it. It is also the only place the refused value is visible.
 * - **The stored value is the last one the rule took** — or `null` if there never was one — so what
 *   the session holds is always something the contract accepts. The message is what says that what
 *   is on screen is not what is recorded yet.
 * - **The correction mark follows the draft, not the text**, because nothing new was committed: the
 *   crossed value keeps meaning "this is what the stored value replaced".
 */
function NumberCell({
  label,
  shortLabel,
  field,
  value,
  replaced = null,
  onFocus,
  onChange,
}: {
  label: string;
  shortLabel: string;
  field: WorkoutNumberField;
  value: number | null;
  replaced?: number | null;
  onFocus?: () => void;
  onChange: (value: number | null) => void;
}) {
  const refusalId = useId();
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    /*
     * The gap between the label row and the field is two steps, not one: the focus
     * outline reaches four pixels above the field (two of stroke, two of offset) and
     * the crossed-out value sits on the label row's baseline, so with a single step
     * the two marks of the same correction -- the one struck and the one being
     * corrected -- touched each other on the row that matters most.
     */
    <div className="space-y-2">
      <span className="flex items-baseline justify-between gap-1">
        <span aria-hidden="true" className="text-muted text-xs">
          {shortLabel}
        </span>
        {replaced !== null ? (
          <span className="text-xs whitespace-nowrap">
            <span className="sr-only">Valor anterior: </span>
            <s className="text-muted decoration-primary decoration-2">{formatNumber(replaced)}</s>
          </span>
        ) : null}
      </span>
      <input
        aria-label={label}
        aria-invalid={refusal ? true : undefined}
        aria-describedby={refusal ? refusalId : undefined}
        defaultValue={value === null ? '' : String(value)}
        inputMode="decimal"
        autoComplete="off"
        onFocus={onFocus}
        onChange={(event) => {
          const typed = parseDecimalInput(event.target.value);
          const refused = workoutNumberRefusal(field, typed);

          setRefusal(refused);

          // Refused values stop here: the draft is only ever written with what the contract takes.
          if (refused === null) {
            onChange(typed);
          }
        }}
        className="border-rule focus:border-primary tabular min-h-12 w-full rounded-none border-0 border-b bg-transparent px-1 text-base"
      />
      {/* The same shape as `Input`'s error: words in danger red, wired to the field, announced when
          it appears. It is a live region because it shows up after the person acted. */}
      {refusal ? (
        <p id={refusalId} role="alert" className="text-danger text-sm">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A number as it is written by hand here: with a comma and without the trailing zeros of a decimal
 * column. The arguments are reps and kilos, and both are written the same way.
 */
function formatNumber(value: number): string {
  return String(value).replace('.', ',');
}

/**
 * Inline SVG rather than a "✕" character: the project already decided against
 * glyphs as icons, because they render differently on every platform and do not
 * inherit the text colour reliably.
 */
function CloseGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
