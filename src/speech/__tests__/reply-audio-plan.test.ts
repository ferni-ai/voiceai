import { afterEach, describe, expect, it, vi } from 'vitest';

// The logger mock pattern used elsewhere in the repo (e.g.
// src/tasks/__tests__/task-manager.test.ts): a single hoisted mock object so
// the module's one `createLogger()` call at load time returns a reference
// this file can assert on (review L2).
const { logMock } = vi.hoisted(() => {
  const logMock = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logMock.child.mockImplementation(() => logMock);
  return { logMock };
});
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => logMock,
  getLogger: () => logMock,
}));

import {
  MAX_OPENING_MS,
  MAX_PLANNED_SESSIONS,
  PLAN_TTL_MS,
  clearReplyAudioPlan,
  MAX_LISTENERS_PER_SESSION,
  getStage2Gates,
  mergeReplyAudioPlan,
  normalizeReplyAudioPlan,
  onReplyAudioPlan,
  replyAudioPlanListenerCount,
  pendingReplyAudioPlanCount,
  setReplyAudioPlan,
  setReplyAudioPlanClockForTests,
  takeReplyAudioPlan,
} from '../reply-audio-plan.js';

describe('reply-audio-plan', () => {
  afterEach(() => {
    setReplyAudioPlanClockForTests(null);
    for (let i = 0; i < MAX_PLANNED_SESSIONS + 10; i++) clearReplyAudioPlan(`s${i}`);
    clearReplyAudioPlan('a');
    clearReplyAudioPlan('b');
  });

  it('take consumes the plan: one plan, one reply', () => {
    setReplyAudioPlan('a', 'r3', { tempo: 0.9, opening: { kind: 'breath', intensity: 0.6 } });
    expect(takeReplyAudioPlan('a', 'r3')).toEqual({
      tempo: 0.9,
      opening: { kind: 'breath', intensity: 0.6 },
    });
    expect(takeReplyAudioPlan('a', 'r3')).toBeUndefined();
  });

  it('is scoped to the session', () => {
    setReplyAudioPlan('a', 'r1', { tempo: 1.1 });
    expect(takeReplyAudioPlan('b', 'r1')).toBeUndefined(); // same reply id, different session
    expect(takeReplyAudioPlan('a', 'r1')).toEqual({ tempo: 1.1 });
  });

  // ---- H2: plans are per (session, replyId), never cross-reply ----
  it('a plan for one reply never applies to, or is disturbed by, a different reply', () => {
    setReplyAudioPlan('a', 'r5', { tempo: 0.9 });
    setReplyAudioPlan('a', 'r5', { opening: { kind: 'sigh', intensity: 1 } }); // replaces its own slot
    expect(pendingReplyAudioPlanCount()).toBe(1);
    expect(takeReplyAudioPlan('a', 'r6')).toBeUndefined(); // a different reply: nothing
    expect(pendingReplyAudioPlanCount()).toBe(1); // r5's plan is untouched
    expect(takeReplyAudioPlan('a', 'r5')).toEqual({ opening: { kind: 'sigh', intensity: 1 } });
  });

  it('two concurrent replies in the same session each keep their own plan', () => {
    setReplyAudioPlan('a', 'r7', { tempo: 1.1 });
    setReplyAudioPlan('a', 'r8', { tempo: 0.9 });
    expect(pendingReplyAudioPlanCount()).toBe(2);
    expect(takeReplyAudioPlan('a', 'r7')).toEqual({ tempo: 1.1 });
    expect(takeReplyAudioPlan('a', 'r8')).toEqual({ tempo: 0.9 });
  });

  it('never stores or takes a plan without a real session id and reply id', () => {
    for (const sid of ['unknown', '', '  ', undefined]) {
      setReplyAudioPlan(sid, 'r1', { tempo: 1.1 });
      expect(takeReplyAudioPlan(sid, 'r1')).toBeUndefined();
    }
    for (const replyId of [undefined, '', '  ']) {
      setReplyAudioPlan('a', replyId, { tempo: 1.1 });
      expect(takeReplyAudioPlan('a', replyId)).toBeUndefined();
    }
    expect(pendingReplyAudioPlanCount()).toBe(0);
  });

  it('a newer plan for the same reply id replaces a pending one; clear drops it', () => {
    setReplyAudioPlan('a', 'r1', { tempo: 1.1 });
    setReplyAudioPlan('a', 'r1', { opening: { kind: 'sigh', intensity: 1 } });
    expect(takeReplyAudioPlan('a', 'r1')).toEqual({ opening: { kind: 'sigh', intensity: 1 } });
    setReplyAudioPlan('a', 'r2', { tempo: 1.1 });
    clearReplyAudioPlan('a');
    expect(takeReplyAudioPlan('a', 'r2')).toBeUndefined();
  });

  it('expires after a 10 s TTL', () => {
    expect(PLAN_TTL_MS).toBe(10_000);
    let t = 1_000_000;
    setReplyAudioPlanClockForTests(() => t);
    setReplyAudioPlan('a', 'r1', { tempo: 0.9 });
    t += PLAN_TTL_MS - 1;
    setReplyAudioPlan('b', 'r2', { tempo: 0.9 }); // a distinct reply id: real ids are never reused
    expect(takeReplyAudioPlan('b', 'r2')).toEqual({ tempo: 0.9 });
    expect(takeReplyAudioPlan('a', 'r1')).toEqual({ tempo: 0.9 });
    setReplyAudioPlan('a', 'r3', { tempo: 0.9 });
    t += PLAN_TTL_MS;
    expect(takeReplyAudioPlan('a', 'r3')).toBeUndefined();
  });

  it('is size-capped, evicting the oldest', () => {
    for (let i = 0; i < MAX_PLANNED_SESSIONS + 10; i++)
      setReplyAudioPlan(`s${i}`, 'r1', { tempo: 1.1 });
    expect(pendingReplyAudioPlanCount()).toBeLessThanOrEqual(MAX_PLANNED_SESSIONS);
    expect(takeReplyAudioPlan('s0', 'r1')).toBeUndefined();
    expect(takeReplyAudioPlan(`s${MAX_PLANNED_SESSIONS + 9}`, 'r1')).toEqual({ tempo: 1.1 });
  });

  it('clamps and drops invalid fields', () => {
    expect(normalizeReplyAudioPlan({ tempo: 2 })).toEqual({ tempo: 1.25 });
    expect(normalizeReplyAudioPlan({ tempo: 0.5 })).toEqual({ tempo: 0.8 });
    expect(normalizeReplyAudioPlan({ tempo: Number.NaN })).toBeUndefined();
    expect(
      normalizeReplyAudioPlan({ opening: { kind: 'laugh' as 'breath', intensity: 1 } })
    ).toBeUndefined();
    expect(normalizeReplyAudioPlan({ opening: { kind: 'breath', intensity: 0 } })).toBeUndefined();
    expect(
      normalizeReplyAudioPlan({ opening: { kind: 'sigh', intensity: 3, durationMs: -1 } })
    ).toEqual({ opening: { kind: 'sigh', intensity: 1 } });
    setReplyAudioPlan('a', 'r1', { tempo: Number.POSITIVE_INFINITY });
    expect(takeReplyAudioPlan('a', 'r1')).toBeUndefined();
  });

  it('caps the opening: breath <= 600 ms, sigh <= 1200 ms', () => {
    expect(MAX_OPENING_MS).toEqual({ breath: 600, sigh: 1200 });
    expect(
      normalizeReplyAudioPlan({ opening: { kind: 'breath', intensity: 1, durationMs: 3000 } })
    ).toEqual({ opening: { kind: 'breath', intensity: 1, durationMs: 600 } });
    expect(
      normalizeReplyAudioPlan({ opening: { kind: 'sigh', intensity: 1, durationMs: 3000 } })
    ).toEqual({ opening: { kind: 'sigh', intensity: 1, durationMs: 1200 } });
    expect(
      normalizeReplyAudioPlan({ opening: { kind: 'sigh', intensity: 1, durationMs: 900 } })
    ).toEqual({ opening: { kind: 'sigh', intensity: 1, durationMs: 900 } });
  });

  it('session end (cleanupSpeechSession) drops the pending plan', async () => {
    const { cleanupSpeechSession } = await import('../session-cleanup.js');
    setReplyAudioPlan('a', 'r1', { tempo: 1.1 });
    expect(pendingReplyAudioPlanCount()).toBe(1);
    cleanupSpeechSession('a', { verbose: false });
    expect(takeReplyAudioPlan('a', 'r1')).toBeUndefined();
  });

  it('gates are off unless exactly "live"', () => {
    expect(getStage2Gates({})).toEqual({ nonverbal: false, tempo: false });
    expect(
      getStage2Gates({ SPEECH_STAGE2_NONVERBAL: ' LIVE ', SPEECH_STAGE2_TEMPO: 'off' })
    ).toEqual({ nonverbal: true, tempo: false });
    expect(
      getStage2Gates({ SPEECH_STAGE2_NONVERBAL: 'shadow', SPEECH_STAGE2_TEMPO: 'live' })
    ).toEqual({ nonverbal: false, tempo: true });
  });

  it("keeps a speaker f0 for the opening sigh only when it's a plausible voice pitch", () => {
    expect(
      normalizeReplyAudioPlan({ opening: { kind: 'sigh', intensity: 0.6, f0Hz: 111 } })
    ).toEqual({ opening: { kind: 'sigh', intensity: 0.6, f0Hz: 111 } });
    for (const f0Hz of [Number.NaN, 0, -5, 20, 900]) {
      expect(normalizeReplyAudioPlan({ opening: { kind: 'sigh', intensity: 0.6, f0Hz } })).toEqual({
        opening: { kind: 'sigh', intensity: 0.6 },
      });
    }
  });
});

