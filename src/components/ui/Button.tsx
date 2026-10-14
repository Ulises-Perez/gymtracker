import type { ButtonHTMLAttributes } from 'react';

/**
 * Primary action button.
 *
 * A pending action is shown by the label the caller passes (the plan forbids
 * spinners) plus `aria-busy`, and the button disables itself so a double tap on
 * a slow connection cannot send the same request twice.
 *
 * `min-h-12` keeps the tap target at 48px, above the 44px the UI audit checks.
 *
 * The label is pure white, not the `text` token: measured against the primary
 * fill white reaches 5.3:1, and against the pressed fill 7.2:1. Hover darkens
 * instead of lightening, because the soft red is a tint for ground and carries
 * no white label at 2.4:1.
 *
 * It paints no ring of its own: focus is declared once in `index.css`, and a
 * control that drew its own would be the second declaration of the same rule.
 */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean };

export function Button({
  pending = false,
  disabled,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`bg-primary hover:bg-primary-strong min-h-12 inline-flex items-center justify-center rounded-md px-4 text-base font-medium text-white transition-colors motion-reduce:transition-none disabled:opacity-60 ${className ?? ''}`.trim()}
      {...rest}
    />
  );
}
