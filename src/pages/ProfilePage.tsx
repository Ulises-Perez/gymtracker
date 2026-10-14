import { useState } from 'react';
import { useNavigate } from 'react-router';

import { PagePlaceholder } from '../components/ui/PagePlaceholder.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { useProfile, useUpdateWeightUnit } from '../hooks/useProfile.ts';
import { authErrorMessage } from '../lib/auth-errors.ts';
import type { WeightUnit } from '../lib/units.ts';

/** The two units, in the order the notebook would write them. */
const UNITS: WeightUnit[] = ['kg', 'lb'];

export function ProfilePage() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useProfile(user?.id ?? '');
  const updateUnit = useUpdateWeightUnit(user?.id ?? '');
  // The selector shows what the profile stores, with kilos while it is on its way: the app stores
  // kilos, so that is the honest default rather than a blank state.
  const unit = profile.data?.weightUnit ?? 'kg';

  const onSignOut = async () => {
    setError(null);
    setPending(true);

    try {
      await signOut();
      // The gate would also send the user to /login once the session clears, but
      // navigating here is what makes the outcome immediate and testable.
      void navigate('/login', { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught));
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PagePlaceholder
        title="Perfil"
        description="Acá van los datos, el avatar y la exportación a CSV (Fase 6)."
      />

      {/*
       * The unit preference, which until now was a line in the placeholder promising it. It changes
       * what reading screens show and nothing that is stored, so the copy says so out loud.
       *
       * The chips follow `GroupChip`: a ruled border, a control's radius, no per-control focus ring
       * (focus is declared once in `index.css`), and `aria-pressed` so the state does not depend on
       * colour. The selected chip is ink and not accent -- which unit is chosen is a state, and the
       * red belongs to what was replaced and to what advances the session.
       */}
      <section className="border-text border-t-2 pt-4">
        <h2 className="font-display text-lg font-extrabold tracking-tight">Unidad de peso</h2>
        <p className="text-muted mt-1 text-sm">
          Cómo se leen los pesos en las pantallas. Se guardan siempre en kilos.
        </p>

        <div role="group" aria-label="Unidad de peso" className="mt-2 flex flex-wrap gap-2">
          {UNITS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={unit === option}
              disabled={updateUnit.isPending}
              onClick={() => updateUnit.mutate(option)}
              className={`border-rule min-h-12 rounded-sm border px-3 text-sm transition-colors motion-reduce:transition-none disabled:opacity-50 ${
                unit === option ? 'bg-text border-text text-bg' : 'text-muted hover:text-text'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {updateUnit.isError ? (
          <p role="alert" className="text-danger mt-2 text-sm">
            No pudimos guardar la unidad. Probá de nuevo.
          </p>
        ) : null}
      </section>
      {/*
       * Logging out is the one profile action the phase 2 definition of done names, so it lands
       * here now instead of waiting for the rest of phase 6. It leaves for the login screen rather
       * than advancing the session or replacing anything, so it is a ruled control and the accent
       * stays out of it -- a button that paints no ring of its own either, because focus is declared
       * once in `index.css`.
       */}
      <div className="border-rule space-y-2 border-t pt-6">
        <button
          type="button"
          onClick={() => void onSignOut()}
          disabled={pending}
          aria-busy={pending || undefined}
          className="border-rule hover:bg-surface min-h-12 w-full rounded-sm border px-4 disabled:opacity-50"
        >
          {pending ? 'Saliendo…' : 'Salir'}
        </button>
        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
