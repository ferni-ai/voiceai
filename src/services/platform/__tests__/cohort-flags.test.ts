import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCallerFlags,
  applyFlags,
  FLAG_CACHE_TTL_MS,
  flagForUser,
  forgetAgentValues,
  forgetFlagCache,
  usersWithFlag,
  type FlagHolderStore,
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
      cohortsFor: async () =>
        new Promise<Cohort[]>(() => {
          /* never settles */
        }),
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

describe('per-user lookup for servers that serve many users (flagForUser, usersWithFlag)', () => {
  const ON = { COHORT_FLAGS: 'on' };
  const proactive: Cohort = { id: 'family', enabled: true, flags: { PROACTIVE_CHANNELS: 'on' } };
  const paused: Cohort = { id: 'paused', enabled: false, flags: { PROACTIVE_CHANNELS: 'on' } };
  const data = store(
    { mindy: [proactive], mom: [proactive], dad: [paused] },
    { mom: { PROACTIVE_CHANNELS: 'off' }, solo: { PROACTIVE_CHANNELS: 'on' } }
  );
  // What the Firestore queries return: anyone a cohort or override names, before resolution.
  const holders: FlagHolderStore = { candidatesFor: async () => ['mindy', 'mom', 'dad', 'solo'] };

  beforeEach(() => forgetFlagCache());

  it("an override 'off' beats a cohort 'on'", async () => {
    expect(await flagForUser('mindy', 'PROACTIVE_CHANNELS', { store: data, env: ON })).toBe('on');
    expect(await flagForUser('mom', 'PROACTIVE_CHANNELS', { store: data, env: ON })).toBe('off');
    expect(
      await flagForUser('dad', 'PROACTIVE_CHANNELS', { store: data, env: ON })
    ).toBeUndefined();
  });

  it('usersWithFlag: cohort members and overrides that are on, minus overrides that are off', async () => {
    expect(await usersWithFlag('PROACTIVE_CHANNELS', { store: data, holders, env: ON })).toEqual([
      'mindy',
      'solo',
    ]);
  });

  it('reads nothing and finds no one unless COHORT_FLAGS=on', async () => {
    const reads = { cohortsFor: vi.fn(data.cohortsFor), overridesFor: vi.fn(data.overridesFor) };
    const find = { candidatesFor: vi.fn(holders.candidatesFor) };
    expect(await flagForUser('mindy', 'PROACTIVE_CHANNELS', { store: reads, env: {} })).toBe(
      undefined
    );
    expect(
      await usersWithFlag('PROACTIVE_CHANNELS', { store: reads, holders: find, env: {} })
    ).toEqual([]);
    expect(reads.cohortsFor).not.toHaveBeenCalled();
    expect(find.candidatesFor).not.toHaveBeenCalled();
  });

  it('only allowlisted flags', async () => {
    const s = store({ u: [{ id: 'c', enabled: true, flags: { AGENT_JOB_EXECUTOR: 'on' } }] });
    expect(await flagForUser('u', 'AGENT_JOB_EXECUTOR', { store: s, env: ON })).toBeUndefined();
    expect(await usersWithFlag('AGENT_JOB_EXECUTOR', { store: s, holders, env: ON })).toEqual([]);
  });

  it('never writes process.env', async () => {
    const had = process.env.COHORT_FLAGS;
    process.env.COHORT_FLAGS = 'on';
    const before = { ...process.env };
    try {
      expect(await usersWithFlag('PROACTIVE_CHANNELS', { store: data, holders })).toContain(
        'mindy'
      );
      expect(await flagForUser('mindy', 'PROACTIVE_CHANNELS', { store: data })).toBe('on');
      expect({ ...process.env }).toEqual(before);
      expect(process.env.PROACTIVE_CHANNELS).toBeUndefined();
    } finally {
      if (had === undefined) delete process.env.COHORT_FLAGS;
      else process.env.COHORT_FLAGS = had;
    }
  });

  it('reuses a read for a minute, then reads again; a failed read keeps the last value', async () => {
    let t = 1_000_000;
    const overrides = vi.fn(async () => ({ PROACTIVE_CHANNELS: 'on' }));
    const s: CohortStore = { cohortsFor: async () => [], overridesFor: overrides };
    const opts = { store: s, env: ON, now: () => t };
    expect(await flagForUser('solo', 'PROACTIVE_CHANNELS', opts)).toBe('on');
    t += FLAG_CACHE_TTL_MS - 1;
    expect(await flagForUser('solo', 'PROACTIVE_CHANNELS', opts)).toBe('on');
    expect(overrides).toHaveBeenCalledTimes(1);
    t += 1;
    overrides.mockRejectedValueOnce(new Error('down'));
    expect(await flagForUser('solo', 'PROACTIVE_CHANNELS', opts)).toBe('on');
    expect(overrides).toHaveBeenCalledTimes(2);
    expect(
      await flagForUser('never-read', 'PROACTIVE_CHANNELS', { ...opts, store: failing() })
    ).toBe(undefined);
  });

  it('a failed holder read finds no one rather than throwing', async () => {
    const down: FlagHolderStore = { candidatesFor: async () => Promise.reject(new Error('down')) };
    expect(
      await usersWithFlag('PROACTIVE_CHANNELS', { store: data, holders: down, env: ON })
    ).toEqual([]);
  });
});

function failing(): CohortStore {
  return {
    cohortsFor: async () => Promise.reject(new Error('down')),
    overridesFor: async () => ({}),
  };
}
