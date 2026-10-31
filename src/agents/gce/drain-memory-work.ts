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
 * @module agents/gce/drain-memory-work
 */
import { drainBackground } from './drain-background.js';

/** After-call tasks time out at 30 s each (after-call-tasks.ts), so this covers any one started. */
export const AFTER_CALL_DRAIN_MS = 30_000;

export interface MemoryWorkDeps {
  /** Stops the extraction worker, flushing its batched turns into its queue. */
  stopExtraction: () => void;
  /** Queued extractions plus one in progress. */
  extractionPending: () => number;
  drainTurnCaptures: (timeoutMs: number) => Promise<unknown>;
  pendingAfterCallTasks: () => number;
}

async function realDeps(): Promise<MemoryWorkDeps> {
  const { getDeepExtractionWorker } = await import('../../memory/dynamic/index.js');
  const { drainTurnCaptures } = await import('../../memory/knowledge-graph/index.js');
  const { pendingAfterCallTasks } = await import('../../services/session/after-call-tasks.js');
  const worker = getDeepExtractionWorker();
  return {
    stopExtraction: () => worker.stop(),
    extractionPending: () => {
      const { queueDepth, isProcessing } = worker.getHealthStatus();
      return queueDepth + (isProcessing ? 1 : 0);
    },
    drainTurnCaptures,
    pendingAfterCallTasks,
  };
}

/**
 * Waits, all at once, for extraction (at most `timeoutMs`), knowledge capture
 * (the same) and after-call tasks (at most `afterCallMs`). Returns what was
 * still pending.
 */
export async function drainMemoryWork(
  timeoutMs: number,
  afterCallMs = AFTER_CALL_DRAIN_MS,
  deps?: MemoryWorkDeps
): Promise<{ extractionLeft: number; afterCallLeft: number }> {
  const d = deps ?? (await realDeps());
  d.stopExtraction();
  const [extractionLeft, , afterCallLeft] = await Promise.all([
    drainBackground(d.extractionPending, timeoutMs),
    d.drainTurnCaptures(timeoutMs),
    drainBackground(d.pendingAfterCallTasks, afterCallMs),
  ]);
  return { extractionLeft, afterCallLeft };
}
