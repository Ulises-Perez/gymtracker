import { Skeleton } from './Skeleton.tsx';

/**
 * Loading state for a whole screen.
 *
 * It mirrors the shell's content box, so nothing jumps when the real screen
 * replaces it. The container is the live region: the skeleton blocks themselves
 * are decorative and hidden from assistive technology, so the announcement
 * belongs here.
 */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-lg px-4 pt-6 pb-28">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-6 h-28 w-full" />
      <Skeleton className="mt-3 h-28 w-full" />
    </div>
  );
}
