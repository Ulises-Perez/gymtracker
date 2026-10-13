import { describe, expect, it } from 'vitest';

import { isSwipeToDelete, reorderRequest } from './gestures.ts';

/**
 * The two decisions the gesture layer makes, tested away from the gestures themselves.
 *
 * This split is the point of the module. A swipe is a pointer interaction and a reorder is a
 * drag, and neither can be driven honestly in jsdom — there is no layout for dnd-kit to measure
 * against and no real velocity behind a synthesised pointer event. What can be pinned is the
 * arithmetic: how far is far enough, and which positions two ids mean. Keeping those out of the
 * components is what makes them testable at all.
 */

describe('deciding that a swipe meant delete', () => {
  it('takes a deliberate drag to the left', () => {
    expect(isSwipeToDelete({ offsetX: -140, velocityX: -50 })).toBe(true);
  });

  it('takes a short flick, because a flick is what a swipe usually is', () => {
    // Well under the distance, but fast enough that waiting for distance would feel broken.
    expect(isSwipeToDelete({ offsetX: -20, velocityX: -900 })).toBe(true);
  });

  it('ignores a small, slow movement', () => {
    // The case that matters: a thumb resting on the card, or a scroll that drifted. Deleting
    // here would delete the wrong thing, and the user would have no idea why.
    expect(isSwipeToDelete({ offsetX: -30, velocityX: -60 })).toBe(false);
  });

  it('ignores a drag to the right, however far it goes', () => {
    expect(isSwipeToDelete({ offsetX: 300, velocityX: 40 })).toBe(false);
  });

  it('ignores a fast flick to the right', () => {
    // The velocity check is on the same side as the distance check on purpose: a flick back to
    // the right is someone changing their mind, and acting on its speed alone would delete.
    expect(isSwipeToDelete({ offsetX: 10, velocityX: 1200 })).toBe(false);
  });

  it('counts exactly the threshold as far enough', () => {
    expect(isSwipeToDelete({ offsetX: -120, velocityX: 0 })).toBe(true);
  });
});

describe('turning a drag into positions', () => {
  const ids = ['a', 'b', 'c'];

  it('reports where the dragged card came from and where it was dropped', () => {
    expect(reorderRequest(ids, 'a', 'c')).toEqual({ from: 0, to: 2 });
  });

  it('reports nothing when the card was dropped where it started', () => {
    // Not merely a wasted store call: the store's own guard would refuse it, but reporting a
    // move that did not happen would still be a lie about what the user did.
    expect(reorderRequest(ids, 'b', 'b')).toBeNull();
  });

  it('reports nothing when the drag ended outside any card', () => {
    expect(reorderRequest(ids, 'a', null)).toBeNull();
  });

  it('reports nothing for an id that is not in the list', () => {
    // A card removed while it was being dragged is the realistic way this happens.
    expect(reorderRequest(ids, 'a', 'gone')).toBeNull();
    expect(reorderRequest(ids, 'gone', 'a')).toBeNull();
  });
});
