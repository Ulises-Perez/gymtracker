import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { isSwipeToDelete, reorderRequest } from '../../lib/gestures.ts';
import type { WorkoutExerciseDraft, WorkoutSetPatch } from '../../stores/workout-store.ts';
import { WorkoutExerciseCard } from './WorkoutExerciseCard.tsx';

/**
 * The exercise list, with the two gestures S6 asks for: swipe a card away, drag one into place.
 *
 * Both live here and not in the card because this component is loaded lazily, and that is the
 * point of it: dnd-kit and Motion are the two heaviest dependencies in the workout route, and the
 * list is the only thing that needs them. Keeping them behind one `import()` puts both in their
 * own chunk, which is what the plan's code-splitting table asks for.
 *
 * The cards themselves are unchanged and still own nothing: every gesture ends in the same
 * callbacks a button would call, so a finger and a keyboard take the same path into the store.
 */

type SortableExerciseListProps = {
  cards: WorkoutExerciseDraft[];
  /** What each exercise is called, by id. The draft holds ids, as everywhere else. */
  names: Map<string, string>;
  onReorder: (from: number, to: number) => void;
  onAddSet: (cardId: string, seed?: WorkoutSetPatch) => void;
  onUpdateSet: (cardId: string, setId: string, patch: WorkoutSetPatch) => void;
  onRemoveSet: (cardId: string, setId: string) => void;
  onRemoveExercise: (cardId: string) => void;
};

export function SortableExerciseList({
  cards,
  names,
  onReorder,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onRemoveExercise,
}: SortableExerciseListProps) {
  const sensors = useSensors(
    /*
     * A pointer has to travel a few pixels before a drag begins. Without that constraint, a
     * scroll that happens to start on a card picks it up and reorders the list under the user's
     * thumb — and the user has no idea it happened.
     */
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    /*
     * The keyboard path is not a fallback bolted on: reordering is only otherwise possible by
     * dragging, which means it is simply unavailable without a pointer. It is also the path a
     * browser test can drive deterministically.
     */
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => cards.map((card) => card.id), [cards]);

  function handleDragEnd(event: DragEndEvent): void {
    const request = reorderRequest(
      ids,
      String(event.active.id),
      event.over ? String(event.over.id) : null,
    );

    if (request) {
      onReorder(request.from, request.to);
    }
  }

  function nameOf(card: WorkoutExerciseDraft): string {
    return names.get(card.exerciseId) ?? 'Ejercicio';
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label="Ejercicios del entrenamiento" className="mt-4 space-y-6">
          {cards.map((card) => (
            <SortableExercise
              key={card.id}
              id={card.id}
              name={nameOf(card)}
              onSwipeAway={() => onRemoveExercise(card.id)}
            >
              <WorkoutExerciseCard
                name={nameOf(card)}
                card={card}
                onAddSet={(seed) => onAddSet(card.id, seed)}
                onUpdateSet={(setId, patch) => onUpdateSet(card.id, setId, patch)}
                onRemoveSet={(setId) => onRemoveSet(card.id, setId)}
                onRemoveExercise={() => onRemoveExercise(card.id)}
              />
            </SortableExercise>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableExercise({
  id,
  name,
  onSwipeAway,
  children,
}: {
  id: string;
  name: string;
  onSwipeAway: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <li
      ref={setNodeRef}
      // Only the vertical component: the list is sorted vertically, and letting a card fly
      // sideways while it is being reordered would say something about the list that is not true.
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      // The lifted card is held over the others, so it has to look lifted for the user to know
      // which one they are moving.
      className={isDragging ? 'relative z-10 opacity-70' : undefined}
    >
      <div className="flex items-stretch gap-1">
        {/*
         * The handle is a sibling of the swiping surface and never inside it. Both gestures listen
         * for pointer events, so a handle within that surface would start a reorder and a swipe at
         * once, and the user would get whichever sensor won the race.
         *
         * It is the only way to reorder a card, so it is drawn in the muted ink and not in the
         * separator rule: `text-rule` on the paper is six dots at 1.30:1, and the muted ink is the
         * same 4.83:1 the rest of the screen's secondary ink already uses. The target is 44 wide by
         * 48 tall -- never narrower than the 32 it had, on the floor the row's own delete control
         * sits on -- because this is a control used mid-set, with a thumb.
         */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Mover ${name}`}
          className="text-muted hover:text-text flex min-h-12 w-11 shrink-0 cursor-grab touch-none items-center justify-center"
        >
          {/* Drawn, not typed: the project already decided against glyphs as icons, and the braille
              character that used to sit here renders differently on every platform. */}
          <span aria-hidden="true">
            <GripGlyph />
          </span>
        </button>

        {/*
         * The swipe is an addition and never the only way out: the card keeps its own "Quitar"
         * button, which is what a keyboard and a screen reader use.
         */}
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.5}
          onDragEnd={(_event, info) => {
            if (isSwipeToDelete({ offsetX: info.offset.x, velocityX: info.velocity.x })) {
              onSwipeAway();
            }
          }}
          // Horizontal swipes are the gesture; vertical scrolling still belongs to the page.
          className="min-w-0 flex-1 touch-pan-y"
        >
          {children}
        </motion.div>
      </div>
    </li>
  );
}

/** Two ruled rows of dots, which is a drag handle drawn in the world's own language. */
function GripGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 20" className="h-5 w-3" fill="currentColor">
      <circle cx="3" cy="5" r="1.5" />
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="3" cy="10" r="1.5" />
      <circle cx="9" cy="10" r="1.5" />
      <circle cx="3" cy="15" r="1.5" />
      <circle cx="9" cy="15" r="1.5" />
    </svg>
  );
}
