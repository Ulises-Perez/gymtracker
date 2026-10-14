/**
 * Temporary shell for a route that exists but has no feature yet.
 *
 * Each phase replaces its page with the real screen; until then this keeps the
 * navigation honest instead of showing a blank screen or a fake loading state.
 */
export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="space-y-2">
      {/* The display face, because a title set by pushing the weight of the interface face is
          the closest installed face, and the craft floor calls that a failure. */}
      <h1 className="font-display text-2xl font-black tracking-tight">{title}</h1>
      <p className="text-muted text-sm">{description}</p>
    </section>
  );
}
