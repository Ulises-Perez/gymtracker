import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { newId } from '../lib/ids.ts';
import { indexedDbStorage } from '../lib/storage.ts';
import { localIsoDate, workoutNumberRefusal } from '../lib/utils.ts';
import type { WorkoutNumberField } from '../lib/utils.ts';

/**
 * The workout in progress, on the device.
 *
 * This store is the offline-first core of the app: a set is recorded here first
 * and reaches the server later, so the draft has to survive a reload, a closed
 * tab and a dead network. It holds no server state — the catalogue is TanStack
 * Query's business — and it never talks to Supabase itself: the only thing that
 * does is `save_workout`, from the queue (see `lib/workout-api.ts`).
 *
 * Versioned so a future shape can be retired instead of misread.
 */
export const WORKOUT_STORAGE_KEY = 'gymtracker.workout.v1';

export type WorkoutSetDraft = {
  id: string;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  isWarmup: boolean;
  notes: string | null;
};

export type WorkoutSetPatch = Partial<Omit<WorkoutSetDraft, 'id'>>;

export type WorkoutExerciseDraft = {
  /**
   * Identity of the card on screen, which is not the catalogue's exercise id.
   *
   * Keeping them apart is what lets the same exercise appear twice in one session
   * — a legitimate thing to do — and it is what drag and drop sorts by without
   * having to touch the catalogue.
   */
  id: string;
  exerciseId: string;
  sets: WorkoutSetDraft[];
  /**
   * What the user set out to do with this card: how many reps, between which weights.
   *
   * All three are optional and independent, because they get typed at different moments and a
   * target that only says "10 reps" is a real one. They belong to the card and not to the exercise
   * — the same exercise can be given two different targets in a single session — which is why they
   * travel with the card: since 0012 the card is one row, and the order of the payload's cards is the
   * order of the session.
   */
  targetReps: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
};

export type WorkoutTargetPatch = Partial<
  Pick<WorkoutExerciseDraft, 'targetReps' | 'targetWeightMin' | 'targetWeightMax'>
>;

/**
 * What repeating a saved session needs from it: the title and the cards, in their stored order.
 *
 * The notes are deliberately absent. They are a comment about the day the session happened, and
 * carrying them into a new one would put yesterday's words on today's workout.
 */
export type RepeatSource = {
  title: string | null;
  exercises: Array<{
    exerciseId: string;
    targetReps: number | null;
    targetWeightMin: number | null;
    targetWeightMax: number | null;
  }>;
};

/**
 * An exercise the user invented, held here until the workout is saved.
 *
 * It has to live in the draft and not only in the catalogue, because the catalogue
 * is the server's copy and this row does not exist on the server yet. The payload
 * carries it, and `save_workout` creates it before the sets that reference it
 * (migration 0008).
 */
export type CustomExerciseDraft = {
  id: string;
  name: string;
  muscleGroupId: string | null;
};

/**
 * The draft as an older build wrote it, before custom exercises existed.
 *
 * Typed separately on purpose: the whole reason the migration exists is that this
 * field may not be there, and typing it as a full `WorkoutDraft` would be a lie the
 * compiler believes.
 */
/**
 * A card as an older build wrote it: the target fields did not exist yet.
 */
type LegacyCard = Omit<WorkoutExerciseDraft, 'targetReps' | 'targetWeightMin' | 'targetWeightMax'> &
  Partial<Pick<WorkoutExerciseDraft, 'targetReps' | 'targetWeightMin' | 'targetWeightMax'>>;

type LegacyDraft = Omit<WorkoutDraft, 'customExercises' | 'exercises'> & {
  customExercises?: CustomExerciseDraft[];
  exercises: LegacyCard[];
};

export type WorkoutStatus = 'draft' | 'finished';

