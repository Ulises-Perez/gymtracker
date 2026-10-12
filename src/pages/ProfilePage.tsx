import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '../components/ui/Button.tsx';
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
      {/* Logging out is the one profile action the phase 2 definition of done
          names, so it lands here now instead of waiting for the rest of phase 6. */}
      <div className="space-y-2">
        <Button pending={pending} onClick={() => void onSignOut()} className="w-full">
          {pending ? 'Saliendo…' : 'Salir'}
        </Button>
        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
