import { afterEach, describe, expect, it } from 'vitest';
import {
  applyCallerFlags,
  applyFlags,
  forgetAgentValues,
  oneCallPerProcess,
  resolveCallerFlags,
  type Cohort,
  type CohortStore,
} from '../cohort-flags.js';

const store = (
  cohorts: Record<string, Cohort[]>,
  overrides: Record<string, Record<string, string>> = {}
): CohortStore => ({
  cohortsFor: async (u) => cohorts[u] ?? [],
  overridesFor: async (u) => overrides[u] ?? {},
});

const family: Cohort = {
  id: 'friends-and-family',
  enabled: true,
  flags: { RECALL_PEOPLE: 'on', OPENER_FOLLOW_UP: 'on', SEMANTIC_RECALL: 'on' },
};

afterEach(() => forgetAgentValues());

describe('resolveCallerFlags', () => {
  it("takes the caller's enabled cohorts, then their own overrides", async () => {
    const s = store(
      { mindy: [family, { id: 'zz-paused', enabled: false, flags: { CANDOR: 'on' } }] },
      { mindy: { OPENER_FOLLOW_UP: 'off' } }
    );
    expect(await resolveCallerFlags('mindy', s)).toEqual({
      RECALL_PEOPLE: 'on',
      OPENER_FOLLOW_UP: 'off',
      SEMANTIC_RECALL: 'on',
    });
    expect(await resolveCallerFlags('stranger', s)).toEqual({});
  });

  it('never lets a cohort set infrastructure or secrets, or odd values', async () => {
    const s = store({
      u: [
        {
          id: 'bad',
          enabled: true,
          flags: {
            AGENT_JOB_EXECUTOR: 'process',
            OPENAI_API_KEY: 'x',
            RECALL_PEOPLE: 'yes',
            CANDOR: 'on',
          },
        },
      ],
    });
    expect(await resolveCallerFlags('u', s)).toEqual({ CANDOR: 'on' });
  });
});

describe('applyFlags', () => {
  it("applies one caller's flags and puts the agent's own back for the next caller", () => {
    const env: NodeJS.ProcessEnv = { SEMANTIC_RECALL: 'on', LIVE_SUMMARIES: 'on' };
    expect(applyFlags({ RECALL_PEOPLE: 'on', SEMANTIC_RECALL: 'off' }, env).sort()).toEqual([
      'RECALL_PEOPLE',
      'SEMANTIC_RECALL',
    ]);
    expect(env).toEqual({ SEMANTIC_RECALL: 'off', LIVE_SUMMARIES: 'on', RECALL_PEOPLE: 'on' });
    applyFlags({ CANDOR: 'on' }, env); // the next caller
    expect(env).toEqual({ SEMANTIC_RECALL: 'on', LIVE_SUMMARIES: 'on', CANDOR: 'on' });
    applyFlags({}, env); // a caller with none
    expect(env).toEqual({ SEMANTIC_RECALL: 'on', LIVE_SUMMARIES: 'on' });
  });
});

describe('applyCallerFlags', () => {
  const on = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    COHORT_FLAGS: 'on',
    ...extra,
  });

  it('applies a member’s flags at call start, and nothing unless COHORT_FLAGS=on', async () => {
    const s = store({ mindy: [family] });
    const env = on();
    expect((await applyCallerFlags('mindy', { store: s, env })).sort()).toEqual([
      'OPENER_FOLLOW_UP',
      'RECALL_PEOPLE',
      'SEMANTIC_RECALL',
    ]);
    expect(env.RECALL_PEOPLE).toBe('on');
    const off: NodeJS.ProcessEnv = {};
    expect(await applyCallerFlags('mindy', { store: s, env: off })).toEqual([]);
    expect(off.RECALL_PEOPLE).toBeUndefined();
  });

  it('applies nothing when a worker can run several calls at once', async () => {
    const env = on({ AGENT_MAX_JOBS_PER_WORKER: '3' });
    expect(await applyCallerFlags('mindy', { store: store({ mindy: [family] }), env })).toEqual([]);
    expect(env.RECALL_PEOPLE).toBeUndefined();
    expect(
      oneCallPerProcess({ AGENT_MAX_JOBS_PER_WORKER: '3', AGENT_JOB_EXECUTOR: 'process' })
    ).toBe(true);
    expect(oneCallPerProcess({})).toBe(true);
  });

  it("clears the last caller's flags when the store is slow, fails, or the caller is anonymous", async () => {
    const env = on();
    await applyCallerFlags('mindy', { store: store({ mindy: [family] }), env });
    const slow: CohortStore = {
      cohortsFor: () => new Promise(() => undefined),
      overridesFor: async () => ({}),
    };
    expect(await applyCallerFlags('mom', { store: slow, env, timeoutMs: 20 })).toEqual([]);
    expect(env.RECALL_PEOPLE).toBeUndefined();
    await applyCallerFlags('mindy', { store: store({ mindy: [family] }), env });
    const failing: CohortStore = {
      cohortsFor: async () => Promise.reject(new Error('down')),
      overridesFor: async () => ({}),
    };
    await applyCallerFlags('mom', { store: failing, env });
    expect(env.RECALL_PEOPLE).toBeUndefined();
    await applyCallerFlags('mindy', { store: store({ mindy: [family] }), env });
    await applyCallerFlags('anonymous', { store: store({}), env });
    expect(env.OPENER_FOLLOW_UP).toBeUndefined();
  });
});
