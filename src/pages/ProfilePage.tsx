import { useState } from 'react';
import { useNavigate } from 'react-router';

import { PagePlaceholder } from '../components/ui/PagePlaceholder.tsx';
import { useAuth } from '../hooks/useAuth.ts';
import { authErrorMessage } from '../lib/auth-errors.ts';

export function ProfilePage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        description="Acá van los datos, el avatar, la unidad preferida y la exportación a CSV (Fase 6)."
      />
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
