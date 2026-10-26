import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

/**
 * Labelled text input that carries its own error.
 *
 * The wiring matters as much as the look: the label points at the input, and
 * `aria-describedby` points at the message, so assistive technology announces
 * the reason and not just a red border. The error is also a live region, since
 * it appears after the user acts.
 *
 * The field is a ruled line with no box around it, which is the line the notebook
 * already prints. It does not declare focus either: the outline comes from
 * `index.css`, so the state looks the same wherever it lands.
 *
 * The writing sits ON that rule and not in the middle of the box. The box has to be
 * 48px tall -- it is the touch target -- and a 48px field with its single line
 * centred leaves the value floating around 24px above its own line, in the air over
 * the page, which is the one thing a ruled page never does. So the line of type is
 * pushed down instead: 20px above it and nothing below, so one line of 24px ends
 * where the 1px rule begins. The label keeps its place above the field; the gap it
 * leaves is now air over the writing rather than under it.
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
        className={`border-rule placeholder:text-muted focus:border-text min-h-12 w-full rounded-none border-0 border-b bg-transparent px-1 pt-5 text-base ${className ?? ''}`.trim()}
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
