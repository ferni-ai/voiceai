/**
 * The worker's last memory work before it exits (SIGTERM, or WORKER_RECYCLE):
 * deep extraction and knowledge capture batch a call's turns, and after-call
 * tasks (fact sweep, world facts, person model) run on after the call has
 * ended. All of it must finish, or that call's memories are lost.
 *
 * After-call tasks used to be left out here, so an in-process worker could exit
 * while one still ran. On dev, 2026-10-31, a 33-minute call's last after-call
 * task (WORLD_FACTS_RECORDED) finished 1.1 s after its job completed, the point
 * from which the worker counts no call running. A per-call process already
 * waits for these tasks (job-child.ts pendingMemoryWork).
 *
 * The three drains run side by side and each settles on its own: one that
 * fails (an import, a rejected capture) must not cut the others short.
 *
 * @module agents/gce/drain-memory-work
 */
import { drainBackground } from './drain-background.js';

/** After-call tasks time out at 30 s each (after-call-tasks.ts), so this covers any one started. */
const AFTER_CALL_DRAIN_MS = 30_000;

export interface MemoryWorkDeps {
  /** Stops the extraction worker (flushing its batched turns) and waits; returns what was left. */
  drainExtraction: (timeoutMs: number) => Promise<number>;
  drainTurnCaptures: (timeoutMs: number) => Promise<unknown>;
  /** after-call-tasks.ts drainAfterCallTasks: returns how many were left. */
  drainAfterCallTasks: (maxMs: number) => Promise<number>;
}

const realDeps: MemoryWorkDeps = {
  drainExtraction: async (timeoutMs) => {
    const { getDeepExtractionWorker } = await import('../../memory/dynamic/index.js');
    const worker = getDeepExtractionWorker();
    worker.stop();
    return drainBackground(() => {
      const { queueDepth, isProcessing } = worker.getHealthStatus();
      return queueDepth + (isProcessing ? 1 : 0);
    }, timeoutMs);
  },
  drainTurnCaptures: async (timeoutMs) => {
    const { drainTurnCaptures } = await import('../../memory/knowledge-graph/index.js');
    return drainTurnCaptures(timeoutMs);
  },
  drainAfterCallTasks: async (maxMs) => {
    const { drainAfterCallTasks } = await import('../../services/session/after-call-tasks.js');
    return drainAfterCallTasks(maxMs);
  },
};

export interface MemoryWorkLeft {
  /** Still pending when the drain stopped; null when that drain failed. */
  extractionLeft: number | null;
  afterCallLeft: number | null;
  /** The drains that failed, with their errors. */
  failed: string[];
}

/** Runs `fn`, turning a synchronous throw into a rejection. */
const settle = async <T>(fn: () => Promise<T>): Promise<T> => fn();

/**
 * Waits, all at once, for extraction and knowledge capture (at most
 * `timeoutMs` each) and after-call tasks (at most `afterCallMs`).
 */
export async function drainMemoryWork(
  timeoutMs: number,
  afterCallMs = AFTER_CALL_DRAIN_MS,
  deps: MemoryWorkDeps = realDeps
): Promise<MemoryWorkLeft> {
  const [extraction, captures, afterCall] = await Promise.allSettled([
    settle(() => deps.drainExtraction(timeoutMs)),
    settle(() => deps.drainTurnCaptures(timeoutMs)),
    settle(() => deps.drainAfterCallTasks(afterCallMs)),
  ]);
  const failed = (
    [
      ['extraction', extraction],
      ['turnCaptures', captures],
      ['afterCallTasks', afterCall],
    ] as const
  )
    .filter(([, r]) => r.status === 'rejected')
    .map(([name, r]) => `${name}: ${String((r as PromiseRejectedResult).reason)}`);
  return {
    extractionLeft: extraction.status === 'fulfilled' ? extraction.value : null,
    afterCallLeft: afterCall.status === 'fulfilled' ? afterCall.value : null,
    failed,
  };
}