export type WorkoutDraft = {
  workoutId: string;
  /** Local calendar date, fixed when the workout starts. */
  date: string;
  title: string;
  notes: string;
  startedAt: number;
  endedAt: number | null;
  status: WorkoutStatus;
  exercises: WorkoutExerciseDraft[];
  customExercises: CustomExerciseDraft[];
};

/**
 * A number in the draft that the save contract would refuse, and why it would refuse it.
 */
export type WorkoutNumberProblem = {
  /** The card, by the id of the exercise it names: this store holds ids, the screen holds names. */
  exerciseId: string;
  /** Which row: the set at this position, counting from one, or null for the card's target. */
  setNumber: number | null;
  field: WorkoutNumberField;
  /** The words the person is told, in the app's own language. */
  refusal: string;
};

/**
 * The first number of the draft the save contract would refuse, or null when it would take them all.
 *
 * The card refuses these at the keystroke, so a session typed in this build finds nothing here. What
 * this is for is the draft that did not come from those keystrokes: a session restored from an older
 * build, or one written into the store by anything that is not the card. Such a draft cannot be
 * saved — the payload fails its own contract and the queue spends its retries on the same bytes — and
 * once `finish()` has run it cannot be corrected either, because a finished draft takes no more edits.
 * Finding it before the freeze is the difference between "fix that field" and "lose the session".
 *
 * The order is the order of the screen: each card, its target first and then its sets. The first
 * problem is the one to name, because a list of them would be a wall of text over a session that is
 * one correction away from being fine.
 */
export function findWorkoutNumberProblem(draft: WorkoutDraft): WorkoutNumberProblem | null {
  for (const card of draft.exercises) {
    const rows: Array<{
      setNumber: number | null;
      numbers: Array<[WorkoutNumberField, number | null]>;
    }> = [
      {
        setNumber: null,
        numbers: [
          ['reps', card.targetReps],
          ['weightKg', card.targetWeightMin],
          ['weightKg', card.targetWeightMax],
        ],
      },
      ...card.sets.map((set, index) => ({
        setNumber: index + 1,
        numbers: [
          ['reps', set.reps],
          ['weightKg', set.weightKg],
        ] as Array<[WorkoutNumberField, number | null]>,
      })),
    ];

    for (const row of rows) {
      for (const [field, value] of row.numbers) {
        const refusal = workoutNumberRefusal(field, value);

        if (refusal !== null) {
          return { exerciseId: card.exerciseId, setNumber: row.setNumber, field, refusal };
        }
      }
    }
  }

  return null;
}

type WorkoutStore = {
  draft: WorkoutDraft | null;
  /**
   * False until the persisted draft has been read.
   *
   * The storage is asynchronous, so "there is no draft" and "the draft has not
   * been read yet" are different states, and only this flag tells them apart. The
   * workout screen waits on it rather than rendering a fresh draft that the
   * restored one would then replace under the user's hands.
   */
  hydrated: boolean;
  start: () => void;
  discard: () => void;
  repeatFrom: (source: RepeatSource) => void;
  setTitle: (title: string) => void;
  setNotes: (notes: string) => void;
  addExercise: (exerciseId: string, target?: WorkoutTargetPatch) => void;
  addCustomExercise: (
    name: string,
    muscleGroupId: string | null,
    target?: WorkoutTargetPatch,
  ) => void;
  removeExercise: (cardId: string) => void;
  reorderExercises: (from: number, to: number) => void;
  addSet: (cardId: string, seed?: WorkoutSetPatch) => void;
  setTarget: (cardId: string, patch: WorkoutTargetPatch) => void;
  updateSet: (cardId: string, setId: string, patch: WorkoutSetPatch) => void;
  removeSet: (cardId: string, setId: string) => void;
  finish: () => void;
};

function createDraft(now: Date = new Date()): WorkoutDraft {
  return {
    workoutId: newId(),
    date: localIsoDate(now),
    title: '',
    notes: '',
    startedAt: now.getTime(),
    endedAt: null,
    status: 'draft',
    exercises: [],
    customExercises: [],
  };
}

