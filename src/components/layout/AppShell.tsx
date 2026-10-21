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
        The sync badge and the nav share one fixed band, and the badge is anchored to the TOP of
        that band.

        It used to be rendered between `<main>` and the nav, which is exactly where the nav paints:
        at 360×740 its box measured y 694→732 under a nav at y 678.5, completely behind it, and the
        three screens with nothing else to say left a queued session with no visible sign at all. A
        write can be queued at any moment and on any screen.

        Anchored to the band instead of to a fixed distance from the bottom of the viewport: the nav
        is 61.5px tall at the default font size, and it grows when the person enlarges the text — so
        an offset written in rems (4rem = 64px) leaves 2.5px of clearance today and covers the badge
        tomorrow. Sitting on the band's top edge, the badge keeps its distance from the nav whatever
        the nav measures.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40">
        <div className="pointer-events-none absolute inset-x-0 bottom-full">
          <div className="mx-auto w-full max-w-lg px-4">
            <SyncBadge />
          </div>
        </div>

        <BottomNav />
      </div>
    </div>
  );
}
