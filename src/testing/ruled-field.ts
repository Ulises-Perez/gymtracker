/**
 * The geometry of a ruled field, read from the class list.
 *
 * jsdom has no layout engine -- it never applies the stylesheet -- so there is no rectangle to
 * measure, and the one thing that decides where the writing lands is the field's own vertical
 * padding. These helpers read it and the assertions do the arithmetic instead of trusting it.
 *
 * They live here because two test files need them and the batch that produced them was arguing
 * against exactly this: a colour, a rule or a padding copied ten times is ten chances for one
 * copy to be the only one that is right.
 */

/** 4px per step: the project's only spacing scale (`--spacing`, 0.25rem), and nothing declares its own. */
export const SPACING_STEP_PX = 4;

/** One line of the interface face at `text-base`: 16px at the design's 1.5 line-height. */
export const LINE_BOX_PX = 24;

/** `min-h-12`: the touch target, which this change is not allowed to shrink. */
export const FIELD_PX = 48;

/** The vertical padding of a field, in px, read from its classes. */
export function spacingOf(element: HTMLElement, side: 'top' | 'bottom'): number {
  const axis = side === 'top' ? 't' : 'b';

  for (const prefix of [`p${axis}`, 'py', 'p']) {
    const match = new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.\\d+)?)(?:\\s|$)`).exec(
      element.className,
    );

    if (match) {
      return Number(match[1]) * SPACING_STEP_PX;
    }
  }

  return 0;
}

/** How far above the field's own bottom edge the last line of writing ends, in px. */
export function writingGap(element: HTMLElement): number {
  return FIELD_PX - (spacingOf(element, 'top') + LINE_BOX_PX + spacingOf(element, 'bottom'));
}
