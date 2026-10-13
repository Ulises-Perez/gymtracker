import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { newId } from '../lib/ids.ts';
import { indexedDbStorage } from '../lib/storage.ts';
import { localIsoDate } from '../lib/utils.ts';

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
type LegacyDraft = Omit<WorkoutDraft, 'customExercises'> & {
  customExercises?: CustomExerciseDraft[];
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
  setTitle: (title: string) => void;
  setNotes: (notes: string) => void;
  addExercise: (exerciseId: string) => void;
  addCustomExercise: (name: string, muscleGroupId: string | null) => void;
  removeExercise: (cardId: string) => void;
  reorderExercises: (from: number, to: number) => void;
  addSet: (cardId: string, seed?: WorkoutSetPatch) => void;
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

      setTitle: (title) => set((state) => edit(state, (draft) => ({ ...draft, title })) ?? state),

      setNotes: (notes) => set((state) => edit(state, (draft) => ({ ...draft, notes })) ?? state),

      addExercise: (exerciseId) =>
        set(
          (state) =>
            edit(state, (draft) => ({
              ...draft,
              exercises: [...draft.exercises, { id: newId(), exerciseId, sets: [] }],
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
      addCustomExercise: (name, muscleGroupId) =>
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
                exercises: [...draft.exercises, { id: newId(), exerciseId, sets: [] }],
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

      // The double-finish guard the plan asks for falls out of `edit`: once the
      // status is no longer `draft` there is nothing here to change, so a second
      // tap cannot move `endedAt`, which is what the duration and the payload are
      // built from.
      finish: () =>
        set(
          (state) =>
            edit(state, (draft) => ({
              ...draft,
              status: 'finished',
              endedAt: Date.now(),
            })) ?? state,
        ),
    }),
    {
      name: WORKOUT_STORAGE_KEY,
      storage: createJSONStorage(() => indexedDbStorage),
      // Only the draft: the actions are functions that JSON would drop anyway,
      // and `hydrated` says something about this instance, not about the data.
      partialize: (state) => ({ draft: state.draft }),
      /**
       * The draft's shape changed with custom exercises, so the format is versioned
       * and old entries are migrated instead of misread.
       *
       * This matters more than a normal migration: a draft written by the previous
       * build has no `customExercises` key, and reading it back as `undefined` would
       * throw on the first `map` over it — losing the workout the user had in
       * progress, which is the one thing this store exists to protect. The stored
       * draft is spread last so a draft that already has the field keeps it.
       */
      version: 1,
      migrate: (persisted) => {
        const stored = persisted as { draft?: LegacyDraft | null } | undefined;
        const draft = stored?.draft;

        if (!draft) {
          return { draft: null };
        }

        // The default is written after the spread, not before: a default that the
        // spread always overwrites is not a default, and the compiler says so.
        return { draft: { ...draft, customExercises: draft.customExercises ?? [] } };
      },
      // The read is asynchronous, so the first render must not assume the draft
      // is absent (PLAN section 3, principle 8).
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useWorkoutStore.setState({ hydrated: true });
      },
    },
  ),
);

// Started at import time rather than from a component, so the read overlaps with
// the first render instead of beginning after it.
void useWorkoutStore.persist.rehydrate();
