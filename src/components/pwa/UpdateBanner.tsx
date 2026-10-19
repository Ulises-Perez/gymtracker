import { acceptUpdate } from '../../lib/pwa.ts';
import { useUpdateWaiting } from './useUpdateWaiting.ts';

/**
 * The new version, when one is waiting.
 *
 * Global, and rendered above every route: the moment the browser downloads an update is not the moment
 * the user is on Inicio or in the middle of anything in particular, so a banner living on one screen
 * would be a banner most updates never show.
 *
 * It sits in the flow, at the top of the page, instead of floating over it. This world has no shadows
 * and no overlays, and a strip that pushes the page down by its own height is exactly what the printed
 * rule already does everywhere else — while a box over the content on a 360px phone would cover the
 * header it is asking the user to give up for a reload.
 *
 * "Actualizar" is a ruled control, not the accent one: it neither advances nor confirms a workout, and
 * the accent is reserved for what does (DESIGN.md, The Ruled Control Rule). What the press does is the
 * whole point of the banner — it sends `SKIP_WAITING`, the waiting worker takes over, and the reload
 * that the user just approved follows.
 */
export function UpdateBanner() {
  const waiting = useUpdateWaiting();

  if (!waiting) {
    return null;
  }

  return (
    <div role="status" className="border-text bg-bg sticky top-0 z-40 border-b-2">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-4 py-2">
        <p className="text-sm">Hay una nueva versión.</p>
        <button
          type="button"
          onClick={() => void acceptUpdate()}
          className="border-rule hover:bg-surface min-h-12 rounded-sm border px-4"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
