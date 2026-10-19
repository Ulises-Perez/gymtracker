import { useCallback, useEffect, useState } from 'react';

import { isInstalled, isIos } from '../../lib/install-prompt.ts';
import type { BeforeInstallPromptEvent, InstallChoice } from '../../lib/install-prompt.ts';

export interface InstallPrompt {
  /**
   * Chromium's deferred prompt, or `null` when the browser has not offered one — or has already used
   * it, since the event is spent by the first `prompt()`.
   */
  deferred: BeforeInstallPromptEvent | null;
  /** The app already runs installed, or was installed from this page. */
  installed: boolean;
  /** This platform offers no event but does offer a manual route: iOS. */
  manualInstructions: boolean;
  /** Raises the native dialog, and answers what the user chose there. */
  promptInstall: () => Promise<InstallChoice['outcome'] | null>;
}

/**
 * The install conversation, from the app's side.
 *
 * The listener is attached on mount and not at startup, which is a deliberate trade: the event is
 * emitted after the browser decides the app is installable, and taking it over means the page owns the
 * decision from then on. Mounting a screen is when the app first has somewhere to show the offer, and
 * the two screens that use this are the two that carry it.
 *
 * What it never does is claim an install happened. `prompt()` opens the browser's dialog; the outcome
 * is read from `userChoice`, and `appinstalled` — which also fires when the user installs from the
 * browser's own menu — is what closes the offer.
 */
export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isInstalled);

  useEffect(() => {
    // An installed app is offered nothing, and there is nothing to listen for either.
    if (installed) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;

      /*
       * Taken over on purpose: Chromium would otherwise show its own mini-infobar, and two offers for
       * the same decision, in two different languages of design, is worse than one.
       */
      promptEvent.preventDefault();
      setDeferred(promptEvent);
    };

    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [installed]);

  const promptInstall = useCallback(async (): Promise<InstallChoice['outcome'] | null> => {
    const event = deferred;

    if (event === null) {
      return null;
    }

    // Single use: the browser will not raise this dialog twice, so the offer is spent as soon as it
    // is made. Keeping it around would leave a button that does nothing.
    setDeferred(null);

    try {
      await event.prompt();

      const choice = await event.userChoice;

      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }

      return choice.outcome;
    } catch {
      /*
       * `prompt()` rejects when the event was already used or the browser changed its mind. Nothing
       * the user could act on comes out of that, and the offer is gone either way, so the failure is
       * swallowed rather than announced: an error nobody can fix is noise (the same call the wake lock
       * made for a lock the platform refused).
       */
      return null;
    }
  }, [deferred]);

  return {
    deferred,
    installed,
    manualInstructions: !installed && deferred === null && isIos(),
    promptInstall,
  };
}
