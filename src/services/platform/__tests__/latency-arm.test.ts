/**
 * LATENCY_ARM_PERCENT: a sticky per-call arm, drawn from the session id, that sets
 * PREEMPT_STABLE_CONTEXT=on for its treatment calls, members or not. Driven through
 * the production entry point, applyCallerFlags, as identifyUser calls it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

import { applyCallerFlags, forgetAgentValues, type CohortStore } from '../cohort-flags.js';
import {
  armBucket,
  drawArm,
  forgetLatencyArms,
  latencyArmFor,
  latencyArmPercent,
} from '../latency-arm.js';

const noCohorts: CohortStore = {
  cohortsFor: async () => [],
  overridesFor: async () => ({}),
  sampledCohorts: async () => [],
};

/** A session id the hash puts below (or at and above) `percent`. */
function sessionIn(percent: number, below: boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const id = `session-RM_${i}-1761900000000`;
    if (armBucket(id) < percent === below) return id;
  }
  throw new Error('no session id found');
}

afterEach(() => {
  forgetAgentValues();
  forgetLatencyArms();
});

describe('LATENCY_ARM_PERCENT', () => {
  it('0 (the default): nothing changes, and the call has no arm', async () => {
    for (const LATENCY_ARM_PERCENT of [undefined, '', '0', 'abc', '-5']) {
      const env: NodeJS.ProcessEnv = { LATENCY_ARM_PERCENT };
      const sessionId = sessionIn(1, true); // in treatment at any percent above 0
      expect(await applyCallerFlags('phone:+15550100', { env, sessionId })).toEqual([]);
      expect(env.PREEMPT_STABLE_CONTEXT).toBeUndefined();
      expect(latencyArmFor(sessionId)).toBeNull();
      // A member with COHORT_FLAGS on reaches the arm itself: still none.
      const member: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on', LATENCY_ARM_PERCENT };
      await applyCallerFlags('uid-member-0', { env: member, store: noCohorts, sessionId });
      expect(member.PREEMPT_STABLE_CONTEXT).toBeUndefined();
      expect(latencyArmFor(sessionId)).toBeNull();
      expect(drawArm(sessionId, { LATENCY_ARM_PERCENT })).toBeNull();
    }
  });

  it('100: a phone caller who is not a member gets the stable context, with COHORT_FLAGS off', async () => {
    for (const userId of ['phone:+15550100', 'anon:abc', undefined]) {
      const env: NodeJS.ProcessEnv = { LATENCY_ARM_PERCENT: '100' };
      const sessionId = `session-RM_${String(userId)}-1`;
      expect(await applyCallerFlags(userId, { env, sessionId })).toEqual([
        'PREEMPT_STABLE_CONTEXT',
      ]);
      expect(env.PREEMPT_STABLE_CONTEXT).toBe('on');
      expect(latencyArmFor(sessionId)).toBe('treatment');
    }
  });

  it('a control call gets the agent’s own value back after a treatment call', async () => {
    const env: NodeJS.ProcessEnv = { LATENCY_ARM_PERCENT: '50', PREEMPT_STABLE_CONTEXT: 'off' };
    const treated = sessionIn(50, true);
    const control = sessionIn(50, false);
    await applyCallerFlags(undefined, { env, sessionId: treated });
    expect(env.PREEMPT_STABLE_CONTEXT).toBe('on');
    await applyCallerFlags(undefined, { env, sessionId: control });
    expect(env.PREEMPT_STABLE_CONTEXT).toBe('off');
    expect([latencyArmFor(treated), latencyArmFor(control)]).toEqual(['treatment', 'control']);
  });

  it('the same session id always lands in the same arm; the split follows the percent', () => {
    const env = { LATENCY_ARM_PERCENT: '50' };
    const ids = Array.from({ length: 2000 }, (_, i) => `session-RM_${i}-${1761900000000 + i}`);
    const first = ids.map((id) => drawArm(id, env));
    expect(ids.map((id) => drawArm(id, env))).toEqual(first);
    const treated = first.filter((a) => a === 'treatment').length;
    expect(treated).toBeGreaterThan(900);
    expect(treated).toBeLessThan(1100);
    // A bigger percent keeps everyone already in.
    const wider = ids.map((id) => drawArm(id, { LATENCY_ARM_PERCENT: '75' }));
    first.forEach((a, i) => a === 'treatment' && expect(wider[i]).toBe('treatment'));
  });

  it('an explicit cohort value or override wins over the arm, and the call is left out', async () => {
    for (const value of ['off', 'defer', 'on']) {
      const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on', LATENCY_ARM_PERCENT: '100' };
      const store: CohortStore = {
        ...noCohorts,
        overridesFor: async () => ({ PREEMPT_STABLE_CONTEXT: value }),
      };
      const sessionId = `session-RM_owner_${value}-1`;
      await applyCallerFlags('uid-owner-1', { env, store, sessionId });
      expect(env.PREEMPT_STABLE_CONTEXT).toBe(value);
      expect(latencyArmFor(sessionId)).toBe('own');
    }
  });

  it('a member with no value of their own is armed like anyone else', async () => {
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on', LATENCY_ARM_PERCENT: '100' };
    const store: CohortStore = { ...noCohorts, overridesFor: async () => ({ CANDOR: 'on' }) };
    await applyCallerFlags('uid-member-1', { env, store, sessionId: 'session-RM_m-1' });
    expect(env).toMatchObject({ PREEMPT_STABLE_CONTEXT: 'on', CANDOR: 'on' });
    expect(latencyArmFor('session-RM_m-1')).toBe('treatment');
  });

  it('applies nothing when a worker can run several calls at once', async () => {
    const env: NodeJS.ProcessEnv = { LATENCY_ARM_PERCENT: '100', AGENT_MAX_JOBS_PER_WORKER: '3' };
    expect(await applyCallerFlags(undefined, { env, sessionId: 'session-RM_x-1' })).toEqual([]);
    expect(env.PREEMPT_STABLE_CONTEXT).toBeUndefined();
  });

  it('reads the percent as a number from 0 to 100', () => {
    expect(latencyArmPercent({ LATENCY_ARM_PERCENT: ' 25 ' })).toBe(25);
    expect(latencyArmPercent({ LATENCY_ARM_PERCENT: '150' })).toBe(100);
    expect(latencyArmPercent({ LATENCY_ARM_PERCENT: 'x' })).toBe(0);
    expect(latencyArmPercent({})).toBe(0);
  });
});
