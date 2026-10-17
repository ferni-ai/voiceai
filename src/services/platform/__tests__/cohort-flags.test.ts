import { afterEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info, warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

import {
  applyCallerFlags,
  applyFlags,
  envForCaller,
  forgetAgentValues,
  oneCallPerProcess,
  resolveCaller,
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
  ])('a cohort can turn %s on for its members', async (flag) => {
    const s = store({ seth: [{ id: 'seth', enabled: true, flags: { [flag]: 'on' } }] });
    expect(await resolveCallerFlags('seth', s)).toEqual({ [flag]: 'on' });
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
    expect(await applyCallerFlags('seth', { store: s, env })).toEqual([flag]);
    expect(env[flag]).toBe('on');
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
