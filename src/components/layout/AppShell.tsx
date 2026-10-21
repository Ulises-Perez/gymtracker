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

      {/*
        The sync badge, in the band the content column already reserves for the fixed nav.

        It has to be anchored to the viewport and not to the flow. Rendered between `<main>` and the
        nav it was laid out at the end of the column -- which is exactly where the nav paints -- so at
        360×740 its box measured y 694→732 under a nav at y 678.5: completely behind it, and the three
        screens with nothing else to say left a queued session with no visible sign at all. A write can
        be queued at any moment and on any screen, so pinning it is also what keeps it visible with a
        long history under it.

        The offset is a nav-height up (the nav measures 61.5px, plus whatever the system reserves at
        the bottom), and the arithmetic is the reason it hides nothing: 4rem of offset plus the
        badge's own ~2.5rem ends inside the 7rem (`pb-28`) every screen already leaves empty for the
        nav. `pointer-events-none` because a status line is not a control: it must never eat a tap
        meant for the page underneath.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-lg px-4">
        <SyncBadge />
      </div>

      <BottomNav />
    </div>
  );
}
