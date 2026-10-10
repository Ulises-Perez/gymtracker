/**
 * Temporary shell for a route that exists but has no feature yet.
 *
 * Each phase replaces its page with the real screen; until then this keeps the
 * navigation honest instead of showing a blank screen or a fake loading state.
 */
export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted text-sm">{description}</p>
    </section>
  );
}