function createSet(seed: WorkoutSetPatch): WorkoutSetDraft {
  return {
    id: newId(),
    reps: seed.reps ?? null,
    weightKg: seed.weightKg ?? null,
    rpe: seed.rpe ?? null,
    isWarmup: seed.isWarmup ?? false,
    notes: seed.notes ?? null,
  };
}

/**
 * A card that has not been given a target yet.
 *
 * Null and not zero: a zero would be a claim that the user meant to lift nothing, and these fields
 * mean "not said yet". Null is also what the payload sends and what the database stores.
 */
const emptyTarget: Pick<
  WorkoutExerciseDraft,
  'targetReps' | 'targetWeightMin' | 'targetWeightMax'
> = {
  targetReps: null,
  targetWeightMin: null,
  targetWeightMax: null,
};

/**
 * Applies `change` to an open draft, and holds both guards in one place.
 *
 * There has to be a draft, and it must not be finished. Restating that in every
 * action is how one of them eventually forgets it: a write that lands after
 * `finish()` would change the workout the payload was already built from, so the
 * store and the server would disagree about what was trained. Returning the same
 * draft also keeps the state reference identical, so zustand does not notify
 * subscribers for a change that did not happen.
 */
function edit(
  state: WorkoutStore,
  change: (draft: WorkoutDraft) => WorkoutDraft,
): WorkoutStore | null {
  const { draft } = state;

  if (!draft || draft.status !== 'draft') {
    return null;
  }

  const next = change(draft);

  return next === draft ? state : { ...state, draft: next };
}

/** Rewrites one card, doing nothing when the id matches none. */
function mapCard(
  draft: WorkoutDraft,
  cardId: string,
  change: (exercise: WorkoutExerciseDraft) => WorkoutExerciseDraft,
): WorkoutDraft {
  if (!draft.exercises.some((exercise) => exercise.id === cardId)) {
    return draft;
  }

  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      exercise.id === cardId ? change(exercise) : exercise,
    ),
  };
}

