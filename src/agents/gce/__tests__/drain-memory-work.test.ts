/**
 * The worker's shutdown (SIGTERM, WORKER_RECYCLE) waits for after-call tasks
 * as well as batched extraction: on dev a 33-minute call's last after-call task
 * finished 1.1 s after its job completed (drain-memory-work.ts).
 */
import { describe, expect, it, vi } from 'vitest';

import { drainMemoryWork, type MemoryWorkDeps } from '../drain-memory-work.js';

function world(afterCallMs: number) {
  let afterCall = 1;
  setTimeout(() => {
    afterCall = 0;
  }, afterCallMs);
  const deps: MemoryWorkDeps = {
    stopExtraction: vi.fn(),
    extractionPending: () => 0,
    drainTurnCaptures: vi.fn(async () => undefined),
    pendingAfterCallTasks: () => afterCall,
  };
  return deps;
}

describe('drainMemoryWork', () => {
  it('waits for a running after-call task, even with extraction already idle', async () => {
    vi.useFakeTimers();
    try {
      const deps = world(1_200);
      let done = false;
      const result = drainMemoryWork(10_000, 30_000, deps).then((r) => {
        done = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(done).toBe(false); // the after-call task still runs
      await vi.advanceTimersByTimeAsync(500);
      await expect(result).resolves.toEqual({ extractionLeft: 0, afterCallLeft: 0 });
      expect(deps.stopExtraction).toHaveBeenCalledTimes(1);
      expect(deps.drainTurnCaptures).toHaveBeenCalledWith(10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up at its limit and reports what was left', async () => {
    vi.useFakeTimers();
    try {
      const deps = world(60_000);
      const result = drainMemoryWork(10_000, 30_000, deps);
      await vi.advanceTimersByTimeAsync(31_000);
      await expect(result).resolves.toEqual({ extractionLeft: 0, afterCallLeft: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
