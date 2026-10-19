import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearErrorLog, readErrorLog } from '../../lib/logging.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';

/**
 * The own error boundary that stands in for Sentry (T7.6).
 *
 * What it has to do is small and exact: catch what breaks the render, say in Spanish what
 * happened and what the person can do, retry by remounting the tree — never by reloading the
 * page, because a reload would throw away the workout that is in progress— and show the
 * message and stack in a folded detail with a copy control that only exists when the browser
 * actually has a clipboard.
 */

const STACK = 'Error: falla de render\n    at Pantalla (src/pages/WorkoutPage.tsx:1:1)';

function errorWithStack(message: string): Error {
  const error = new Error(message);

  error.stack = STACK;

  return error;
}

// Annotated, because a component that only throws infers `void` and JSX refuses it.
function ChildThatAlwaysFails(): ReactNode {
  throw errorWithStack('falla de render');
}

/**
 * Holds state while it works, and throws while `cause.broken`. The state is what makes a retry
 * provable: a remounted tree starts over, a reused one would keep what it had.
 */
function StatefulChild({ cause }: { cause: { broken: boolean } }) {
  const [note, setNote] = useState('borrador');

  if (cause.broken) {
    throw errorWithStack('falla de render');
  }

  return (
    <button type="button" onClick={() => setNote('cambiada')}>
      {note}
    </button>
  );
}

/** The copy control claims what the clipboard resolved to, so it is awaited, not assumed. */
function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

beforeEach(() => {
  clearErrorLog();
  // React logs a caught error through `console.error`. What this file asserts is the boundary
  // and the log it feeds, not React's own message, so the noise is silenced here and the
  // "clean console" rule is proven on the logger itself (`logging.test.ts`).
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
  clearErrorLog();
});

describe('ErrorBoundary', () => {
  it('renders its children untouched when nothing throws', () => {
    const { container } = render(
      <ErrorBoundary>
        <main>
          <h1>Miércoles, 15 de octubre</h1>
        </main>
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Miércoles, 15 de octubre' })).toBeInTheDocument();
    // No wrapper of its own: the shell keeps owning the page.
    expect(container.firstElementChild?.tagName).toBe('MAIN');
    expect(readErrorLog()).toEqual([]);
  });

  it('replaces the broken screen and says what happened and what can be done, in Spanish', () => {
    render(
      <ErrorBoundary>
        <ChildThatAlwaysFails />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Algo se rompió' })).toBeInTheDocument();
    expect(screen.getByText(/no pudimos mostrar esta pantalla/i)).toBeInTheDocument();
    expect(
      screen.getByText(/lo que ya estaba guardado en este teléfono sigue ahí/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('records the caught error with the render origin and nothing else', () => {
    render(
      <ErrorBoundary>
        <ChildThatAlwaysFails />
      </ErrorBoundary>,
    );

    const entries = readErrorLog();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: 'render',
      name: 'Error',
      message: 'falla de render',
      stack: STACK,
    });
    expect(Object.keys(entries[0]!).sort()).toEqual(['at', 'message', 'name', 'source', 'stack']);
  });

  it('brings the screen back by remounting on retry, not by reloading the page', () => {
    // What breaks is the world, not the button: retrying only renders again, so whatever was wrong
    // has to be fixed from outside for the screen to come back. A reload would not come back at all.
    const cause = { broken: false };

    const { rerender } = render(
      <ErrorBoundary>
        <StatefulChild cause={cause} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'borrador' }));
    expect(screen.getByRole('button', { name: 'cambiada' })).toBeInTheDocument();

    cause.broken = true;
    rerender(
      <ErrorBoundary>
        <StatefulChild cause={cause} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Algo se rompió' })).toBeInTheDocument();

    cause.broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Back to the initial value: the tree came back as a fresh instance, which is what clearing the
    // boundary's state does and what neither a reload nor a reused tree could produce.
    expect(screen.getByRole('button', { name: 'borrador' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Algo se rompió' })).not.toBeInTheDocument();
  });

  it('keeps the detail folded and prints the message and the stack inside it', () => {
    render(
      <ErrorBoundary>
        <ChildThatAlwaysFails />
      </ErrorBoundary>,
    );

    const detail = screen.getByText('Detalle').closest('details');

    expect(detail).not.toBeNull();
    expect(detail).not.toHaveAttribute('open');
    expect(screen.getByText('falla de render')).toBeInTheDocument();
    expect(
      screen.getByText(/at Pantalla \(src\/pages\/WorkoutPage\.tsx:1:1\)/),
    ).toBeInTheDocument();
  });

  it('hides the copy control when the browser has no clipboard, and keeps the detail readable', () => {
    render(
      <ErrorBoundary>
        <ChildThatAlwaysFails />
      </ErrorBoundary>,
    );

    expect(screen.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/at Pantalla \(src\/pages\/WorkoutPage\.tsx:1:1\)/),
    ).toBeInTheDocument();
  });

  it('copies the message and the stack when the clipboard exists, and says so', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);

    stubClipboard(writeText);

    render(
      <ErrorBoundary>
        <ChildThatAlwaysFails />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    expect(await screen.findByText('Copiado')).toBeInTheDocument();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`falla de render\n\n${STACK}`));
  });

  it('leaves the screen standing when the clipboard refuses the copy', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('no'));

    stubClipboard(writeText);

    render(
      <ErrorBoundary>
        <ChildThatAlwaysFails />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Algo se rompió' })).toBeInTheDocument();
    expect(screen.queryByText('Copiado')).not.toBeInTheDocument();
    expect(screen.getByText(/at Pantalla/)).toBeInTheDocument();
  });
});
