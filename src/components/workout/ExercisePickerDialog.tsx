import * as Dialog from '@radix-ui/react-dialog';
import Fuse from 'fuse.js';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { useCatalog } from '../../hooks/useCatalog.ts';
import type { CatalogExercise } from '../../lib/catalog-api.ts';
import { normalizeForSearch } from '../../lib/utils.ts';
import { Input } from '../ui/Input.tsx';
import { Skeleton } from '../ui/Skeleton.tsx';

/**
 * The exercise picker.
 *
 * It opens on top of the workout, so it is built to be dismissed as fast as it
 * opens: search is focused first, the list is a single tap, and choosing closes.
 * Radix supplies the dialog semantics — focus trap, escape, `aria-modal` — which
 * is the reason it is a dependency at all; the rest is the catalogue that T3.4
 * already caches, so opening it offline is instant.
 *
 * Radix is deliberately not in the initial bundle: this component is reached only
 * through the lazily loaded workout route.
 */

type ExercisePickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSelect: (exercise: CatalogExercise) => void;
  onCreateCustom: (name: string, muscleGroupId: string | null) => void;
  /**
   * Exercises invented earlier in this session, which the catalogue has never heard
   * of: a custom exercise only reaches the server when the workout using it is saved.
   */
  localExercises?: CatalogExercise[];
};

type ExerciseSection = {
  /** The muscle group, or null for the exercises that have none. */
  id: string | null;
  name: string;
  exercises: CatalogExercise[];
};

/** How far fuse is allowed to stray. Loose enough for a typo, tight enough to stay useful. */
const FUZZINESS = 0.34;

/**
 * Stable empty list, so the default for `localExercises` does not build a new array
 * on every render and throw away the fuse index with it.
 */
const NO_LOCAL_EXERCISES: CatalogExercise[] = [];

