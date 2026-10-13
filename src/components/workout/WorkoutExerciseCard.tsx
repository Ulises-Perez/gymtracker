import { useLastSets } from '../../hooks/useCatalog.ts';
import type { LastSet } from '../../lib/catalog-api.ts';
import { parseDecimalInput } from '../../lib/utils.ts';
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

type WorkoutExerciseCardProps = {
  name: string;
  card: WorkoutExerciseDraft;
  onAddSet: (seed?: WorkoutSetPatch) => void;
  onUpdateSet: (setId: string, patch: WorkoutSetPatch) => void;
  onRemoveSet: (setId: string) => void;
  onRemoveExercise: () => void;
};

export function WorkoutExerciseCard({
  name,
  card,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onRemoveExercise,
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
    <section className="bg-surface rounded-lg p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{name}</h2>
          {history.length > 0 ? (
            <p className="text-muted mt-1 text-sm">{formatHistory(history)}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemoveExercise}
          aria-label={`Quitar ${name}`}
          className="ring-white/15 hover:bg-bg focus-visible:ring-primary inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-md ring-1 focus-visible:ring-2 focus-visible:outline-none"
        >
          <CloseGlyph />
        </button>
      </header>

      <ul aria-label={`Series de ${name}`} className="mt-3 space-y-3">
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
        className="ring-white/15 hover:bg-bg focus-visible:ring-primary mt-3 min-h-12 w-full rounded-md px-4 text-sm ring-1 focus-visible:ring-2 focus-visible:outline-none"
      >
        + serie
      </button>
    </section>
  );
}

/**
 * "último: 10 × 70 kg · 8 × 75 kg"
 *
 * Every set of the last session, not a summary: a drop set is two different
 * numbers, and averaging them into one would tell the user to lift something they
 * never lifted. It is also what the RPC was built to return.
 */
function formatHistory(sets: LastSet[]): string {
  const entries = sets.map((set) => `${set.reps ?? '?'} × ${set.weightKg} kg`);

  return `último: ${entries.join(' · ')}`;
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
  return (
    <li className="grid grid-cols-[1.25rem_1fr_1fr_3rem] items-end gap-2">
      <span className="text-muted pb-3 text-sm">{position}ª</span>

      {/*
       * Text inputs with a decimal keyboard rather than `type="number"`: a number
       * input refuses the comma that weights are written with here, and it reports
       * an empty value instead of an error, so the user would just see their typing
       * disappear.
       *
       * They are uncontrolled on purpose. The value is committed on every change,
       * but the field keeps its own text: a controlled input would rewrite "72," to
       * "72" mid-keystroke and the next digit would land after it.
       */}
      <NumberCell
        label={`Reps serie ${position}`}
        shortLabel="Reps"
        value={set.reps}
        onChange={(reps) => onChange({ reps })}
      />
      <NumberCell
        label={`Peso en kg serie ${position}`}
        shortLabel="Peso en kg"
        value={set.weightKg}
        onChange={(weightKg) => onChange({ weightKg })}
      />

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Borrar serie ${position}`}
        className="text-muted hover:text-danger focus-visible:ring-primary inline-flex min-h-12 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
      >
        <CloseGlyph />
      </button>
    </li>
  );
}

/**
 * The visible text is a substring of the accessible name on purpose: a screen
 * reader hears "Peso en kg serie 1", which is what the eye reads plus which set.
 * They cannot all be called "Peso" — three identical names on screen are unusable
 * with assistive technology.
 */
function NumberCell({
  label,
  shortLabel,
  value,
  onChange,
}: {
  label: string;
  shortLabel: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <span aria-hidden="true" className="text-muted block text-xs">
        {shortLabel}
      </span>
      <input
        aria-label={label}
        defaultValue={value === null ? '' : String(value)}
        inputMode="decimal"
        autoComplete="off"
        onChange={(event) => onChange(parseDecimalInput(event.target.value))}
        className="bg-bg ring-white/15 focus-visible:ring-primary min-h-12 w-full rounded-md px-2 text-base ring-1 outline-none focus-visible:ring-2"
      />
    </div>
  );
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
