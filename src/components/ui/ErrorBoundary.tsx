import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { logError } from '../../lib/logging.ts';

/**
 * The app's own error boundary, and the replacement for Sentry (T7.6).
 *
 * Sentry is not installed —that is a recorded decision, not an omission—, so what the DoD asked
 * for ("a public URL with no errors") is covered here: something that catches what breaks the
 * render, tells the person in Spanish what happened and what they can do, and keeps the detail
 * available without asking for a network round trip.
 *
 * Two decisions are worth naming, because both are the difference between this and the obvious
 * implementation:
 *
 * - **Retry remounts the tree, it does not reload the page.** A reload would throw away the
 *   workout in progress, which is the one thing this product exists to not lose. Clearing the
 *   boundary's own state re-renders the children, and since they were unmounted while the
 *   fallback was on screen, they come back as fresh instances.
 * - **The copy control only exists when the browser has a clipboard.** `navigator.clipboard` is
 *   absent on insecure origins and in older WebViews, and a button that does nothing is worse
 *   than no button; without it the detail is still on screen, selectable, and readable.
 *
 * The world is the notebook's: a ruled block, no card, no shadow, the accent left out —nothing
 * here replaces a value or advances a workout— and a ruled control for the one action.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  /*
   * The flag is separate from the value on purpose: what was thrown is `unknown`, and `throw null`
   * would otherwise read as "nothing happened" and quietly render a tree that is already broken.
   */
  failed: boolean;
  error: unknown;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, error: null, copied: false };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { failed: true, error, copied: false };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    // Only the error travels. `info.componentStack` is a framework stack —long, and not a fact
    // about the failure— and the log accepts nothing else anyway.
    logError(error, 'render');
  }

  private readonly retry = (): void => {
    this.setState({ failed: false, error: null, copied: false });
  };

  private readonly copyDetail = (text: string): void => {
    const clipboard = navigator.clipboard;

    if (!clipboard) {
      return;
    }

    // The promise rejects when permission is refused; the screen stays standing either way and
    // the detail is still there to read or select by hand.
    void clipboard.writeText(text).then(
      () => this.setState({ copied: true }),
      () => this.setState({ copied: false }),
    );
  };

  render(): ReactNode {
    const { failed, error, copied } = this.state;

    if (!failed) {
      return this.props.children;
    }

    const message = error instanceof Error ? error.message : '(valor inesperado)';
    const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : null;
    const detail = stack ? `${message}\n\n${stack}` : message;
    const canCopy = typeof navigator.clipboard?.writeText === 'function';

    return (
      <main className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
        {/*
          An alert and not a quiet screen: it appears without the person doing anything, and it
          replaces what they were looking at.
        */}
        <div role="alert" className="border-text border-t-2 pt-4">
          <h1 className="font-display text-3xl font-black tracking-tight">Algo se rompió</h1>
          <p className="mt-2 text-base">No pudimos mostrar esta pantalla.</p>
          {/* Said plainly, because the fear after a crash is having lost the workout. */}
          <p className="text-muted mt-1 text-sm">
            Lo que ya estaba guardado en este teléfono sigue ahí. Probá de nuevo.
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="border-rule hover:bg-surface mt-6 min-h-12 w-full rounded-sm border px-4"
          >
            Reintentar
          </button>

          <details className="border-rule mt-6 border-t pt-4">
            <summary className="min-h-12 cursor-pointer text-sm font-medium">Detalle</summary>
            <p className="text-muted mt-2 text-sm">{message}</p>
            {stack ? (
              <pre className="text-muted mt-1 max-h-48 overflow-auto text-xs break-words whitespace-pre-wrap">
                {stack}
              </pre>
            ) : null}
            {canCopy ? (
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => this.copyDetail(detail)}
                  className="border-rule hover:bg-surface min-h-12 rounded-sm border px-4 text-sm"
                >
                  Copiar
                </button>
                {/* Announced, not just printed: the answer to the press has to reach a reader. */}
                <span role="status" className="text-muted text-sm">
                  {copied ? 'Copiado' : ''}
                </span>
              </div>
            ) : null}
          </details>
        </div>
      </main>
    );
  }
}
