/**
 * How long a worker keeps its calls alive after SIGTERM.
 *
 * Prod, 2026-10-13 00:51:59Z: LiveKit Cloud scaled a pod in 8 s after it took
 * Seth's call. The worker waited at most 30 s for active jobs, then exited,
 * so the call went silent mid-sentence and was re-dispatched as a fresh
 * session. LiveKit's own SDK drains for 30 minutes (drain_timeout 1800 s), and
 * Cloud keeps a draining instance for up to an hour.
 *
 * @module agents/gce/drain
 */

/** LiveKit's SDK default drain_timeout. */
export const DEFAULT_DRAIN_TIMEOUT_MS = 30 * 60 * 1000;

/** WORKER_DRAIN_TIMEOUT_MS, else 30 minutes. */
export function drainTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const ms = Number(env.WORKER_DRAIN_TIMEOUT_MS);
  return Number.isFinite(ms) && ms >= 0 && env.WORKER_DRAIN_TIMEOUT_MS !== ''
    ? ms
    : DEFAULT_DRAIN_TIMEOUT_MS;
}

export interface DrainResult {
  drained: boolean;
  waitedMs: number;
  activeJobs: number;
}

export interface DrainOptions {
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onWait?: (activeJobs: number, waitedMs: number) => void;
}

/** Waits until no job is active or `timeoutMs` passes. */
export async function waitForActiveJobs(
  activeJobs: () => number,
  timeoutMs: number,
  opts: DrainOptions = {}
): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const start = now();
  while (activeJobs() > 0 && now() - start < timeoutMs) {
    await sleep(opts.pollMs ?? 2000);
    opts.onWait?.(activeJobs(), now() - start);
  }
  const left = activeJobs();
  return { drained: left === 0, waitedMs: now() - start, activeJobs: left };
}
