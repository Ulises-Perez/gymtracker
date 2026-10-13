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
};

/** How far fuse is allowed to stray. Loose enough for a typo, tight enough to stay useful. */
const FUZZINESS = 0.34;

export function ExercisePickerDialog({
  open,
  onOpenChange,
  userId,
  onSelect,
}: ExercisePickerDialogProps) {
  const catalog = useCatalog(userId);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);

  /*
   * Held in memos so their identity is stable across a keystroke. Without this
   * the `?? []` fallback builds a new array on every render, and the memos that
   * depend on it — including the fuse index — would be thrown away and rebuilt
   * on every character typed.
   */
  const exercises = useMemo(() => catalog.data?.exercises ?? [], [catalog.data]);
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

  const hasQuery = query.trim() !== '';

  function choose(exercise: CatalogExercise) {
    onSelect(exercise);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay fixed inset-0 bg-black/60" />
        <Dialog.Content
          // No description: the title and the controls say everything, and Radix
          // wants the decision made explicitly rather than guessed.
          aria-describedby={undefined}
          className="bg-surface fixed inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl p-4 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[80vh] sm:w-[32rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <Dialog.Title className="text-lg font-semibold">Agregar ejercicio</Dialog.Title>

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
                {results.length === 0 ? (
                  <p className="text-muted py-6 text-sm">
                    {hasQuery
                      ? 'No encontramos ejercicios con ese nombre.'
                      : 'Todavía no hay ejercicios disponibles.'}
                  </p>
                ) : null}
                {/* Rendered even when empty, so "no results" is an empty list
                    rather than a missing one. */}
                <ul aria-label="Ejercicios" className="space-y-1">
                  {results.map((exercise) => (
                    <li key={exercise.id}>
                      <button
                        type="button"
                        onClick={() => choose(exercise)}
                        className="ring-white/10 hover:bg-bg focus-visible:ring-primary min-h-12 w-full rounded-md px-3 text-left ring-1 focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {exercise.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="mt-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="ring-white/15 hover:bg-bg min-h-12 w-full rounded-md px-4 ring-1"
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
      className={`min-h-12 rounded-md px-3 text-sm ring-1 transition-colors focus-visible:ring-2 focus-visible:outline-none ${
        selected ? 'bg-primary ring-primary text-white' : 'ring-white/15 hover:bg-bg'
      }`}
    >
      {children}
    </button>
  );
}
