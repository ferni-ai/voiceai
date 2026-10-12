/**
 * A call's end is counted as pending from the moment session cleanup starts, so
 * a per-call process that drains pending work before exiting (job-child.ts)
 * waits for a summary that outlasts the 10 s cleanup timeout and for the
 * after-call tasks it registers late.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAfterCallTasks,
  pendingAfterCallTasks,
  registerAfterCallTask,
  runAfterCallTasks,
  trackSessionEnd,
} from '../after-call-tasks.js';
import { drainBackground } from '../../../agents/gce/drain-background.js';

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  clearAfterCallTasks();
});
afterEach(() => {
  vi.useRealTimers();
  clearAfterCallTasks();
});

describe('trackSessionEnd', () => {
  it('a summary that registers after-call work at 12 s is drained before the process exits', async () => {
    const order: string[] = [];
    registerAfterCallTask('extract', async () => {
      await sleep(5_000);
      order.push('after-call task done');
    });
    // endSession: the summary takes 12 s, then starts the after-call tasks
    const endSession = async (): Promise<void> => {
      await sleep(12_000);
      runAfterCallTasks({ userId: 'u', sessionId: 's', turns: [], startedAt: new Date() });
    };

    // handleSessionCleanup: races the tracked cleanup against its 10 s timeout
    const cleanup = Promise.race([trackSessionEnd(endSession()), sleep(10_000)]);
    // job-child: the entry returns, then the process drains pending work and exits
    const exit = cleanup
      .then(() => drainBackground(pendingAfterCallTasks, 60_000))
      .then((left) => {
        order.push(`process exits (${left} left)`);
      });

    await vi.advanceTimersByTimeAsync(10_000);
    // The cleanup timeout has won; the summary is still running and must count
    expect(pendingAfterCallTasks()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(2_500); // the summary finishes and registers the task
    expect(pendingAfterCallTasks()).toBe(1);
    expect(order).toEqual([]);

    await vi.advanceTimersByTimeAsync(6_000);
    await exit;
    expect(order).toEqual(['after-call task done', 'process exits (0 left)']);
  });

  it('returns the work unchanged, errors included, and stops counting it once settled', async () => {
    const failing = trackSessionEnd(Promise.reject(new Error('summary failed')));
    await expect(failing).rejects.toThrow('summary failed');
    await vi.advanceTimersByTimeAsync(0);
    expect(pendingAfterCallTasks()).toBe(0);
  });
});
