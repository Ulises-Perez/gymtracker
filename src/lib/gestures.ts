/**
 * The decisions a gesture makes, kept apart from the gesture itself.
 *
 * A swipe is a pointer interaction and a reorder is a drag, and neither can be driven honestly
 * in jsdom: there is no layout for dnd-kit to measure against, and no real velocity behind a
 * synthesised pointer event. What can be pinned is the arithmetic — how far is far enough, and
 * which positions two ids mean — so it lives here, where a test can reach it.
 */

export type SwipeMovement = {
  /** How far the card travelled, in CSS pixels. Negative is leftwards. */
  offsetX: number;
  /** How fast it was moving when it was let go. Negative is leftwards. */
  velocityX: number;
};

/** How far a card has to travel before the swipe counts. */
const DELETE_DISTANCE = 120;

/** Or how fast, for a flick that never travels far. */
const DELETE_VELOCITY = 500;

/**
 * Whether letting go meant "delete this".
 *
 * Leftwards on both measures, and the same side for both on purpose: a drag or a flick back to
 * the right is someone changing their mind, and acting on its speed alone would destroy a
 * workout they were in the middle of. The distance threshold is what keeps a resting thumb or a
 * scroll that drifted from deleting the wrong card.
 */
export function isSwipeToDelete(movement: SwipeMovement): boolean {
  if (movement.offsetX > 0 || movement.velocityX > 0) {
    return false;
  }

  return (
    Math.abs(movement.offsetX) >= DELETE_DISTANCE || Math.abs(movement.velocityX) >= DELETE_VELOCITY
  );
}

export type ReorderRequest = {
  from: number;
  to: number;
};

/**
 * The positions a finished drag asks for, or nothing when it asked for nothing.
 *
 * dnd-kit reports ids and the store takes positions; this is where one becomes the other. Every
 * "nothing" case is a drag that did not move anything: dropped where it started, dropped outside
 * any card, or an id that is no longer in the list — which is what a card removed mid-drag looks
 * like, and is the only one of the three that really happens.
 */
export function reorderRequest(
  ids: readonly string[],
  activeId: string,
  overId: string | null,
): ReorderRequest | null {
  if (overId === null || activeId === overId) {
    return null;
  }

  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);

  if (from === -1 || to === -1) {
    return null;
  }

  return { from, to };
}
