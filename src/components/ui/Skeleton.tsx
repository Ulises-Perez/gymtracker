/**
 * Loading placeholder.
 *
 * The plan forbids spinners: a skeleton communicates the shape of what is
 * coming, which on a slow gym connection is the difference between "loading"
 * and "broken". Always hidden from assistive technology, because the real
 * announcement belongs to the container that knows why it is loading.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-surface ${className ?? ''}`.trim()}
    />
  );
}
