import { useState } from 'react';

import { dismissInstall, isInstallDismissed } from '../../lib/install-prompt.ts';
import { useInstallPrompt } from './useInstallPrompt.ts';

/**
 * The install strip on Inicio.
 *
 * A strip of the page and not a toast, which is the reason `@radix-ui/react-toast` stays unused: a
 * message that lives one second cannot carry a decision, and this one is worth exactly one decision per
 * device. It is a ruled block like every other block here — opened by the 2px ink rule, with ruled
 * controls and not a drop of accent — because installing the app neither advances nor confirms a
 * workout, and the accent is earned.
 *
 * It disappears for three different reasons and all three are honest: the browser never offered an
 * install, the app is already installed, or the user said "Ahora no" and the answer is on disk.
 */
export function InstallBanner() {
  const { deferred, installed, promptInstall } = useInstallPrompt();
  // Read once at mount: the whole point of persisting the dismissal is that a reload does not ask.
  const [dismissed, setDismissed] = useState(isInstallDismissed);

  if (installed || deferred === null || dismissed) {
    return null;
  }

  return (
    <section aria-label="Instalar la app" className="border-text mt-4 border-t-2 pt-4">
      <p className="text-sm">
        Instalá la app para abrirla desde la pantalla de inicio y entrenar sin señal.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="border-rule hover:bg-surface min-h-12 flex-1 rounded-sm border px-4"
        >
          Instalar la app
        </button>
        <button
          type="button"
          onClick={() => {
            dismissInstall();
            setDismissed(true);
          }}
          className="border-rule hover:bg-surface text-muted min-h-12 rounded-sm border px-4"
        >
          Ahora no
        </button>
      </div>
    </section>
  );
}
