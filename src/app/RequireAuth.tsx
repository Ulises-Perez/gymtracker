import { Navigate, Outlet, useLocation } from 'react-router';

import { Skeleton } from '../components/ui/Skeleton.tsx';
import { useAuth } from '../hooks/useAuth.ts';

/**
 * Gate for every screen that needs a session.
 *
 * The loading branch matters as much as the redirect: the stored session is
 * read asynchronously, so deciding early would bounce a signed-in user to the
 * login screen on every reload. Until it is known, the app shows the shape of
 * what is coming (the plan forbids spinners) in the shell's own content box, so
 * nothing jumps when the real screen replaces it.
 */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
        <span className="sr-only">Cargando tu sesión…</span>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-6 h-28 w-full" />
        <Skeleton className="mt-3 h-28 w-full" />
      </div>
    );
  }

  if (!user) {
    // The intended address travels with the redirect so the login screen can
    // send the visitor back where they were going.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
