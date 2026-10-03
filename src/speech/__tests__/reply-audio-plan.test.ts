import { afterEach, describe, expect, it } from 'vitest';

import {
  MAX_PLANNED_SESSIONS,
  PLAN_TTL_MS,
  clearReplyAudioPlan,
  getStage2Gates,
  normalizeReplyAudioPlan,
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
    setReplyAudioPlan('a', { tempo: 0.9, opening: { kind: 'breath', intensity: 0.6 } });
    expect(takeReplyAudioPlan('a')).toEqual({
      tempo: 0.9,
      opening: { kind: 'breath', intensity: 0.6 },
    });
    expect(takeReplyAudioPlan('a')).toBeUndefined();
  });

  it('is scoped to the session', () => {
    setReplyAudioPlan('a', { tempo: 1.1 });
    expect(takeReplyAudioPlan('b')).toBeUndefined();
    expect(takeReplyAudioPlan('a')).toEqual({ tempo: 1.1 });
  });

  it('a newer plan replaces a pending one; clear drops it', () => {
    setReplyAudioPlan('a', { tempo: 1.1 });
    setReplyAudioPlan('a', { opening: { kind: 'sigh', intensity: 1 } });
    expect(takeReplyAudioPlan('a')).toEqual({ opening: { kind: 'sigh', intensity: 1 } });
    setReplyAudioPlan('a', { tempo: 1.1 });
    clearReplyAudioPlan('a');
    expect(takeReplyAudioPlan('a')).toBeUndefined();
  });

  it('expires after the TTL so it cannot land on a much later reply', () => {
    let t = 1_000_000;
    setReplyAudioPlanClockForTests(() => t);
    setReplyAudioPlan('a', { tempo: 0.9 });
    t += PLAN_TTL_MS - 1;
    setReplyAudioPlan('b', { tempo: 0.9 });
    expect(takeReplyAudioPlan('b')).toEqual({ tempo: 0.9 });
    expect(takeReplyAudioPlan('a')).toEqual({ tempo: 0.9 });
    setReplyAudioPlan('a', { tempo: 0.9 });
    t += PLAN_TTL_MS;
    expect(takeReplyAudioPlan('a')).toBeUndefined();
  });

  it('is size-capped, evicting the oldest', () => {
    for (let i = 0; i < MAX_PLANNED_SESSIONS + 10; i++) setReplyAudioPlan(`s${i}`, { tempo: 1.1 });
    expect(pendingReplyAudioPlanCount()).toBeLessThanOrEqual(MAX_PLANNED_SESSIONS);
    expect(takeReplyAudioPlan('s0')).toBeUndefined();
    expect(takeReplyAudioPlan(`s${MAX_PLANNED_SESSIONS + 9}`)).toEqual({ tempo: 1.1 });
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
    setReplyAudioPlan('a', { tempo: Number.POSITIVE_INFINITY });
    expect(takeReplyAudioPlan('a')).toBeUndefined();
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
});
