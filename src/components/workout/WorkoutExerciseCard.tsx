import { useId, useRef, useState } from 'react';

import { useLastSets } from '../../hooks/useCatalog.ts';
import type { LastSet } from '../../lib/catalog-api.ts';
import { parseDecimalInput, workoutNumberRefusal } from '../../lib/utils.ts';
import type { WorkoutNumberField } from '../../lib/utils.ts';
import type {
  WorkoutExerciseDraft,
  WorkoutSetDraft,
  WorkoutSetPatch,
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

/**
 * The four columns of a set: the number in the margin, the reps, the kilos and the delete.
 *
 * The printed header and the rows share this one template, so the words that name a column cannot
 * drift away from the values that fill it. The last column is 2.75rem (44px) and it is not a style
 * choice: the delete button inherits its width from it, and at the smaller 2.5rem it measured 40px,
 * under the 44px floor the product asks of a control.
 */
const SET_COLUMNS = 'grid-cols-[1.25rem_1fr_1fr_2.75rem]';

type WorkoutExerciseCardProps = {
  /** The account the cache belongs to; the card reads the last session under it. */
  userId: string;
  name: string;
  card: WorkoutExerciseDraft;
  onAddSet: (seed?: WorkoutSetPatch) => void;
  onUpdateSet: (setId: string, patch: WorkoutSetPatch) => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
};

export function WorkoutExerciseCard({
  userId,
  name,
  card,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onRemoveExercise,
}: WorkoutExerciseCardProps) {
  const lastSets = useLastSets(userId, card.exerciseId);
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
       * There is no objective row here any more. The card used to open with three optional fields —
       * the reps it aimed for and the range of weights, between a minimum and a maximum — and the
       * person asked for the series instead: what was lifted, series by series. The aim was a plan
       * made before the weights were on the bar, and the session is a record of what happened.
       */}

      {/*
       * The columns are printed once per card and not once per set. Four sets used to reprint `Reps`
       * and `kg` eight times: the same two words, and around 290px of the scroll that taxes the
       * product's promise of logging a set in under ten seconds. This is the head of a ruled page
       * instead, and a series is one line of writing under it.
       *
       * It is hidden from assistive technology on purpose, and that is not the same as gone: every
       * field already carries its own name (`Peso en kg serie 3`), so what a screen reader needs is
       * the series a value belongs to, not two loose words read out before the rows. The per-row
       * abbreviations it replaces were hidden for the same reason.
       *
       * A card with no series prints no head: the header labels columns, and there are none yet --
       * it would be two words floating over the only thing an empty card shows, which is the button
       * that starts the first series.
       */}
      {card.sets.length > 0 ? (
        <div aria-hidden="true" className={`text-muted mt-3 grid gap-2 ${SET_COLUMNS}`}>
          <span />
          <span className="px-1 text-xs">Reps</span>
          <span className="px-1 text-xs">kg</span>
          <span />
        </div>
      ) : null}

      <ul aria-label={`Series de ${name}`}>
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
    /*
     * One ruled line per set: the number, the two values and the delete, bottom-aligned so the
     * writing rests on the rule that closes the row. That 1px rule is the field's rule too -- the
     * fields inside print none of their own, because a second line a few pixels above this one would
     * double it under the only place the eye is looking. What a field's own rule did for it before is
     * done here: the row takes the accent while the row has the focus, which is the same promise the
     * field's `focus:border-text` makes everywhere else in the app.
     */
    <li
      className={`border-rule focus-within:border-text grid items-end gap-2 border-b ${SET_COLUMNS}`}
    >
      {/* The margin's number, which is where a notebook writes it. The set is already named in
          every label of the row, so this one is decoration for assistive technology. Tabular, like
          every figure that stands in a column. */}
      <span aria-hidden="true" className="tabular font-display text-muted text-base leading-none">
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
        field="reps"
        value={set.reps}
        replaced={reps.replaced}
        onFocus={reps.takeHold}
        onChange={reps.correct}
      />
      <NumberCell
        label={`Peso en kg serie ${position}`}
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
 * The cell of one value in a row, with nothing but what the value needs.
 *
 * The visible text used to be the abbreviation of the column (`Reps`, `kg`) and the accessible name
 * the full phrase. The abbreviations are printed once above the rows now, so the cell holds the value
 * and the correction's mark, and the name a screen reader hears is still `Peso en kg serie 3`: the
 * column a value sits in is a fact about the page, and which series it belongs to is the fact a person
 * who cannot see the rows is missing.
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
  field,
  value,
  replaced = null,
  onFocus,
  onChange,
}: {
  label: string;
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
     * Everything that is not the value stacks ABOVE the field, and the field is the last thing in the
     * cell. The row is bottom-aligned on the rule it draws, so whatever comes last is what sits on it:
     * with the crossed value or the refusal message underneath, the writing would be pushed up off its
     * own line exactly while the person is looking at it.
     *
     * The refusal keeps the shape `Input`'s error has -- words in danger red, wired to the field with
     * `aria-describedby` and `aria-invalid`, announced because it is a live region -- and only its side
     * of the field changed.
     */
    <div>
      {replaced !== null ? (
        <span className="block text-xs whitespace-nowrap">
          <span className="sr-only">Valor anterior: </span>
          <s className="text-muted decoration-primary decoration-2">{formatNumber(replaced)}</s>
        </span>
      ) : null}
      {refusal ? (
        <p id={refusalId} role="alert" className="text-danger text-sm">
          {refusal}
        </p>
      ) : null}
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
        /*
         * The writing sits on the row's rule instead of in the middle of the 48px touch target, which
         * is the whole point of the row: in the notebook the number rests on the line. 20px above the
         * line and nothing below puts one 24px line of writing at the bottom of the box, and the box
         * stays 48px because that is what the thumb is aiming at.
         */
        className="tabular min-h-12 w-full rounded-none border-0 bg-transparent px-1 pt-5 text-base"
      />
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