export function ExercisePickerDialog({
  open,
  onOpenChange,
  userId,
  onSelect,
  onCreateCustom,
  localExercises,
}: ExercisePickerDialogProps) {
  const catalog = useCatalog(userId);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGroupId, setNewGroupId] = useState<string | null>(null);

  /*
   * Held in memos so their identity is stable across a keystroke. Without this
   * the `?? []` fallback builds a new array on every render, and the memos that
   * depend on it — including the fuse index — would be thrown away and rebuilt
   * on every character typed.
   */
  const local = localExercises ?? NO_LOCAL_EXERCISES;
  const exercises = useMemo(
    () => [...local, ...(catalog.data?.exercises ?? [])],
    [catalog.data, local],
  );
  const muscleGroups = useMemo(() => catalog.data?.muscleGroups ?? [], [catalog.data]);

  /*
   * Only groups that actually hold something. A chip that leads to an empty list
   * is worse than no chip, and the seed did ship empty groups once (M5), so the
   * screen does not take the data's word for it.
   */
  const offeredGroups = useMemo(
    () =>
      muscleGroups.filter((group) =>
        exercises.some((exercise) => exercise.muscleGroupId === group.id),
      ),
    [exercises, muscleGroups],
  );

  const scoped = useMemo(
    () =>
      groupId === null
        ? exercises
        : exercises.filter((exercise) => exercise.muscleGroupId === groupId),
    [exercises, groupId],
  );

  /*
   * The search runs over the group-scoped list, not the whole catalogue, so the
   * filter and the text cannot disagree: "press" inside Tríceps has to come back
   * empty, not quietly pull Press Banca back in.
   *
   * Names are folded once here rather than per keystroke, and both sides go
   * through the same folding, which is what makes an unaccented search work.
   */
  const searchable = useMemo(
    () => scoped.map((exercise) => ({ exercise, name: normalizeForSearch(exercise.name) })),
    [scoped],
  );

  const fuse = useMemo(
    () => new Fuse(searchable, { keys: ['name'], threshold: FUZZINESS, ignoreLocation: true }),
    [searchable],
  );

  const results = useMemo(() => {
    const normalized = normalizeForSearch(query);

    return normalized === '' ? scoped : fuse.search(normalized).map((match) => match.item.exercise);
  }, [fuse, query, scoped]);

  /**
   * The results, in the sections S1 asks for.
   *
   * The groups are ordered by the catalogue — alphabetically, as the server returns them — and
   * not by the order the exercises happen to arrive, so a section does not move around as the
   * search narrows.
   *
   * Whatever has no group goes last, in a section of its own. A custom exercise can be created
   * without a group, and a grouped list that dropped those would hide them from the only screen
   * that can add them to a workout.
   */
  const sections = useMemo<ExerciseSection[]>(() => {
    const byGroup = new Map<string | null, CatalogExercise[]>();

    for (const exercise of results) {
      const group = exercise.muscleGroupId;

      byGroup.set(group, [...(byGroup.get(group) ?? []), exercise]);
    }

    const named: ExerciseSection[] = muscleGroups
      .map((group) => ({
        id: group.id,
        name: group.name,
        exercises: byGroup.get(group.id) ?? [],
      }))
      .filter((section) => section.exercises.length > 0);

    const ungrouped = byGroup.get(null) ?? [];

    return ungrouped.length > 0
      ? [...named, { id: null, name: 'Sin grupo', exercises: ungrouped }]
      : named;
  }, [muscleGroups, results]);

  const hasQuery = query.trim() !== '';
  const trimmedName = newName.trim();

  function choose(exercise: CatalogExercise) {
    onSelect(exercise);
    onOpenChange(false);
  }

  function create() {
    // Whitespace is not a name. The schema and `save_workout` refuse it too, but by
    // then the exercise is already in the draft and the user meets it at "Finalizar".
    if (trimmedName === '') {
      return;
    }

    onCreateCustom(trimmedName, newGroupId);
    onOpenChange(false);
  }

  /*
   * The dialog is hidden, not unmounted, so state set here outlives closing. Clearing
   * the half-typed exercise on the way out is what stops a reopened picker from
   * showing the previous name one tap away from a duplicate.
   */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setIsCreating(false);
      setNewName('');
      setNewGroupId(null);
    }

    onOpenChange(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay bg-text/60 fixed inset-0" />
        <Dialog.Content
          // No description: the title and the controls say everything, and Radix
          // wants the decision made explicitly rather than guessed.
          /*
           * It stays a dialog, and that is the answer the craft floor asks for rather than an
           * oversight: the sheet holds a search field and a form that can be half written, so it
           * needs protected focus and a deliberate dismissal. What the floor prohibits is a modal
           * for a task that needs neither.
           *
           * As a container it is square and separated by a rule, not rounded: in this world radii
           * belong to controls.
           */
          className="border-rule bg-bg fixed inset-x-0 bottom-0 flex max-h-[85vh] flex-col border-t-2 p-4 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[80vh] sm:w-[32rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border-2"
          // The decision Radix asks for explicitly instead of guessing: the title and the controls
          // say everything, so there is no description to point at.
          aria-describedby={undefined}
        >
          <Dialog.Title className="font-display text-xl font-black tracking-tight">
            Agregar ejercicio
          </Dialog.Title>

          <div className="mt-3">
            <Input
              label="Buscar"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Press, sentadilla, curl…"
              autoComplete="off"
            />
          </div>

          <div
            role="group"
            aria-label="Filtrar por grupo muscular"
            className="mt-3 flex flex-wrap gap-2"
          >
            <GroupChip selected={groupId === null} onClick={() => setGroupId(null)}>
              Todos
            </GroupChip>
            {offeredGroups.map((group) => (
              <GroupChip
                key={group.id}
                selected={groupId === group.id}
                onClick={() => setGroupId(group.id)}
              >
                {group.name}
              </GroupChip>
            ))}
          </div>

          {/*
            Creating is local, so this sits outside the catalogue's pending and error
            branches on purpose: needing the server reachable to invent an exercise
            would remove the one thing the app promises when offline — which is exactly
            when a catalogue request fails.
          */}
          {isCreating ? (
            <form
              className="border-rule mt-3 space-y-3 border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                create();
              }}
            >
              <Input
                label="Nombre del ejercicio"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Press con banda"
                autoComplete="off"
              />

              <div className="space-y-1.5">
                <label htmlFor="new-exercise-group" className="block text-sm font-medium">
                  Grupo muscular
                </label>
                <select
                  id="new-exercise-group"
                  value={newGroupId ?? ''}
                  onChange={(event) =>
                    setNewGroupId(event.target.value === '' ? null : event.target.value)
                  }
                  className="border-rule min-h-12 w-full rounded-none border-0 border-b bg-transparent px-1 text-base"
                >
                  <option value="">Sin grupo</option>
                  {/*
                    Every group, not only the ones that already hold something: a new
                    exercise may well be the first one in its group, which is the case
                    the filter chips above deliberately hide (M5).
                  */}
                  {muscleGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* A submitting form, so the phone keyboard's go key creates it. */}
              <button
                type="submit"
                disabled={trimmedName === ''}
                className="bg-primary min-h-12 w-full rounded-sm px-4 font-medium text-white disabled:opacity-50"
              >
                Crear
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="border-rule hover:bg-surface mt-3 min-h-12 w-full rounded-sm border px-4 text-sm"
            >
              Nuevo ejercicio
            </button>
          )}

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {catalog.isPending ? (
              <div role="status" aria-label="Cargando ejercicios" className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : catalog.isError ? (
              // An empty list and a denied query look identical on screen, so the
              // failure says so instead of looking like an empty catalogue.
              <p role="alert" className="text-danger py-6 text-sm">
                No pudimos cargar los ejercicios. Revisá tu conexión e intentá de nuevo.
              </p>
            ) : (
              <>
                {sections.length === 0 ? (
                  <p className="text-muted py-6 text-sm">
                    {hasQuery
                      ? 'No encontramos ejercicios con ese nombre.'
                      : 'Todavía no hay ejercicios disponibles.'}
                  </p>
                ) : null}
                {sections.map((section) => {
                  // One id per section, used twice: it names the region and it names the list
                  // inside it, so a screen reader hears which group an exercise belongs to.
                  const headingId = `seccion-${section.id ?? 'sin-grupo'}`;

                  return (
                    <section
                      key={headingId}
                      aria-labelledby={headingId}
                      className="mt-5 first:mt-0"
                    >
                      <h3
                        id={headingId}
                        className="border-rule text-muted mb-1 border-b pb-1 text-xs font-semibold tracking-wide uppercase"
                      >
                        {section.name}
                      </h3>

                      <ul aria-labelledby={headingId}>
                        {section.exercises.map((exercise) => (
                          <li key={exercise.id}>
                            <button
                              type="button"
                              onClick={() => choose(exercise)}
                              className="border-rule hover:bg-surface min-h-12 w-full border-b px-1 text-left"
                            >
                              {exercise.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </>
            )}
          </div>

          <div className="mt-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="border-rule hover:bg-surface min-h-12 w-full rounded-sm border px-4"
              >
                Cancelar
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GroupChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // `aria-pressed` rather than a colour change alone: the filter state has to
      // be audible, not just visible.
      aria-pressed={selected}
      onClick={onClick}
      /*
       * The selected chip is ink, not accent. The red is for what was replaced and for what can be
       * pressed to move the workout forward; which group is being filtered is a state, and painting
       * six chips red would spend the accent on a filter.
       */
      className={`min-h-12 rounded-sm border px-3 text-sm transition-colors motion-reduce:transition-none ${
        selected ? 'bg-text border-text text-bg' : 'border-rule text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}
