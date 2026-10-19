import { useSyncExternalStore } from 'react';

import { isUpdateWaiting, subscribeToUpdate } from '../../lib/pwa.ts';

/**
 * Whether a downloaded worker is waiting for permission to take over.
 *
 * Read through `useSyncExternalStore` rather than copied into component state: the callback that sets
 * the flag lives in the registration, which outlives every component, so the store is the truth and
 * this is a subscription to it. The snapshot is a boolean, so it is stable across renders.
 */
export function useUpdateWaiting(): boolean {
  return useSyncExternalStore(subscribeToUpdate, isUpdateWaiting);
}
