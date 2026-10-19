import { useId, useState } from 'react';

import { useInstallPrompt } from './useInstallPrompt.ts';

/**
 * The install entry in Perfil.
 *
 * The strip on Inicio answers an event that may arrive before the user has read anything; this row is
 * where someone goes on purpose, a day later, having decided they want the app on the home screen. It
 * is permanent in the sense that matters — the section does not depend on the strip having been
 * dismissed or ignored.
 *
 * On Chromium the row raises the same native dialog as the strip. On iOS there is no dialog to raise:
 * `beforeinstallprompt` does not exist there, and adding to the home screen is a Safari gesture no code
 * can press. So the row prints the steps, and `aria-expanded` says whether it has.
 *
 * Where the platform offers neither — a browser with no prompt and no manual route — the section is not
 * rendered at all. A control that cannot do anything is worse than an absent one, and the same is true
 * of the app already being installed.
 */
export function InstallSection() {
  const { deferred, installed, manualInstructions, promptInstall } = useInstallPrompt();
  const [steps, setSteps] = useState(false);
  const stepsId = useId();

  if (installed || (deferred === null && !manualInstructions)) {
    return null;
  }

  return (
    <section className="border-text border-t-2 pt-4">
      <h2 className="font-display text-lg font-extrabold tracking-tight">App</h2>
      <p className="text-muted mt-1 text-sm">
        Se abre desde la pantalla de inicio, sin pasar por el navegador.
      </p>

      <button
        type="button"
        // Only the manual route has a state to expand; the prompt is a one-shot dialog.
        aria-expanded={manualInstructions ? steps : undefined}
        aria-controls={manualInstructions ? stepsId : undefined}
        onClick={() => {
          if (manualInstructions) {
            setSteps((open) => !open);

            return;
          }

          void promptInstall();
        }}
        className="border-rule hover:bg-surface mt-2 min-h-12 w-full rounded-sm border px-4"
      >
        Instalar en este dispositivo
      </button>

      {manualInstructions && steps ? (
        <p id={stepsId} className="text-muted mt-2 text-sm">
          Abrí esta página en Safari, tocá «Compartir» y elegí «Añadir a pantalla de inicio».
        </p>
      ) : null}
    </section>
  );
}
