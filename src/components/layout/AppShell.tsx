import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav.tsx';
import { SyncBadge } from './SyncBadge.tsx';

/**
 * Application shell.
 *
 * Mobile-first: a single column capped at `max-w-lg` so it stays readable on a
 * tablet, with bottom padding that reserves the space the fixed nav occupies.
 * The nav is the only place with `backdrop-filter` (see index.css).
 */
export function AppShell() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Saltar al contenido
      </a>

      <main id="contenido" className="flex-1 px-4 pt-6 pb-28">
        <Outlet />
      </main>

      {/* Above the nav and below the content: it can appear at any moment, while the
          user is anywhere in the app. */}
      <SyncBadge />

      <BottomNav />
    </div>
  );
}
