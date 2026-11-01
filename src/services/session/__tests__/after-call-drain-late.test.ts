/**
 * drainAfterCallTasks waits for tasks that start while it waits. With
 * SEXUAL_TOPIC_BOUNDARY on (prod and dev), a call whose last-turn read is still
 * running starts its after-call tasks only when that read ends; a single wait on
 * the tasks running at the start returned at the read's end with the tasks still
 * to run, and the worker's shutdown exited under them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => ({ done: null as Promise<void> | null }));
const logged = vi.hoisted(() => [] as Array<{ msg: string; data: Record<string, unknown> }>);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    info: (data: Record<string, unknown>, msg: string) => logged.push({ msg, data }),
    warn: (data: Record<string, unknown>, msg: string) => logged.push({ msg, data }),
    debug: () => undefined,
    error: () => undefined,
  };
  return { createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../../../utils/sexual-topic-hold.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sexualReadsSettled: () => read.done,
}));
vi.mock('../../../utils/minor-care.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  memoryHeld: () => false,
}));

import {
  clearAfterCallTasks,
  drainAfterCallTasks,
  registerAfterCallTask,
  runAfterCallTasks,
  type AfterCallContext,
} from '../after-call-tasks.js';

const ctx: AfterCallContext = {
  userId: 'u-late',
  sessionId: 's-late',
  turns: [],
  startedAt: new Date(),
};
const after = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Resolves with the drain's result; `done()` says whether it has resolved yet. */
function track(p: Promise<number>) {
  let done = false;
  const result = p.then((left) => {
    done = true;
    return left;
  });
  return { result, done: () => done };
}

describe('drainAfterCallTasks: tasks that start while it waits', () => {
  afterEach(() => {
    clearAfterCallTasks();
    read.done = null;
    logged.length = 0;
    vi.useRealTimers();
  });

  it('waits for the tasks a held read starts when it ends', async () => {
    vi.useFakeTimers();
    read.done = after(500); // the last turn's read ends 500 ms in
    registerAfterCallTask('slow-extract', () => after(3_000));
    runAfterCallTasks(ctx);
    const drain = track(drainAfterCallTasks(30_000));
    await vi.advanceTimersByTimeAsync(600);
    expect(drain.done()).toBe(false); // the read ended; its task has just started
    await vi.advanceTimersByTimeAsync(2_500);
    expect(drain.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    await expect(drain.result).resolves.toBe(0);
  });

  it('still returns at its deadline if a late task never settles', async () => {
    vi.useFakeTimers();
    read.done = after(500);
    registerAfterCallTask('stuck', () => new Promise<void>(() => {}), { timeoutMs: 120_000 });
    runAfterCallTasks(ctx);
    const drain = track(drainAfterCallTasks(5_000));
    await vi.advanceTimersByTimeAsync(4_900);
    expect(drain.done()).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await expect(drain.result).resolves.toBe(1);
  });

  it('logs the start, and how long it waited for the read when it started late', async () => {
    vi.useFakeTimers();
    registerAfterCallTask('quick', async () => undefined);
    runAfterCallTasks(ctx); // no read running: starts at once
    read.done = after(500);
    runAfterCallTasks({ ...ctx, sessionId: 's-late-2' }); // waits for the last turn's read
    await vi.advanceTimersByTimeAsync(600);
    const starts = logged.filter((l) => l.msg === 'After-call tasks started').map((l) => l.data);
    expect(starts).toEqual([
      { sessionId: 's-late', tasks: 1 },
      { sessionId: 's-late-2', tasks: 1, afterReadMs: 500 },
    ]);
  });
});
