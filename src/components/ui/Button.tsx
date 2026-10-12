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
 * fill, `#f0f0f5` lands at 4.28:1 and misses AA for body text, while white
 * reaches 4.86:1.
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
      className={`bg-primary min-h-12 inline-flex items-center justify-center rounded-md px-4 text-base font-medium text-white transition-colors hover:bg-primary-soft focus-visible:ring-primary-soft focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60 ${className ?? ''}`.trim()}
      {...rest}
    />
  );
}
