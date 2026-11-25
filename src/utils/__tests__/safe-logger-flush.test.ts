/**
 * flushLogs waits for the destination's write in flight before a process exits (#3320). It reads
 * SonicBoom's `_writing`, which isn't public: a destination without it gets the bounded wait,
 * never an early answer and never a hang. The real SonicBoom paths run in a child process in
 * agents/gce/__tests__/exit-worker.test.ts; these rows pin the wait itself.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, flushLogs } from '../safe-logger.js';

// The global test setup mocks safe-logger; these rows need the real one.
vi.unmock('../safe-logger.js');

/** Resolves to whether `p` has settled, after letting queued callbacks run. */
async function settled(p: Promise<void>): Promise<boolean> {
  let done = false;
  void p.then(() => (done = true));
  await vi.advanceTimersByTimeAsync(0);
  return done;
}

beforeEach(() => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  createLogger({ module: 'flush-test' }).info('the sink exists'); // flushLogs needs one
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('flushLogs', () => {
  it('without a `_writing` field, waits the whole bound when no drain comes', async () => {
    const p = flushLogs(1_000, new EventEmitter());
    await vi.advanceTimersByTimeAsync(999);
    expect(await settled(p)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(p)).toBe(true);
  });

  it('without a `_writing` field, answers on the drain', async () => {
    const dest = new EventEmitter();
    const p = flushLogs(1_000, dest);
    await vi.advanceTimersByTimeAsync(10);
    expect(await settled(p)).toBe(false);
    dest.emit('drain');
    expect(await settled(p)).toBe(true);
  });

  it('with a write in flight (`_writing: true`), waits for its drain', async () => {
    const dest = Object.assign(new EventEmitter(), { _writing: true });
    const p = flushLogs(1_000, dest);
    expect(await settled(p)).toBe(false);
    dest.emit('drain');
    expect(await settled(p)).toBe(true);
  });

  it('with nothing in flight (`_writing: false`), answers at once', async () => {
    const dest = Object.assign(new EventEmitter(), { _writing: false });
    expect(await settled(flushLogs(1_000, dest))).toBe(true);
  });

  it('adds no error listener to the destination', async () => {
    const dest = new EventEmitter();
    const p = flushLogs(1_000, dest);
    expect(dest.listenerCount('error')).toBe(0);
    dest.emit('drain');
    await p;
  });
});
