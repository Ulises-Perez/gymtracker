import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RouterProvider } from 'react-router';
import { router } from './app/router.tsx';
import { persistOptions, queryClient, resumeQueuedMutations } from './lib/queryClient.ts';
import { AuthProvider } from './providers/AuthProvider.tsx';

export default function App() {
  return (
    // The provider restores the persisted cache before rendering the app, so a
    // reload never flashes an empty state over data that was already on disk.
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // Restoring the cache and running what it held are two different things.
      // Without this, a write restored on an already-healthy connection waits for
      // a network or focus transition that may never arrive (defect D1).
      onSuccess={() => resumeQueuedMutations()}
    >
      {/* The session lives above the router: the route gate and every screen
          read it from the same place. */}
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
