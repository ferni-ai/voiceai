import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info, warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

import {
  applyCallerFlags,
  applyFlags,
  envForCaller,
  FLAG_CACHE_TTL_MS,
  FLAG_STALE_MAX_MS,
  flagForUser,
  forgetAgentValues,
  inSample,
  forgetFlagCache,
  usersWithFlag,
  type FlagHolderStore,
  oneCallPerProcess,
  resolveCaller,
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

afterEach(() => {
  forgetAgentValues();
  info.mockClear();
});

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

describe('the switches a cohort may set', () => {
  // Each is read after applyCallerFlags (agent setup, a turn, a handoff) or, after the
  // call, through envForCaller. Dropping one from COHORT_FLAGS must fail here.
  it.each([
    'CALL_WRAP_UP',
    'WRAP_UP',
    'SHORT_GOODBYE',
    'PHONE_GOODBYE',
    'HAPPY_EXITS',
    'HANDOFF_TALK_THROUGH',
    'NAME_CORRECTION',
    'ROOM_GUESTS',
    'BARGE_IN_ACK_WORDS',
    'FRIEND_FOLLOWUPS',
    'INSIDE_JOKES',
    'DATES_THAT_MATTER',
    'HANDOFF_FULL_TOOLS',
    'TEAM_VOICES',
    'FERNI_PERSONA_SLIP_GUARD',
    'DIRECTOR_PERSONA_AWARE',
    'COACH_WINS',
    'FRIEND_CELEBRATIONS',
    'REVIVED_INTELLIGENCE',
    'CALL_JOURNAL',
    'FOLLOW_THROUGH_IMPORT',
    'PONDERING',
    'LIVE_SUMMARIES',
    'PERSONA_VOICE',
  ])('a cohort can turn %s on for its members', async (flag) => {
    const s = store({ seth: [{ id: 'seth', enabled: true, flags: { [flag]: 'on' } }] });
    expect(await resolveCallerFlags('seth', s)).toEqual({ [flag]: 'on' });
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
    expect(await applyCallerFlags('seth', { store: s, env })).toEqual([flag]);
    expect(env[flag]).toBe('on');
  });
});

describe('flags with a mode, not a switch', () => {
  it('a cohort can set TURN_LENGTH and TURN_TEXTURE to learned, and they reach the env', async () => {
    const flags = { PERSONA_VOICE: 'on', TURN_LENGTH: 'learned', TURN_TEXTURE: 'learned' };
    const s = store({ seth: [{ id: 'seth', enabled: true, flags }] });
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
    expect((await applyCallerFlags('seth', { store: s, env })).sort()).toEqual(
      Object.keys(flags).sort()
    );
    expect(env).toMatchObject(flags);
  });

  it('drops a mode on a switch and a switch value on a mode', async () => {
    const s = store(
      { u: [{ id: 'c', enabled: true, flags: { TURN_LENGTH: 'on', CANDOR: 'learned' } }] },
      { u: { TURN_TEXTURE: 'yes', PERSONA_VOICE: 'learned' } }
    );
    expect(await resolveCallerFlags('u', s)).toEqual({});
  });

  it("an override 'off' beats a cohort's learned", async () => {
    const s = store(
      { u: [{ id: 'c', enabled: true, flags: { TURN_LENGTH: 'learned' } }] },
      { u: { TURN_LENGTH: 'off' } }
    );
    expect(await resolveCallerFlags('u', s)).toEqual({ TURN_LENGTH: 'off' });
  });
});

describe('which audience got what', () => {
  it('names the enabled cohorts and whether the caller has overrides, never members', async () => {
    const s = store(
      { seth: [family, { id: 'seth', enabled: true, flags: { CALL_WRAP_UP: 'on' } }, { id: 'beta-waitlist-2026-10', enabled: false, flags: {} }] }, // prettier-ignore
      { seth: { CANDOR: 'on' } }
    );
    expect(await resolveCaller('seth', s)).toMatchObject({
      cohorts: ['friends-and-family', 'seth'],
      overridden: true,
    });
    await applyCallerFlags('seth-uid-0123456789', {
      store: {
        ...s,
        cohortsFor: () => s.cohortsFor('seth'),
        overridesFor: () => s.overridesFor('seth'),
      },
      env: { COHORT_FLAGS: 'on' },
    });
    const [fields, msg] = info.mock.calls.at(-1) ?? [];
    expect(msg).toBe('Cohort flags applied');
    expect(fields).toMatchObject({
      userId: 'seth-uid',
      cohorts: ['friends-and-family', 'seth'],
      overridden: true,
      flags: expect.objectContaining({ CALL_WRAP_UP: 'on', CANDOR: 'on' }),
    });
    expect(JSON.stringify(fields)).not.toContain('members');
  });
});

describe('envForCaller (work that runs after a call)', () => {
  const s = store({ mindy: [{ id: 'f', enabled: true, flags: { DATES_THAT_MATTER: 'on' } }] });

  it("reads the ended call's caller, not the next caller's flags in the env", async () => {
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
    await applyCallerFlags('mindy', { store: s, env }); // Mindy's call
    const next = store({ mom: [{ id: 'g', enabled: true, flags: { FRIEND_FOLLOWUPS: 'on' } }] });
    await applyCallerFlags('mom', { store: next, env }); // the next call starts first
    expect(env.DATES_THAT_MATTER).toBeUndefined();
    expect((await envForCaller('mindy', { store: s, env })).DATES_THAT_MATTER).toBe('on');
    // And the other way round: the next caller's flag never leaks into Mindy's work.
    expect((await envForCaller('mindy', { store: s, env })).FRIEND_FOLLOWUPS).toBeUndefined();
  });

  it("falls back to the agent's own values: flag off, anonymous, or a failed read", async () => {
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on', DATES_THAT_MATTER: 'off' };
    await applyCallerFlags('mindy', { store: s, env });
    expect(env.DATES_THAT_MATTER).toBe('on');
    const failing: CohortStore = { cohortsFor: () => Promise.reject(new Error('down')), overridesFor: async () => ({}) }; // prettier-ignore
    expect((await envForCaller('mindy', { store: failing, env })).DATES_THAT_MATTER).toBe('off');
    expect((await envForCaller('anonymous', { store: s, env })).DATES_THAT_MATTER).toBe('off');
    const gateOff = { ...env, COHORT_FLAGS: 'off' };
    expect((await envForCaller('mindy', { store: s, env: gateOff })).DATES_THAT_MATTER).toBe('off');
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

  it("an override turned 'off' drops them on the next rebuild, within one cache period", async () => {
    let t = 1_000_000;
    let value = 'on';
    const s: CohortStore = {
      cohortsFor: async () => [],
      overridesFor: async () => ({ PROACTIVE_CHANNELS: value }),
    };
    const one: FlagHolderStore = { candidatesFor: async () => ['solo'] };
    const opts = { store: s, holders: one, env: ON, now: () => t };
    // Another path (flagForUser) has their 'on' in the per-user cache.
    expect(await flagForUser('solo', 'PROACTIVE_CHANNELS', opts)).toBe('on');
    t += 1_000;
    value = 'off';
    t += 30_000; // first holder rebuild, 30s after the flip, per-user cache still warm
    expect(await usersWithFlag('PROACTIVE_CHANNELS', opts)).toEqual([]);
  });

  it('a stale list stands in for a failed read for at most 5 minutes, then no one', async () => {
    let t = 1_000_000;
    let down = false;
    const one: FlagHolderStore = {
      candidatesFor: async () => (down ? Promise.reject(new Error('down')) : ['solo']),
    };
    const opts = { store: data, holders: one, env: ON, now: () => t };
    expect(await usersWithFlag('PROACTIVE_CHANNELS', opts)).toEqual(['solo']);
    down = true;
    t += FLAG_STALE_MAX_MS - 1;
    expect(await usersWithFlag('PROACTIVE_CHANNELS', opts)).toEqual(['solo']);
    t += 1;
    expect(await usersWithFlag('PROACTIVE_CHANNELS', opts)).toEqual([]);
  });

  it("a person's cached flags stand in for a failed read for at most 5 minutes", async () => {
    let t = 1_000_000;
    const overrides = vi.fn(async () => ({ PROACTIVE_CHANNELS: 'on' }));
    const s: CohortStore = { cohortsFor: async () => [], overridesFor: overrides };
    const opts = { store: s, env: ON, now: () => t };
    expect(await flagForUser('solo', 'PROACTIVE_CHANNELS', opts)).toBe('on');
    overrides.mockRejectedValue(new Error('down'));
    t += FLAG_STALE_MAX_MS - 1;
    expect(await flagForUser('solo', 'PROACTIVE_CHANNELS', opts)).toBe('on');
    t += 1;
    expect(await flagForUser('solo', 'PROACTIVE_CHANNELS', opts)).toBeUndefined();
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

describe('memory flags', () => {
  it('a cohort can set the in-call world facts', async () => {
    const world: Cohort = { id: 'world', enabled: true, flags: { WORLD_FACTS_IN_CALL: 'on' } };
    expect(await resolveCallerFlags('u', store({ u: [world] }))).toEqual({
      WORLD_FACTS_IN_CALL: 'on',
    });
  });
});
