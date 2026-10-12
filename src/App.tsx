import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RouterProvider } from 'react-router';
import { router } from './app/router.tsx';
import { persistOptions, queryClient } from './lib/queryClient.ts';
import { AuthProvider } from './providers/AuthProvider.tsx';

export default function App() {
  return (
    // The provider restores the persisted cache before rendering the app, so a
    // reload never flashes an empty state over data that was already on disk.
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {/* The session lives above the router: the route gate and every screen
          read it from the same place. */}
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
