import type { ReactNode } from 'react';

/**
 * Shared frame for the auth screens: one column, centred in the viewport and
 * capped at the shell's own `max-w-lg`, so the app does not look like two
 * different apps before and after logging in.
 *
 * Each screen passes its own title, which is the `h1` of that screen, so the
 * document outline stays meaningful without a heading component per screen.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="bg-surface rounded-lg p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted mt-2 text-sm">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="text-muted mt-6 text-center text-sm">{footer}</div> : null}
    </main>
  );
}
