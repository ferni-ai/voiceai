import { afterEach, describe, expect, it } from 'vitest';
import {
  applyCallerFlags,
  applyFlags,
  callerEnv,
  forgetAgentValues,
  inSample,
  missingPrerequisites,
  oneCallPerProcess,
  resolveCallerFlags,
  type Cohort,
  type CohortStore,
} from '../cohort-flags.js';

const store = (
  cohorts: Record<string, Cohort[]>,
  overrides: Record<string, Record<string, string>> = {},
  sampled: Cohort[] = []
): CohortStore => ({
  cohortsFor: async (u) => cohorts[u] ?? [],
  overridesFor: async (u) => overrides[u] ?? {},
  sampledCohorts: async () => sampled,
});

const callers = Array.from({ length: 2000 }, (_, i) => `user-${i}`);

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

  it('drops keys outside the allowlist even when the value is on or off', async () => {
    const s = store(
      { u: [{ id: 'c', enabled: true, flags: { COHORT_FLAGS: 'off', MULTI_AGENT_MODE: 'off' } }] },
      { u: { AGENT_JOB_EXECUTOR: 'on', CANDOR: 'on' } }
    );
    expect(await resolveCallerFlags('u', s)).toEqual({ CANDOR: 'on' });
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
    expect(applyFlags({ COHORT_FLAGS: 'off', NODE_OPTIONS: 'on' }, env)).toEqual([]);
    expect(env).toEqual({ COHORT_FLAGS: 'on' });
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

describe('sampled cohorts', () => {
  const memory = (percent: number, enabled = true): Cohort => ({
    id: 'memory-stack',
    enabled,
    percent,
    flags: { SEMANTIC_RECALL: 'on', RECALL_EPISODES: 'on' },
  });

  it('takes about its percent of callers, the same ones each call', async () => {
    const picked = callers.filter((u) => inSample(memory(10), u));
    expect(picked.length).toBeGreaterThan(150);
    expect(picked.length).toBeLessThan(250);
    expect(callers.filter((u) => inSample(memory(10), u))).toEqual(picked);
    const s = store({}, {}, [memory(10)]);
    expect(await resolveCallerFlags(picked[0] ?? '', s)).toEqual({
      SEMANTIC_RECALL: 'on',
      RECALL_EPISODES: 'on',
    });
    const left = callers.find((u) => !picked.includes(u)) ?? '';
    expect(await resolveCallerFlags(left, s)).toEqual({});
  });

  it('keeps everyone already in when the percent grows, and nobody at 0 or disabled', async () => {
    const at10 = callers.filter((u) => inSample(memory(10), u));
    const at25 = callers.filter((u) => inSample(memory(25), u));
    expect(at10.every((u) => at25.includes(u))).toBe(true);
    expect(at25.length).toBeGreaterThan(at10.length);
    expect(callers.filter((u) => inSample(memory(0), u))).toEqual([]);
    expect(callers.every((u) => inSample(memory(100), u))).toBe(true);
    expect(await resolveCallerFlags(at10[0] ?? '', store({}, {}, [memory(10, false)]))).toEqual({});
  });

  it('picks different callers for different cohorts', () => {
    const other: Cohort = { ...memory(10), id: 'world-facts' };
    const a = callers.filter((u) => inSample(memory(10), u));
    const b = callers.filter((u) => inSample(other, u));
    expect(a.filter((u) => b.includes(u)).length).toBeLessThan(a.length / 2);
  });

  it('always includes members, and their own overrides still win', async () => {
    const left = callers.find((u) => !inSample(memory(10), u)) ?? '';
    const s = store({ [left]: [memory(10)] }, { [left]: { RECALL_EPISODES: 'off' } }, [memory(10)]);
    expect(await resolveCallerFlags(left, s)).toEqual({
      SEMANTIC_RECALL: 'on',
      RECALL_EPISODES: 'off',
    });
  });
});

describe('missingPrerequisites', () => {
  it('names a memory switch turned on without what it builds on', () => {
    expect(missingPrerequisites({ RECALL_EPISODES: 'on' })).toEqual([
      'RECALL_EPISODES needs SEMANTIC_RECALL',
    ]);
    expect(missingPrerequisites({ WORLD_FACTS_IN_CALL: 'on', WORLD_MODEL_TEMPORAL: 'on' })).toEqual(
      [
        'WORLD_MODEL_TEMPORAL needs AFTER_CALL_EXTRACTION',
        'WORLD_FACTS_IN_CALL needs AFTER_CALL_EXTRACTION',
      ]
    );
    expect(
      missingPrerequisites({
        SEMANTIC_RECALL: 'on',
        RECALL_EPISODES: 'on',
        AFTER_CALL_EXTRACTION: 'on',
        WORLD_MODEL_TEMPORAL: 'on',
        WORLD_FACTS_IN_CALL: 'on',
      })
    ).toEqual([]);
  });
});

describe('callerEnv', () => {
  const stack: Cohort = {
    id: 'world',
    enabled: true,
    flags: { AFTER_CALL_EXTRACTION: 'on', WORLD_MODEL_TEMPORAL: 'on' },
  };

  it("gives after-call work this caller's flags, not the next caller's", async () => {
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on', WORLD_MODEL_TEMPORAL: 'off' };
    const s = store({ mindy: [stack] });
    await applyCallerFlags('mindy', { store: s, env });
    await applyCallerFlags('stranger', { store: s, env }); // the next call starts
    expect(env.AFTER_CALL_EXTRACTION).toBeUndefined();
    const mindy = await callerEnv('mindy', { store: s, env });
    expect(mindy).toMatchObject({ AFTER_CALL_EXTRACTION: 'on', WORLD_MODEL_TEMPORAL: 'on' });
    expect(env.AFTER_CALL_EXTRACTION).toBeUndefined();
  });

  it("gives the agent's own values when cohorts are off, the caller is anonymous, or the read fails", async () => {
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on', WORLD_MODEL_TEMPORAL: 'off' };
    await applyCallerFlags('mindy', { store: store({ mindy: [stack] }), env });
    expect(env.WORLD_MODEL_TEMPORAL).toBe('on'); // mindy's call is running
    expect((await callerEnv('anonymous', { env })).WORLD_MODEL_TEMPORAL).toBe('off');
    const failing: CohortStore = {
      cohortsFor: async () => Promise.reject(new Error('down')),
      overridesFor: async () => ({}),
    };
    expect((await callerEnv('mindy', { store: failing, env })).WORLD_MODEL_TEMPORAL).toBe('off');
    const off = { ...env, COHORT_FLAGS: 'off' };
    const s = store({ mindy: [stack] });
    expect((await callerEnv('mindy', { store: s, env: off })).WORLD_MODEL_TEMPORAL).toBe('off');
  });
});
