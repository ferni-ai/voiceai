/**
 * WORKER_RECYCLE: a worker whose memory has grown too large takes no new calls,
 * lets the ones it has end, then exits so LiveKit Cloud starts a fresh one.
 *
 * Prod, 2026-10-29 (one worker, ten calls): the pod used ~580 MB at boot. During a
 * 57-minute call the JS heap grew ~20 MB a minute to 1.5 GB, and after the call
 * the pod stayed at ~2.7 GB while the heap went back to ~300 MB. It kept that
 * memory, and took nine more calls with it. Event-loop stalls per minute rose
 * with the worker's job count.
 *
 * It never ends a call: it only stops taking new ones (the worker reports full
 * and rejects availability, while keeping its LiveKit connection) and exits once
 * no call is running or waiting for its assignment. A worker that has not run a
 * call yet is never recycled, so a threshold below the boot size can't loop.
 * With AGENT_JOB_EXECUTOR=process the calls run (and grow) in child processes
 * and this process counts none, so it never recycles there.
 *
 * @module agents/gce/worker-recycle
 */
import { flagOn } from '../../config/env-flag.js';
import type { Env } from '../../config/env-flag.js';

/** WORKER_RECYCLE_RSS_MB when unset or invalid. */
export const DEFAULT_RECYCLE_RSS_MB = 1024;

/** How often the worker checks its RSS. */
const CHECK_INTERVAL_MS = 30_000;

/** WORKER_RECYCLE_RSS_MB, else 1024. */
export function recycleRssMb(env: Env = process.env): number {
  const mb = Number(env.WORKER_RECYCLE_RSS_MB);
  return Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_RECYCLE_RSS_MB;
}

export interface WorkerRecycleDeps {
  rssBytes: () => number;
  /** Calls running now. */
  activeJobs: () => number;
  /** Calls accepted but not assigned yet: they will start, so they count as running. */
  pendingJobs: () => number;
  /** Calls started since the worker booted. */
  jobsRun: () => number;
  /** Stop taking new calls (report full, reject availability). */
  drain: () => void;
  /** Exit cleanly: the worker's own shutdown. */
  exit: () => void;
  log: (msg: string, data: Record<string, unknown>) => void;
  thresholdMb: number;
}

export type RecycleAction = 'drain' | 'exit';

/**
 * Each `check()` returns what it did, or null. The first check over the
 * threshold drains; a later check with no call running or pending exits, so an
 * idle worker reports full for one interval before it goes.
 */
export function createWorkerRecycle(deps: WorkerRecycleDeps): {
  check: () => RecycleAction | null;
} {
  let draining = false;
  let exited = false;
  return {
    check(): RecycleAction | null {
      if (exited) return null;
      const rssMb = Math.round(deps.rssBytes() / 1024 / 1024);
      const activeJobs = deps.activeJobs() + deps.pendingJobs();
      if (!draining) {
        if (rssMb < deps.thresholdMb || deps.jobsRun() === 0) return null;
        draining = true;
        deps.drain();
        deps.log('WORKER_RECYCLE', {
          rssMb,
          activeJobs,
          thresholdMb: deps.thresholdMb,
          action: 'drain',
        });
        return 'drain';
      }
      if (activeJobs > 0) return null;
      exited = true;
      deps.log('WORKER_RECYCLE', {
        rssMb,
        activeJobs,
        thresholdMb: deps.thresholdMb,
        action: 'exit',
      });
      deps.exit();
      return 'exit';
    },
  };
}

/** With WORKER_RECYCLE on, checks every 30 s. Returns a stop, or null when the flag is off. */
export function startWorkerRecycle(
  deps: Omit<WorkerRecycleDeps, 'thresholdMb'>,
  env: Env = process.env,
  intervalMs = CHECK_INTERVAL_MS
): (() => void) | null {
  if (!flagOn('WORKER_RECYCLE', env)) return null;
  const recycle = createWorkerRecycle({ ...deps, thresholdMb: recycleRssMb(env) });
  const timer = setInterval(() => recycle.check(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
