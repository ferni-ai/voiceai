/**
 * The worker's shutdown (SIGTERM, WORKER_RECYCLE) waits for after-call tasks
 * as well as batched extraction: on dev a 33-minute call's last after-call task
 * finished 1.1 s after its job completed (drain-memory-work.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { drainMemoryWork, type MemoryWorkDeps } from '../drain-memory-work.js';

/** After-call work that settles after `afterCallMs`; extraction and captures already idle. */
function world(afterCallMs: number, over: Partial<MemoryWorkDeps> = {}): MemoryWorkDeps {
  return {
    drainExtraction: vi.fn(async () => 0),
    drainTurnCaptures: vi.fn(async () => undefined),
    drainAfterCallTasks: (maxMs) =>
      new Promise((resolve) => {
        setTimeout(() => resolve(afterCallMs <= maxMs ? 0 : 1), Math.min(afterCallMs, maxMs));
      }),
    ...over,
  };
}

/** Resolves with the drain's result; `done()` says whether it has resolved yet. */
function track(p: Promise<unknown>) {
  let done = false;
  const result = p.then((r) => {
    done = true;
    return r;
  });
  return { result, done: () => done };
}

describe('drainMemoryWork', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for a running after-call task, even with extraction already idle', async () => {
    vi.useFakeTimers();
    const deps = world(1_200);
    const run = track(drainMemoryWork(10_000, 30_000, deps));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run.done()).toBe(false); // the after-call task still runs
    await vi.advanceTimersByTimeAsync(500);
    await expect(run.result).resolves.toEqual({ extractionLeft: 0, afterCallLeft: 0, failed: [] });
    expect(deps.drainExtraction).toHaveBeenCalledWith(10_000);
    expect(deps.drainTurnCaptures).toHaveBeenCalledWith(10_000);
  });

  it('a failing extraction or capture drain does not cut the after-call wait short', async () => {
    vi.useFakeTimers();
    const deps = world(1_200, {
      drainExtraction: () => {
        throw new Error('extraction worker gone');
      },
      drainTurnCaptures: async () => {
        throw new Error('capture rejected');
      },
    });
    const run = track(drainMemoryWork(10_000, 30_000, deps));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run.done()).toBe(false); // still waiting for the after-call task
    await vi.advanceTimersByTimeAsync(500);
    await expect(run.result).resolves.toEqual({
      extractionLeft: null,
      afterCallLeft: 0,
      failed: [
        'extraction: Error: extraction worker gone',
        'turnCaptures: Error: capture rejected',
      ],
    });
  });

  it('gives up at its limit and reports what was left', async () => {
    vi.useFakeTimers();
    const run = track(drainMemoryWork(10_000, 30_000, world(60_000)));
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(run.result).resolves.toEqual({ extractionLeft: 0, afterCallLeft: 1, failed: [] });
  });
});

describe('the worker shutdown runs it', () => {
  // gce-voice-worker.ts starts the worker when imported, so its wiring is pinned in its source.
  const worker = readFileSync(join(__dirname, '..', '..', 'gce-voice-worker.ts'), 'utf8');

  it('drainBatchedMemoryWork awaits drainMemoryWork, and shutdown awaits drainBatchedMemoryWork', () => {
    expect(worker).toMatch(/import \{ drainMemoryWork \} from '\.\/gce\/drain-memory-work\.js';/);
    expect(worker).toMatch(
      /async function drainBatchedMemoryWork[\s\S]{0,200}await drainMemoryWork\(timeoutMs\)/
    );
    expect(worker).toMatch(/const shutdown = async[\s\S]*await drainBatchedMemoryWork\(\d/);
  });
});
