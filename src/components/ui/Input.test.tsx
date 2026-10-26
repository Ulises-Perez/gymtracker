import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { spacingOf, writingGap } from '../../testing/ruled-field.ts';
import { Input } from './Input.tsx';

/*
 * The shared field: it is what the workout screen, the login and the register pages render, so what
 * is asserted here is what every screen gets.
 */
describe('Input', () => {
  /**
   * The field stays a ruled line and not a box. What changed is where the writing sits inside it: the
   * value used to be centred in the 48px touch target, which left it floating 24px above its own
   * line, and in the notebook the writing rests on the line. The touch target does not shrink to buy
   * that -- the box is still 48px tall, only the line of type moves down.
   */
  it('writes the value on its rule instead of floating it above', () => {
    render(<Input label="Título" />);

    const field = screen.getByRole('textbox', { name: 'Título' });

    expect(field).toHaveClass('min-h-12');
    // The writing ends at the rule, inside the two or four pixels a line of type keeps for its
    // descenders -- and nothing lifts it with bottom padding.
    expect(writingGap(field)).toBeLessThanOrEqual(4);
    expect(spacingOf(field, 'bottom')).toBe(0);
  });

  /** Nothing about the field's shape moved with it: it is still a renglón and not a caja. */
  it('is still a ruled line with no box around it', () => {
    render(<Input label="Título" />);

    const field = screen.getByRole('textbox', { name: 'Título' });

    expect(field).toHaveClass(
      'border-b',
      'border-rule',
      'rounded-none',
      'bg-transparent',
      'placeholder:text-muted',
      'focus:border-text',
    );
  });

  /**
   * The label keeps its place above the field, and the error keeps its whole wiring: the words are a
   * live region, the field points at them, and it also says the value is invalid. None of that was
   * part of the fix, and it is asserted so that it cannot be lost by it.
   */
  it('keeps the label above and the error wired to the field', () => {
    render(<Input label="Título" error="Ese título es muy largo." />);

    const field = screen.getByRole('textbox', { name: 'Título' });

    expect(screen.getByLabelText('Título')).toBe(field);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Ese título es muy largo.');
    expect(screen.getByRole('alert')).toHaveTextContent('Ese título es muy largo.');
  });
});
