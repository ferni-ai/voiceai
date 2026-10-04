import { describe, expect, it, vi } from 'vitest';
import type { DeepExtractionJob } from '../deep-extraction-worker.js';
import {
  createDeepExtractionBatcher,
  DEEP_EXTRACTION_BATCH_TURNS,
  DEEP_EXTRACTION_IDLE_MS,
  mergeDeepExtractionJobs,
} from '../deep-extraction-batch.js';
import { createTurnBatcher } from '../turn-batcher.js';

function job(turnNumber: number, overrides: Partial<DeepExtractionJob> = {}): DeepExtractionJob {
  return {
    jobId: `job-${turnNumber}`,
    userId: 'u1',
    sessionId: 's1',
    turnNumber,
    transcript: `turn ${turnNumber}`,
    timestamp: new Date(turnNumber * 1000),
    priority: 'normal',
    fastCaptureHints: {
      mentionedEntities: [],
      emotionSignals: [],
      topicHints: [`topic-${turnNumber % 2}`],
      dateSignals: [],
      relationshipSignals: [],
    },
    ...overrides,
  };
}

/** Manual timers: run() fires everything pending. */
function manualTimers(): {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  fire: () => void;
} {
  const pending = new Map<number, () => void>();
  let next = 0;
  return {
    setTimer: (fn) => {
      pending.set(++next, fn);
      return next;
    },
    clearTimer: (h) => {
      pending.delete(h as number);
    },
    fire: () => {
      for (const [id, fn] of [...pending]) {
        pending.delete(id);
        fn();
      }
    },
  };
}

describe('createTurnBatcher', () => {
  it('flushes a key when it reaches maxItems', () => {
    const flush = vi.fn();
    const b = createTurnBatcher<number>({
      maxItems: 3,
      idleMs: 1000,
      keyOf: () => 'k',
      flush,
      ...manualTimers(),
    });
    b.add(1);
    b.add(2);
    expect(flush).not.toHaveBeenCalled();
    b.add(3);
    expect(flush).toHaveBeenCalledWith('k', [1, 2, 3]);
  });

  it('flushes a partial batch after the idle timeout (covers the end of a call)', () => {
    const timers = manualTimers();
    const flush = vi.fn();
    const b = createTurnBatcher<number>({
      maxItems: 4,
      idleMs: 1000,
      keyOf: () => 'k',
      flush,
      ...timers,
    });
    b.add(1);
    b.add(2);
    timers.fire();
    expect(flush).toHaveBeenCalledWith('k', [1, 2]);
    expect(b.pendingCount('k')).toBe(0);
  });

  it('keeps sessions separate and flushAll drains every key (shutdown)', () => {
    const flush = vi.fn();
    const b = createTurnBatcher<{ k: string; v: number }>({
      maxItems: 10,
      idleMs: 1000,
      keyOf: (x) => x.k,
      flush,
      ...manualTimers(),
    });
    b.add({ k: 'a', v: 1 });
    b.add({ k: 'b', v: 2 });
    b.flushAll();
    expect(flush).toHaveBeenCalledTimes(2);
  });
});

describe('deep extraction batching', () => {
  it('runs one job per 4 turns instead of one per turn', () => {
    const run = vi.fn();
    const batcher = createDeepExtractionBatcher(run, manualTimers());
    for (let t = 1; t <= 8; t++) batcher.add(job(t));
    expect(DEEP_EXTRACTION_BATCH_TURNS).toBe(4);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('merges the turns into one transcript in turn order, with combined hints', () => {
    const merged = mergeDeepExtractionJobs([job(2), job(1), job(3)]);
    expect(merged.transcript).toBe('turn 1\nturn 2\nturn 3');
    expect(merged.turnNumber).toBe(3);
    expect(merged.fastCaptureHints.topicHints.sort()).toEqual(['topic-0', 'topic-1']);
  });

  it('sends a high-priority turn immediately, together with what was buffered', () => {
    const run = vi.fn();
    const batcher = createDeepExtractionBatcher(run, manualTimers());
    batcher.add(job(1));
    batcher.add(job(2, { priority: 'high' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toMatchObject({ priority: 'high', transcript: 'turn 1\nturn 2' });
  });

  it('flushes the last partial batch after the idle timeout, so the end of a call is not lost', () => {
    const timers = manualTimers();
    const run = vi.fn();
    const batcher = createDeepExtractionBatcher(run, timers);
    batcher.add(job(1));
    expect(run).not.toHaveBeenCalled();
    timers.fire();
    expect(run).toHaveBeenCalledTimes(1);
    // Longer than a turn (10-15 s measured on dev, or the timer flushes every turn),
    // short enough that the end of a call is captured promptly.
    expect(DEEP_EXTRACTION_IDLE_MS).toBeGreaterThan(15_000);
    expect(DEEP_EXTRACTION_IDLE_MS).toBeLessThanOrEqual(60_000);
  });

  it('does not mix two sessions into one job', () => {
    const run = vi.fn();
    const batcher = createDeepExtractionBatcher(run, manualTimers());
    batcher.add(job(1, { sessionId: 'A' }));
    batcher.add(job(1, { sessionId: 'B' }));
    batcher.flushAll();
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((c) => (c[0] as DeepExtractionJob).sessionId).sort()).toEqual([
      'A',
      'B',
    ]);
  });
});
