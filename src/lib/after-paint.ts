/**
 * Runs a task after the browser has painted the frame in progress.
 *
 * `requestAnimationFrame` runs *before* the paint of the frame it belongs to,
 * so a task scheduled from inside it runs after that paint: the first screen
 * is already on the glass when the task starts.
 *
 * The alternative — running it right away — puts the work on the wire while
 * the page is still trying to paint, and that is exactly what the first paint
 * pays for.
 */
export function afterPaint(task: () => void): () => void {
  const frame = requestAnimationFrame(() => {
    setTimeout(task, 0);
  });

  return () => {
    cancelAnimationFrame(frame);
  };
}
