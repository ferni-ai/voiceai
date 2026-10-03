import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_OPENING_MS,
  MAX_PLANNED_SESSIONS,
  PLAN_TTL_MS,
  clearReplyAudioPlan,
  MAX_LISTENERS_PER_SESSION,
  getStage2Gates,
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
    setReplyAudioPlan('a', 3, { tempo: 0.9, opening: { kind: 'breath', intensity: 0.6 } });
    expect(takeReplyAudioPlan('a', 3)).toEqual({
      tempo: 0.9,
      opening: { kind: 'breath', intensity: 0.6 },
    });
    expect(takeReplyAudioPlan('a', 3)).toBeUndefined();
  });

  it('is scoped to the session', () => {
    setReplyAudioPlan('a', 1, { tempo: 1.1 });
    expect(takeReplyAudioPlan('b', 1)).toBeUndefined();
    expect(takeReplyAudioPlan('a', 1)).toEqual({ tempo: 1.1 });
  });

  it('a plan for turn N never applies to turn N+1 (and is discarded by it)', () => {
    setReplyAudioPlan('a', 5, { tempo: 0.9 });
    expect(takeReplyAudioPlan('a', 5)).toEqual({ tempo: 0.9 }); // control: turn 5 gets it
    setReplyAudioPlan('a', 5, { opening: { kind: 'sigh', intensity: 1 } });
    expect(pendingReplyAudioPlanCount()).toBe(1);
    expect(takeReplyAudioPlan('a', 6)).toBeUndefined();
    expect(pendingReplyAudioPlanCount()).toBe(0); // stale turn-5 plan dropped
    expect(takeReplyAudioPlan('a', 5)).toBeUndefined();
  });

  it('a plan for a later turn is left for that turn', () => {
    setReplyAudioPlan('a', 7, { tempo: 1.1 });
    expect(takeReplyAudioPlan('a', 6)).toBeUndefined();
    expect(takeReplyAudioPlan('a', 7)).toEqual({ tempo: 1.1 });
  });

  it('never stores or takes a plan without a real session id and turn', () => {
    for (const sid of ['unknown', '', '  ', undefined]) {
      setReplyAudioPlan(sid, 1, { tempo: 1.1 });
      expect(takeReplyAudioPlan(sid, 1)).toBeUndefined();
    }
    for (const turn of [undefined, Number.NaN, -1, 1.5]) {
      setReplyAudioPlan('a', turn, { tempo: 1.1 });
      expect(takeReplyAudioPlan('a', turn)).toBeUndefined();
    }
    expect(pendingReplyAudioPlanCount()).toBe(0);
  });

  it('a newer plan replaces a pending one; clear drops it', () => {
    setReplyAudioPlan('a', 1, { tempo: 1.1 });
    setReplyAudioPlan('a', 1, { opening: { kind: 'sigh', intensity: 1 } });
    expect(takeReplyAudioPlan('a', 1)).toEqual({ opening: { kind: 'sigh', intensity: 1 } });
    setReplyAudioPlan('a', 2, { tempo: 1.1 });
    clearReplyAudioPlan('a');
    expect(takeReplyAudioPlan('a', 2)).toBeUndefined();
  });

  it('expires after a 10 s TTL', () => {
    expect(PLAN_TTL_MS).toBe(10_000);
    let t = 1_000_000;
    setReplyAudioPlanClockForTests(() => t);
    setReplyAudioPlan('a', 1, { tempo: 0.9 });
    t += PLAN_TTL_MS - 1;
    setReplyAudioPlan('b', 1, { tempo: 0.9 });
    expect(takeReplyAudioPlan('b', 1)).toEqual({ tempo: 0.9 });
    expect(takeReplyAudioPlan('a', 1)).toEqual({ tempo: 0.9 });
    setReplyAudioPlan('a', 2, { tempo: 0.9 });
    t += PLAN_TTL_MS;
    expect(takeReplyAudioPlan('a', 2)).toBeUndefined();
  });

  it('is size-capped, evicting the oldest', () => {
    for (let i = 0; i < MAX_PLANNED_SESSIONS + 10; i++)
      setReplyAudioPlan(`s${i}`, 1, { tempo: 1.1 });
    expect(pendingReplyAudioPlanCount()).toBeLessThanOrEqual(MAX_PLANNED_SESSIONS);
    expect(takeReplyAudioPlan('s0', 1)).toBeUndefined();
    expect(takeReplyAudioPlan(`s${MAX_PLANNED_SESSIONS + 9}`, 1)).toEqual({ tempo: 1.1 });
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
    setReplyAudioPlan('a', 1, { tempo: Number.POSITIVE_INFINITY });
    expect(takeReplyAudioPlan('a', 1)).toBeUndefined();
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
    setReplyAudioPlan('a', 1, { tempo: 1.1 });
    expect(pendingReplyAudioPlanCount()).toBe(1);
    cleanupSpeechSession('a', { verbose: false });
    expect(takeReplyAudioPlan('a', 1)).toBeUndefined();
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
  });

  it('calls back once, after the setter returns, for its own turn only', async () => {
    const seen: string[] = [];
    const stop = onReplyAudioPlan('w', 2, () => seen.push('t2'));
    onReplyAudioPlan('w', 3, () => seen.push('t3'));
    setReplyAudioPlan('w', 2, { tempo: 1.1 });
    expect(seen).toEqual([]); // not inside the director's push
    await Promise.resolve();
    expect(seen).toEqual(['t2']);
    setReplyAudioPlan('w', 2, { tempo: 1.1 });
    await Promise.resolve();
    expect(seen).toEqual(['t2']); // once
    expect(replyAudioPlanListenerCount()).toBe(1); // turn 3 still waiting
    stop(); // unsubscribing a fired listener is harmless
    expect(replyAudioPlanListenerCount()).toBe(1);
  });

  it('unsubscribes, expires after the plan TTL, and is capped per session', async () => {
    let t = 1000;
    setReplyAudioPlanClockForTests(() => t);
    const fired: number[] = [];
    const stop = onReplyAudioPlan('w', 1, () => fired.push(1));
    stop();
    expect(replyAudioPlanListenerCount()).toBe(0);
    onReplyAudioPlan('w', 1, () => fired.push(2));
    t += PLAN_TTL_MS + 1;
    setReplyAudioPlan('w', 1, { tempo: 1.1 });
    await Promise.resolve();
    expect(fired).toEqual([]);
    expect(replyAudioPlanListenerCount()).toBe(0);
    for (let i = 0; i < MAX_LISTENERS_PER_SESSION + 5; i++)
      onReplyAudioPlan('w', 9, () => undefined);
    expect(replyAudioPlanListenerCount()).toBe(MAX_LISTENERS_PER_SESSION);
  });

  it('ignores a session without a real id or turn', () => {
    const stop = onReplyAudioPlan('unknown', 1, () => undefined);
    onReplyAudioPlan('w', undefined, () => undefined);
    expect(replyAudioPlanListenerCount()).toBe(0);
    stop();
  });
});
