import type { SaveWorkoutVariables } from '../schemas/workout.ts';

/**
 * Routing for the persisted mutation queue.
 *
 * The queue is why this module exists. `dehydrateMutation` persists only
 * `mutationKey`, `state`, `scope` and `meta`, so a mutation restored after a
 * reload carries no `mutationFn` of its own, while `Mutation.continue()` reaches
 * `execute()`, which needs one. The client's default mutation function fills that
 * hole, and this is it.
 *
 * Two consequences shape the code below, and neither is a preference:
 *
 * 1. `MutationFunction` receives the variables and never the mutation key, so a
 *    persisted entry has to be self-describing. Hence the discriminated union
 *    with a `kind`.
 * 2. This module is reachable from the initial bundle through `queryClient`, so
 *    it must not statically import a handler: Zod and the Supabase SDK would come
 *    with it. Handlers are loaded on demand, in the chunk that only a resume or a
 *    real save ever downloads.
 */

/** Every `kind` this build knows how to route. */
const KINDS = ['save-workout'] as const;

export type QueuedMutationKind = (typeof KINDS)[number];

/**
 * The key every queued save is filed under.
 *
 * It lives here, next to the kinds, and not in the hook that creates the mutations. That
 * placement is load-bearing: this module is reachable from the initial bundle and imports
 * nothing at runtime, so the badge that counts pending writes can share the key without
 * dragging the workout store and the payload builder into the first download.
 */
export const SAVE_WORKOUT_MUTATION_KEY = ['save-workout'] as const;

/** The union of everything that can sit in the persisted queue. */
export type QueuedMutationVariables = SaveWorkoutVariables;

export class UnknownQueuedMutationError extends Error {
  // Declared and assigned by hand: the project compiles with
  // `erasableSyntaxOnly`, which rejects constructor parameter properties.
  readonly kind: unknown;

  constructor(kind: unknown) {
    super(
      typeof kind === 'string'
        ? `No handler for queued mutation kind "${kind}".`
        : 'Queued mutation has no routable "kind".',
    );
    this.name = 'UnknownQueuedMutationError';
    this.kind = kind;
  }
}

function rawKind(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return (value as { kind?: unknown }).kind;
}

/**
 * Reads the routing `kind` off a persisted entry, validating nothing else.
 *
 * Deliberately shallow. It claims only that `kind` is one this build can route,
 * never that the payload is valid — that check belongs to the handler, in the
 * chunk that can afford Zod. A guard asserting the whole entry was well-formed
 * would be unsound, and the unsoundness would stay invisible until a bad payload
 * reached the database.
 */
export function queuedMutationKind(value: unknown): QueuedMutationKind | undefined {
  const kind = rawKind(value);

  return typeof kind === 'string' && (KINDS as readonly string[]).includes(kind)
    ? (kind as QueuedMutationKind)
    : undefined;
}

/**
 * Runs one queued entry. This is the client's default mutation function.
 */
export async function dispatchQueuedMutation(variables: unknown): Promise<unknown> {
  const kind = queuedMutationKind(variables);

  if (!kind) {
    throw new UnknownQueuedMutationError(rawKind(variables));
  }

  switch (kind) {
    case 'save-workout': {
      const { saveWorkout } = await import('./workout-api.ts');

      return saveWorkout(variables);
    }
  }
}
