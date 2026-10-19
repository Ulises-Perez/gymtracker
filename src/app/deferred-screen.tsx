import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
import { hasStoredSession } from '../lib/stored-session.ts';

/**
 * The module of a screen, downloaded when the screen is going to be seen.
 *
 * A visitor without a session is about to be sent to the login screen, so the
 * screens behind the gate are not downloaded for them: the gate would throw
 * them away a moment later. With a session, the screen is downloaded right
 * away, exactly as it always was.
 */
export function lazyScreen(load: () => Promise<ComponentType>) {
  return async () => {
    if (!hasStoredSession()) {
      return { Component: deferredScreen(load) };
    }

    const Screen = await load();

    return { Component: Screen };
  };
}

/**
 * A screen that is downloaded when somebody is going to see it.
 *
 * React Router loads the `lazy` module of every route it matches, before it
 * renders anything. For a visitor without a session that means the dashboard,
 * the history, the charts and the schemas of the screens behind the gate:
 * eight requests and thirty kilobytes for screens the gate is about to send
 * them away from.
 *
 * The placeholder stands in for the screen and downloads the real one when it
 * is rendered, which happens only when there is a session. So the chunks
 * travel when they are going to be seen, and not one byte before.
 */
export function deferredScreen(load: () => Promise<ComponentType>): ComponentType {
  return function DeferredScreen() {
    const [Screen, setScreen] = useState<ComponentType | null>(null);
    const [failure, setFailure] = useState<unknown>(null);

    useEffect(() => {
      let alive = true;

      void load().then(
        (screen) => {
          if (alive) {
            setScreen(() => screen);
          }
        },
        (error: unknown) => {
          if (alive) {
            setFailure(error);
          }
        },
      );

      return () => {
        alive = false;
      };
    }, []);

    /*
     * A chunk that does not arrive is a failed screen, not a screen that never
     * comes. The failure is thrown while rendering so the boundary above the
     * router catches it, the same way it caught a chunk that failed to load
     * before the screens were deferred: a promise that nobody listens to would
     * leave the skeleton on the glass forever and the person with no idea why.
     */
    if (failure) {
      throw failure;
    }

    if (!Screen) {
      // The shape of what is coming, in the shell's own content box: the same
      // thing the gate shows while it reads the session.
      return <PageSkeleton label="Cargando la pantalla…" />;
    }

    return <Screen />;
  };
}
