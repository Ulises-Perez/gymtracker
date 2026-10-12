import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

/**
 * Labelled text input that carries its own error.
 *
 * The wiring matters as much as the look: the label points at the input, and
 * `aria-describedby` points at the message, so assistive technology announces
 * the reason and not just a red border. The error is also a live region, since
 * it appears after the user acts.
 */
type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({ label, error, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`bg-bg placeholder:text-muted ring-white/15 focus-visible:ring-primary min-h-12 w-full rounded-md px-3 text-base ring-1 outline-none focus-visible:ring-2 ${className ?? ''}`.trim()}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