export const useWorkoutStore = create<WorkoutStore>()(
  persist(
    (set) => ({
      draft: null,
      hydrated: false,

      start: () =>
        set((state) => {
          // A draft that is still open is never replaced: losing a session
          // because a second tap landed on "new workout" is not a recoverable
          // mistake. Throwing one away is `discard()`'s job, and only the screen
          // can confirm that with the user.
          if (state.draft?.status === 'draft') {
            return state;
          }

          // A finished draft may be replaced freely: whatever was going to be
          // saved was already captured as self-describing variables by the
          // queue, so it does not depend on this state anymore.
          return { ...state, draft: createDraft() };
        }),

      discard: () => set({ draft: null }),

      /**
       * Opens a new draft from a saved session: the same cards, in the same order, with the aim
       * they had, and with no sets at all.
       *
       * The load is not copied — the card reads it from the history when the next set starts, which
       * is where a gym wants it. Neither are the custom exercises: a custom a card names was created
       * on the server when the original session was saved, so its id already points at a row the
       * owner may use, and re-sending the definition would only be a second way to say the same
       * thing.
       *
       * It replaces whatever draft was open, and that is the screen's call and not this action's: a
       * session in progress is the only copy there is, so the screen asks first and only calls this
       * once the user has agreed to lose it.
       */
      repeatFrom: (source) =>
        set((state) => {
          /*
           * The read of the device is asynchronous, so before it finishes this store does not know
           * whether a session is on disk. Opening one on that guess would overwrite a draft the
           * store is about to read back. The guard is here and not in a screen because it has to
           * protect every caller, and the store is the one that knows whether it read.
           */
          if (!state.hydrated) {
            return state;
          }

          return {
            ...state,
            draft: {
              ...createDraft(),
              title: source.title ?? '',
              exercises: source.exercises.map((card) => ({
                id: newId(),
                exerciseId: card.exerciseId,
                sets: [],
                targetReps: card.targetReps,
                targetWeightMin: card.targetWeightMin,
                targetWeightMax: card.targetWeightMax,
              })),
            },
          };
        }),

      setTitle: (title) => set((state) => edit(state, (draft) => ({ ...draft, title })) ?? state),

      setNotes: (notes) => set((state) => edit(state, (draft) => ({ ...draft, notes })) ?? state),

      /**
       * Adds a catalogue exercise, with the target the user set on the way in.
       *
       * The target arrives here and not in a second call, so the card is never briefly without it: a
       * screen that added the card first and patched it afterwards would show an aimless card for a
       * frame, and an interruption in between would leave one behind.
       */
      addExercise: (exerciseId, target) =>
        set(
          (state) =>
            edit(state, (draft) => ({
              ...draft,
              exercises: [
                ...draft.exercises,
                { ...emptyTarget, ...target, id: newId(), exerciseId, sets: [] },
              ],
            })) ?? state,
        ),

      /**
       * Creates the definition and its card in one action, and that is the point:
       * they have to agree. Two separate actions would allow a card whose definition
       * was never recorded — a workout that cannot be saved, discovered only when the
       * user taps "Finalizar".
       *
       * An empty name is not refused here. Both the payload schema and `save_workout`
       * refuse it, with a message meant for a person and a test each; repeating the
       * rule in a third place is how the three drift apart.
       */
      addCustomExercise: (name, muscleGroupId, target) =>
        set(
          (state) =>
            edit(state, (draft) => {
              const exerciseId = newId();

              return {
                ...draft,
                customExercises: [
                  ...draft.customExercises,
                  { id: exerciseId, name: name.trim(), muscleGroupId },
                ],
                exercises: [
                  ...draft.exercises,
                  { ...emptyTarget, ...target, id: newId(), exerciseId, sets: [] },
                ],
              };
            }) ?? state,
        ),

      removeExercise: (cardId) =>
        set(
          (state) =>
            edit(state, (draft) => ({
              ...draft,
              exercises: draft.exercises.filter((exercise) => exercise.id !== cardId),
            })) ?? state,
        ),

      reorderExercises: (from, to) =>
        set(
          (state) =>
            edit(state, (draft) => {
              const lastIndex = draft.exercises.length - 1;

              if (from === to || from < 0 || to < 0 || from > lastIndex || to > lastIndex) {
                return draft;
              }

              const exercises = [...draft.exercises];
              const [moved] = exercises.splice(from, 1);

              if (!moved) {
                return draft;
              }

              exercises.splice(to, 0, moved);

              return { ...draft, exercises };
            }) ?? state,
        ),

      addSet: (cardId, seed = {}) =>
        set(
          (state) =>
            edit(state, (draft) =>
              mapCard(draft, cardId, (exercise) => ({
                ...exercise,
                sets: [...exercise.sets, createSet(seed)],
              })),
            ) ?? state,
        ),

      // A patch that leaves a field `undefined` clears it: the spread does not
      // skip absent keys. Callers that mean "empty" pass null.
      updateSet: (cardId, setId, patch) =>
        set(
          (state) =>
            edit(state, (draft) =>
              mapCard(draft, cardId, (exercise) => ({
                ...exercise,
                sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)),
              })),
            ) ?? state,
        ),

      /**
       * Writes what the card is aiming for, one field at a time.
       *
       * A patch that leaves a field out does not clear it — the spread skips absent keys — so the
       * three values can be typed in any order, each landing without disturbing the others. That is
       * what makes a half-written target a real state rather than a moment to be repaired.
       */
      setTarget: (cardId, patch) =>
        set(
          (state) =>
            edit(state, (draft) =>
              mapCard(draft, cardId, (exercise) => ({ ...exercise, ...patch })),
            ) ?? state,
        ),

      removeSet: (cardId, setId) =>
        set(
          (state) =>
            edit(state, (draft) =>
              mapCard(draft, cardId, (exercise) => ({
                ...exercise,
                sets: exercise.sets.filter((set) => set.id !== setId),
              })),
            ) ?? state,
        ),

      /**
       * Freezes the workout, unless the contract would refuse what it holds.
       *
       * `finish()` is the freeze, so this is the one place where a session the payload schema refuses
       * can still be stopped: afterwards the draft takes no more edits, its payload fails on every
       * retry and the person can only discard the session. Refusing to finish keeps it a draft —
       * editable, and one correction away from saving. The screen is where the person is told which
       * field to correct, because only the screen knows the exercise's name; this is the invariant
       * underneath, for any caller that arrives without asking first.
       *
       * The double-finish guard the plan asks for still falls out of `edit`: once the status is no
       * longer `draft` there is nothing here to change, so a second tap cannot move `endedAt`, which is
       * what the duration and the payload are built from.
       */
      finish: () =>
        set(
          (state) =>
            edit(state, (draft) => {
              if (findWorkoutNumberProblem(draft)) {
                return draft;
              }

              return { ...draft, status: 'finished', endedAt: Date.now() };
            }) ?? state,
        ),
    }),
    {
      name: WORKOUT_STORAGE_KEY,
      storage: createJSONStorage(() => indexedDbStorage),
      // Only the draft: the actions are functions that JSON would drop anyway,
      // and `hydrated` says something about this instance, not about the data.
      partialize: (state) => ({ draft: state.draft }),
      /**
       * The draft's shape has changed twice now, so the format is versioned and old entries are
       * migrated instead of misread.
       *
       * This matters more than a normal migration: a draft written by an older build is missing a
       * key outright, and reading one back as `undefined` would reach the payload as `undefined`
       * where the server expects null. That is the kind of failure that looks like a broken save at
       * the worst possible moment — after the user has finished their session.
       */
      version: 2,
      migrate: (persisted) => {
        const stored = persisted as { draft?: LegacyDraft | null } | undefined;
        const draft = stored?.draft;

        if (!draft) {
          return { draft: null };
        }

        /*
         * Idempotent for either older version: `customExercises` arrived at version 1 and the three
         * target fields at version 2, and a draft from either build is missing whatever came after
         * it. The normalisation comes after the spread so a draft that already has a value keeps
         * it — the other order is the one the compiler rejects.
         */
        return {
          draft: {
            ...draft,
            customExercises: draft.customExercises ?? [],
            exercises: draft.exercises.map((card) => ({
              ...card,
              targetReps: card.targetReps ?? null,
              targetWeightMin: card.targetWeightMin ?? null,
              targetWeightMax: card.targetWeightMax ?? null,
            })),
          },
        };
      },
      // The read is asynchronous, so the first render must not assume the draft
      // is absent (PLAN section 3, principle 8).
      skipHydration: true,
      /**
       * A read that failed is not a read that finished.
       *
       * `migrate` throwing means the bytes on disk are a workout this build cannot read — not that
       * there was no workout — and zustand hands that error here. Swallowing it and setting
       * `hydrated` anyway would report the failed read as a good one, and the session would simply
       * look like it had never existed. The error is logged with context instead, and the flag is
       * left false for the failure to own, rather than being papered over.
       */
      onRehydrateStorage: () => (_state, error) => {
        /*
         * A failed migration is reported, and the app keeps going. Leaving `hydrated` false looked
         * safer and is worse: the workout screen waits on that flag, so a corrupt draft would leave it
         * on a skeleton for ever with nothing to tap. What is on disk gets replaced the moment a new
         * workout starts, and the loud line above is what makes the failure findable.
         */
        if (error) {
          console.error('No se pudo restaurar el entrenamiento guardado en el dispositivo.', error);
        }

        useWorkoutStore.setState({ hydrated: true });
      },
    },
  ),
);

// Started at import time rather than from a component, so the read overlaps with
// the first render instead of beginning after it.
void useWorkoutStore.persist.rehydrate();
