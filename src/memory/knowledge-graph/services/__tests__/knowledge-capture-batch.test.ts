import { describe, expect, it, vi } from 'vitest';

vi.mock('../knowledge-capture.js', () => ({ captureTurn: vi.fn(async () => ({})) }));

import type { TurnCaptureInput } from '../knowledge-capture.js';
import { createKnowledgeCaptureQueue, mergeTurnCaptures } from '../knowledge-capture-batch.js';

function turn(turnNumber: number, overrides: Partial<TurnCaptureInput> = {}): TurnCaptureInput {
  return {
    userId: 'u1',
    sessionId: 's1',
    turnNumber,
    transcript: `turn ${turnNumber}`,
    ...overrides,
  };
}

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

describe('knowledge capture batching', () => {
  it('captures once per 4 turns instead of once per turn', () => {
    const capture = vi.fn(async (_input: TurnCaptureInput) => ({}));
    const q = createKnowledgeCaptureQueue({ capture, ...manualTimers() });
    for (let t = 1; t <= 8; t++) q.queue(turn(t));
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls[0][0]).toMatchObject({
      turnNumber: 4,
      transcript: 'turn 1\nturn 2\nturn 3\nturn 4',
    });
  });

  it('captures a partial batch after the idle timeout (end of call)', () => {
    const timers = manualTimers();
    const capture = vi.fn(async () => ({}));
    const q = createKnowledgeCaptureQueue({ capture, ...timers });
    q.queue(turn(1));
    q.queue(turn(2));
    expect(capture).not.toHaveBeenCalled();
    timers.fire();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('counts a turn queued twice only once', () => {
    const merged = mergeTurnCaptures([turn(1), turn(2), turn(2), turn(3)]);
    expect(merged.transcript).toBe('turn 1\nturn 2\nturn 3');
  });

  it('keeps the latest emotion and topic', () => {
    const merged = mergeTurnCaptures([
      turn(1, { topic: 'work', emotion: { primary: 'calm' } }),
      turn(2, { topic: 'family', emotion: { primary: 'sad' } }),
    ]);
    expect(merged).toMatchObject({ topic: 'family', emotion: { primary: 'sad' }, turnNumber: 2 });
  });

  it('drain runs pending captures and waits for them (shutdown does not drop turns)', async () => {
    let finished = false;
    const capture = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      finished = true;
    });
    const q = createKnowledgeCaptureQueue({ capture, ...manualTimers() });
    q.queue(turn(1));
    await q.drain(1000);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(finished).toBe(true);
  });

  it('drain gives up at the timeout instead of hanging shutdown', async () => {
    const capture = vi.fn(() => new Promise<never>(() => {}));
    const q = createKnowledgeCaptureQueue({ capture, ...manualTimers() });
    q.queue(turn(1));
    const started = Date.now();
    await q.drain(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