describe('onReplyAudioPlan (a stage waiting for the director)', () => {
  afterEach(() => {
    setReplyAudioPlanClockForTests(null);
    clearReplyAudioPlan('w');
    logMock.warn.mockClear();
  });

  it('calls back once, after the setter returns, for its own reply id only', async () => {
    const seen: string[] = [];
    const stop = onReplyAudioPlan('w', 'r2', () => seen.push('r2'));
    onReplyAudioPlan('w', 'r3', () => seen.push('r3'));
    setReplyAudioPlan('w', 'r2', { tempo: 1.1 });
    expect(seen).toEqual([]); // not inside the director's push
    await Promise.resolve();
    expect(seen).toEqual(['r2']);
    setReplyAudioPlan('w', 'r2', { tempo: 1.1 });
    await Promise.resolve();
    expect(seen).toEqual(['r2']); // once
    expect(replyAudioPlanListenerCount()).toBe(1); // r3 still waiting
    stop(); // unsubscribing a fired listener is harmless
    expect(replyAudioPlanListenerCount()).toBe(1);
  });

  it('unsubscribes, expires after the plan TTL, and is capped per session', async () => {
    let t = 1000;
    setReplyAudioPlanClockForTests(() => t);
    const fired: number[] = [];
    const stop = onReplyAudioPlan('w', 'r1', () => fired.push(1));
    stop();
    expect(replyAudioPlanListenerCount()).toBe(0);
    onReplyAudioPlan('w', 'r1', () => fired.push(2));
    t += PLAN_TTL_MS + 1;
    setReplyAudioPlan('w', 'r1', { tempo: 1.1 });
    await Promise.resolve();
    expect(fired).toEqual([]);
    expect(replyAudioPlanListenerCount()).toBe(0);
    for (let i = 0; i < MAX_LISTENERS_PER_SESSION + 5; i++)
      onReplyAudioPlan('w', 'r9', () => undefined);
    expect(replyAudioPlanListenerCount()).toBe(MAX_LISTENERS_PER_SESSION);
  });

  // ---- L2: the per-session listener cap logs instead of dropping silently ----
  it('logs once per waiter the cap drops, with the sessionId', () => {
    for (let i = 0; i < MAX_LISTENERS_PER_SESSION; i++)
      onReplyAudioPlan('w', `r${i}`, () => undefined);
    expect(logMock.warn).not.toHaveBeenCalled(); // at the cap, nothing dropped yet
    onReplyAudioPlan('w', 'r-over-1', () => undefined);
    onReplyAudioPlan('w', 'r-over-2', () => undefined);
    expect(logMock.warn).toHaveBeenCalledTimes(2);
    expect(logMock.warn).toHaveBeenCalledWith(
      { sessionId: 'w' },
      expect.stringContaining('listener')
    );
    expect(replyAudioPlanListenerCount()).toBe(MAX_LISTENERS_PER_SESSION);
  });

  it('ignores a session without a real id or reply id', () => {
    const stop = onReplyAudioPlan('unknown', 'r1', () => undefined);
    onReplyAudioPlan('w', undefined, () => undefined);
    expect(replyAudioPlanListenerCount()).toBe(0);
    stop();
  });
});

