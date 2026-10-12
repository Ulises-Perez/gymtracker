import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { InitialEntry } from 'react-router';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router';

import { AuthProvider } from '../providers/AuthProvider.tsx';

/**
 * Renders one auth screen on its own route, plus a catch-all that prints where
 * the router actually landed. That way a test can assert a redirect or a "went
 * into the app" without standing up the whole application.
 *
 * The probe component lives inside the helper on purpose: a module that exports
 * a component and a plain function breaks React Fast Refresh, and lint says so.
 */
export function renderAuthScreen(page: ReactElement, initialEntry: InitialEntry) {
  function LocationProbe() {
    const location = useLocation();

    return <p>ubicación:{location.pathname}</p>;
  }

  const router = createMemoryRouter(
    [
      {
        path: typeof initialEntry === 'string' ? initialEntry : initialEntry.pathname,
        element: page,
      },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [initialEntry] },
  );

  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}
