/**
 * Lets a per-call process finish its background work before it exits
 * (docs/plans/2026-10-10-process-per-job.md).
 *
 * @module agents/gce/drain-background
 */

/**
 * Waits until `pending()` is 0, checking every `stepMs`, for at most `maxMs`.
 * Returns what was still pending when it stopped.
 */
export async function drainBackground(
  pending: () => number,
  maxMs: number,
  stepMs = 250
): Promise<number> {
  const deadline = Date.now() + maxMs;
  while (pending() > 0 && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- polling until the queue empties
    await new Promise<void>((resolve) => {
      setTimeout(resolve, stepMs);
    });
  }
  return pending();
}