describe("mergeReplyAudioPlan (the director's one update per reply)", () => {
  afterEach(() => clearReplyAudioPlan('m'));

  it('merges into the pending plan for the same reply instead of dropping it', () => {
    setReplyAudioPlan('m', 'r4', { tempo: 0.9 });
    mergeReplyAudioPlan('m', 'r4', { opening: { kind: 'breath', intensity: 0.5 } });
    expect(takeReplyAudioPlan('m', 'r4')).toEqual({
      tempo: 0.9,
      opening: { kind: 'breath', intensity: 0.5 },
    });
  });

  it('stands alone when the first plan was already taken, or was for a different reply', () => {
    setReplyAudioPlan('m', 'r4', { tempo: 0.9 });
    takeReplyAudioPlan('m', 'r4');
    mergeReplyAudioPlan('m', 'r4', { opening: { kind: 'breath', intensity: 0.5 } });
    expect(takeReplyAudioPlan('m', 'r4')).toEqual({ opening: { kind: 'breath', intensity: 0.5 } });
    setReplyAudioPlan('m', 'r3', { tempo: 0.9 });
    mergeReplyAudioPlan('m', 'r4', { opening: { kind: 'breath', intensity: 0.5 } });
    expect(takeReplyAudioPlan('m', 'r4')).toEqual({ opening: { kind: 'breath', intensity: 0.5 } });
  });
});
