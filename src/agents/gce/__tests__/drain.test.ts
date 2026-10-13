import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAIN_TIMEOUT_MS, drainTimeoutMs, waitForActiveJobs } from '../drain.js';

/** A fake clock: sleeping advances it. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

describe('drainTimeoutMs', () => {
  it("defaults to LiveKit's 30 minutes, not the old 30 seconds", () => {
    expect(drainTimeoutMs({})).toBe(DEFAULT_DRAIN_TIMEOUT_MS);
    expect(DEFAULT_DRAIN_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it('reads WORKER_DRAIN_TIMEOUT_MS and ignores nonsense', () => {
    expect(drainTimeoutMs({ WORKER_DRAIN_TIMEOUT_MS: '600000' })).toBe(600000);
    expect(drainTimeoutMs({ WORKER_DRAIN_TIMEOUT_MS: 'soon' })).toBe(DEFAULT_DRAIN_TIMEOUT_MS);
    expect(drainTimeoutMs({ WORKER_DRAIN_TIMEOUT_MS: '-5' })).toBe(DEFAULT_DRAIN_TIMEOUT_MS);
    expect(drainTimeoutMs({ WORKER_DRAIN_TIMEOUT_MS: '' })).toBe(DEFAULT_DRAIN_TIMEOUT_MS);
  });
});

describe('waitForActiveJobs', () => {
  // Prod 2026-10-13: SIGTERM 8 s into a call; the worker gave it 30 s and exited.
  it('keeps waiting while a call runs well past 30 seconds, until it ends', async () => {
    const c = clock();
    const callEndsAt = 4 * 60 * 1000; // a four-minute call
    const result = await waitForActiveJobs(
      () => (c.now() < callEndsAt ? 1 : 0),
      drainTimeoutMs({}),
      {
        ...c,
        pollMs: 2000,
      }
    );
    expect(result).toEqual({ drained: true, waitedMs: callEndsAt, activeJobs: 0 });
  });

  it('gives up at the timeout and says how many calls were left', async () => {
    const c = clock();
    const result = await waitForActiveJobs(() => 2, 10_000, { ...c, pollMs: 2000 });
    expect(result).toEqual({ drained: false, waitedMs: 10_000, activeJobs: 2 });
  });

  it('returns at once with no active calls', async () => {
    const c = clock();
    expect(await waitForActiveJobs(() => 0, 10_000, c)).toEqual({
      drained: true,
      waitedMs: 0,
      activeJobs: 0,
    });
  });
});
