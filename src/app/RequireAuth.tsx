import { Navigate, Outlet, useLocation } from 'react-router';

import { PageSkeleton } from '../components/ui/PageSkeleton.tsx';
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
    return <PageSkeleton label="Cargando tu sesión…" />;
  }

  if (!user) {
    // The intended address travels with the redirect so the login screen can
    // send the visitor back where they were going.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
