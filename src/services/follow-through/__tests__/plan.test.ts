import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({
  lines: [] as Array<{ level: string; obj: unknown; msg: string }>,
}));
vi.mock('../../../utils/safe-logger.js', () => {
  const at = (level: string) => (obj: unknown, msg: string) =>
    logged.lines.push({ level, obj, msg });
  const logger = { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
  return { createLogger: () => logger };
});

import { GATE_IDS } from '../arbiter.js';
import { followUp } from './fixtures.js';
import type { FollowUp, FollowUpKind } from '../follow-up.js';
import { asksIn, planNextThread, runFollowUpPlan, type PlanPorts } from '../plan.js';
import { reachableFrom } from './import-graph.js';

const NOW = new Date('2026-11-10T20:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
const CALL = {
  userId: 'user-ada-0042',
  sessionId: 'sess-555-0100',
  startedAt: new Date(NOW.getTime() - 30 * 60_000),
};

const thread = (over: Partial<FollowUp> = {}): FollowUp =>
  followUp({
    id: 'fu-secret-0001',
    userId: CALL.userId,
    kind: 'thread',
    text: "Dana's interview at Lakeside Bakery",
    dueAt: null,
    topicKey: 'dana interview',
    createdAt: ago(2 * DAY),
    ...over,
  });

function ports(over: Partial<PlanPorts> = {}): PlanPorts {
  return {
    followUps: vi.fn(async () => [thread()]),
    askHistory: vi.fn(async () => []),
    forgotten: vi.fn(async () => () => false),
    crisis: { thisCall: vi.fn(() => false), within: vi.fn(async () => false) },
    minorCare: vi.fn(() => false),
    holds: vi.fn(async () => false),
    ...over,
  };
}

const boom = () => {
  throw new Error('unreadable');
};

beforeEach(() => {
  logged.lines.length = 0;
});

describe('planNextThread: holds read through ports fail closed', () => {
  it('green: every read clear picks the thread', async () => {
    const { plan } = await planNextThread(CALL, ports(), NOW);
    expect(plan.pick?.id).toBe('fu-secret-0001');
  });

  it.each<[string, string, Partial<PlanPorts>]>([
    [
      'crisis risk this call',
      'crisis',
      { crisis: { thisCall: () => true, within: async () => false } },
    ],
    ['this-call read throws', 'crisis', { crisis: { thisCall: boom, within: async () => false } }],
    [
      'a crisis signal in the last 72 h',
      'crisis',
      { crisis: { thisCall: () => false, within: async () => true } },
    ],
    [
      'the 72 h read rejects',
      'crisis',
      { crisis: { thisCall: () => false, within: async () => boom() } },
    ],
    ['MINOR_CARE holds the caller', 'minor-care', { minorCare: () => true }],
    ['the minor-care read throws', 'minor-care', { minorCare: boom }],
    ['an opt-out or other hold', 'hold', { holds: async () => true }],
    ['the holds read rejects', 'hold', { holds: async () => boom() }],
    ['the forgotten list is unreadable', 'forgotten', { forgotten: async () => null }],
    ['the forgotten read rejects', 'forgotten', { forgotten: async () => boom() }],
    // A port that answers undefined (a broken or half-wired read) holds too: only `false` passes.
    [
      'the this-call read answers undefined',
      'crisis',
      { crisis: { thisCall: () => undefined as unknown as boolean, within: async () => false } },
    ],
    [
      'the 72 h read answers undefined',
      'crisis',
      { crisis: { thisCall: () => false, within: async () => undefined as unknown as boolean } },
    ],
    [
      'the minor-care read answers undefined',
      'minor-care',
      { minorCare: () => undefined as unknown as boolean },
    ],
    [
      'the holds read answers undefined',
      'hold',
      { holds: async () => undefined as unknown as boolean },
    ],
    [
      'the forgotten read answers undefined',
      'forgotten',
      { forgotten: async () => undefined as unknown as null },
    ],
  ])('%s blocks with %s', async (_name, gate, over) => {
    const { plan } = await planNextThread(CALL, ports(over), NOW);
    expect(plan).toEqual({ pick: null, blockedBy: gate, dropped: {} });
  });

  it('asks the 72 h crisis window, not a shorter one', async () => {
    const p = ports();
    await planNextThread(CALL, p, NOW);
    expect(p.crisis.within).toHaveBeenCalledWith(CALL.userId, 72, NOW);
    expect(p.crisis.thisCall).toHaveBeenCalledWith(CALL.sessionId);
  });
});

describe('ask history: surfaced and #2084 asks, from rows changed in the last 7 days', () => {
  it('reads [now - 7 days, now] of changed rows', async () => {
    const p = ports();
    await planNextThread(CALL, p, NOW);
    const [user, from, to] = vi.mocked(p.askHistory).mock.calls[0];
    expect(user).toBe(CALL.userId);
    expect(NOW.getTime() - from.getTime()).toBe(7 * DAY);
    expect(to.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('a closed row raised during the call that just ended blocks every-other-call', async () => {
    const closed = thread({
      id: 'x',
      topicKey: 'garden',
      status: 'released',
      surfaced: [{ at: ago(10 * 60_000), via: 'opener' }],
    });
    const { plan } = await planNextThread(CALL, ports({ askHistory: async () => [closed] }), NOW);
    expect(plan.blockedBy).toBe('every-other-call');
  });

  it('an ask kept in both surfaced and asks counts once (2 distinct asks stay under the cap of 3)', async () => {
    const asked = (at: string) => ({
      at,
      via: 'in-call' as const,
      personaId: 'ferni',
      sessionId: 's',
    });
    const twice = thread({
      id: 'x',
      status: 'released',
      surfaced: [ago(3 * DAY), ago(4 * DAY)].map((at) => ({ at, via: 'in-call' as const })),
      asks: [ago(3 * DAY), ago(4 * DAY)].map(asked),
    });
    expect(asksIn([twice])).toHaveLength(2);
    const under = await planNextThread(CALL, ports({ askHistory: async () => [twice] }), NOW);
    expect(under.plan.pick?.id).toBe('fu-secret-0001');
    const third = thread({ id: 'y', status: 'released', asks: [asked(ago(5 * DAY))] });
    const at = await planNextThread(CALL, ports({ askHistory: async () => [twice, third] }), NOW);
    expect(at.plan.blockedBy).toBe('weekly-cap');
  });

  it('with no appetite port, the prior budget of three applies', async () => {
    const asked = (n: number) =>
      thread({
        id: `a${n}`,
        status: 'done',
        surfaced: [{ at: ago((n + 2) * DAY), via: 'opener' }],
      });
    const two = await planNextThread(
      CALL,
      ports({ askHistory: async () => [asked(1), asked(2)] }),
      NOW
    );
    expect(two.plan.pick).not.toBeNull();
    const lowAppetite = ports({
      askHistory: async () => [asked(1)],
      appetite: async () => ({ alpha: 2, beta: 6 }),
    });
    expect((await planNextThread(CALL, lowAppetite, NOW)).plan.blockedBy).toBe('weekly-cap');
  });
});

describe('the shadow log line: privacy shape (plan 8b-4)', () => {
  // A Record over the union, so a new kind fails to compile until it is listed.
  const KINDS: Record<FollowUpKind, true> = {
    reminder: true,
    commitment: true,
    promise: true,
    thread: true,
    date: true,
    dose: true,
  };
  const ALLOWED = new Set<string>([...GATE_IDS, ...Object.keys(KINDS), 'shadow', 'on']);
  /** Every string value in the record, and the keys of `dropped` (which must be gate ids). */
  function strings(record: object): string[] {
    const out: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(record);
    const dropped = (record as { dropped?: object }).dropped ?? {};
    return [...out, ...Object.keys(dropped)];
  }
  const disallowed = (record: object) => strings(record).filter((s) => !ALLOWED.has(s));

  it('logs exactly one line, with only mode, gate ids, counts, picked and kind', async () => {
    const forgotten = async () => (text: string) => text.includes('dentist');
    const dentist = thread({
      id: 'fu-secret-0002',
      text: 'the dentist on Elm St',
      topicKey: 'dentist',
    });
    const p = ports({ followUps: async () => [thread(), dentist], forgotten });
    const record = await runFollowUpPlan(CALL, 'shadow', p, NOW);
    const lines = logged.lines.filter((l) => l.level === 'info');
    expect(lines).toHaveLength(1);
    expect(lines[0].msg).toBe('FOLLOW_UP_PLAN');
    expect(lines[0].obj).toEqual(record);
    expect(record).toEqual({
      mode: 'shadow',
      picked: true,
      kind: 'thread',
      blockedBy: null,
      dropped: { forgotten: 1 },
      candidates: 2,
    });
    const json = JSON.stringify(lines[0].obj);
    for (const secret of [
      CALL.userId,
      CALL.sessionId,
      'fu-secret',
      'Dana',
      'Lakeside',
      'dentist',
      'Elm',
    ])
      expect(json).not.toContain(secret);
  });

  it('fails if any string other than a kind, gate id or mode is present', async () => {
    const blocked = await runFollowUpPlan(CALL, 'on', ports({ holds: async () => true }), NOW);
    const picked = await runFollowUpPlan(CALL, 'shadow', ports(), NOW);
    for (const record of [blocked, picked]) {
      expect(disallowed(record)).toEqual([]);
      expect(Object.keys(record).sort()).toEqual([
        'blockedBy',
        'candidates',
        'dropped',
        'kind',
        'mode',
        'picked',
      ]);
    }
    // The check itself can go red: a record carrying the topic's words fails it.
    expect(disallowed({ ...picked, topic: 'dana interview' })).toEqual(['dana interview']);
    expect(disallowed({ ...picked, dropped: { 'fu-secret-0001': 1 } })).toEqual(['fu-secret-0001']);
  });
});

describe('import graph: the arbiter and the plan reach no send, dial, outreach, prompt or memory module', () => {
  const FORBIDDEN =
    /(^|\/)(outreach|messaging|proactive-channels|concierge|external-apis|scheduling|injection-builders|prompts?)\/|(send|dial|sms|twilio|push|prompt|inject|deliver)[^/]*\.ts$|^src\/memory\/index\.ts$/i;
  it.each(['src/services/follow-through/arbiter.ts', 'src/services/follow-through/plan.ts'])(
    '%s',
    (entry) => {
      const reach = reachableFrom(entry);
      expect(reach.has('src/services/follow-through/follow-up.ts')).toBe(true); // the walk walks
      expect([...reach].filter((f) => FORBIDDEN.test(f))).toEqual([]);
    }
  );
  it('the check can go red: the opener pick reaches memory/index', () => {
    const reach = [...reachableFrom('src/services/follow-through/opener-pick.ts')];
    expect(reach.filter((f) => FORBIDDEN.test(f))).toContain('src/memory/index.ts');
  });
});
