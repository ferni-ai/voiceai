import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { PRIOR_APPETITE } from '../appetite.js';
import {
  pickThread,
  scoreCandidate,
  type ArbiterInput,
  type AskEvent,
  type GateId,
  type ThreadPlan,
} from '../arbiter.js';
import type { FollowUp } from '../follow-up.js';
import { pickOpenerFollowUp } from '../opener-pick.js';
import { followUp } from './fixtures.js';

// Tuesday 2026-11-10, 15:00 in New York (UTC-5).
const NOW = new Date('2026-11-10T20:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
const CALL_START = new Date(NOW.getTime() - 30 * 60_000);

const thread = (over: Partial<FollowUp> = {}): FollowUp =>
  followUp({
    id: 't1',
    kind: 'thread',
    text: 'the job interview at the bakery',
    dueAt: null,
    topicKey: 'interview bakery',
    createdAt: ago(2 * DAY),
    updatedAt: ago(2 * DAY),
    ...over,
  });

const input = (over: Partial<ArbiterInput> = {}): ArbiterInput => ({
  crisis: false,
  minorCare: false,
  held: false,
  forgotten: () => false,
  candidates: [thread()],
  asks: [],
  callStartedAt: CALL_START,
  appetite: PRIOR_APPETITE,
  ...over,
});

const ask = (followUpId: string, msAgo: number, topicKey?: string): AskEvent => ({
  followUpId,
  at: ago(msAgo),
  ...(topicKey && { topicKey }),
});

const plan = (over: Partial<ArbiterInput> = {}): ThreadPlan => pickThread(input(over), NOW);
const pickedId = (over: Partial<ArbiterInput> = {}) => plan(over).pick?.id ?? null;

describe('pickThread: the baseline every gate test moves one input from', () => {
  it('picks the one open thread when nothing stops it', () => {
    expect(plan()).toEqual({ pick: thread(), blockedBy: null, dropped: {} });
  });
});

describe('holds empty the list before any candidate is scored (plan 8b-2)', () => {
  const holds: Array<[GateId, Partial<ArbiterInput>]> = [
    ['crisis', { crisis: true }],
    ['minor-care', { minorCare: true }],
    ['hold', { held: true }],
    ['forgotten', { forgotten: null }],
  ];
  it.each(holds)('G %s: blocks the plan and never calls the scorer', (gate, over) => {
    const score = vi.fn(scoreCandidate);
    const result = pickThread(input(over), NOW, score);
    expect(result).toEqual({ pick: null, blockedBy: gate, dropped: {} });
    expect(score).not.toHaveBeenCalled();
  });

  it('green: with every hold clear, the scorer runs on each candidate and a thread is picked', () => {
    const score = vi.fn(scoreCandidate);
    expect(pickThread(input(), NOW, score).pick?.id).toBe('t1');
    expect(score).toHaveBeenCalledTimes(1);
  });

  it('G1 crisis beats every other hold (it is checked first)', () => {
    expect(plan({ crisis: true, minorCare: true, held: true, forgotten: null }).blockedBy).toBe(
      'crisis'
    );
  });
});

describe('G4 forgotten: a forgotten topic removes that candidate', () => {
  it('red: drops the matching thread and counts it', () => {
    const other = thread({ id: 't2', text: 'the dentist visit', topicKey: 'dentist' });
    const forgotten = (text: string) => text.includes('bakery');
    const result = plan({ candidates: [thread(), other], forgotten });
    expect(result.pick?.id).toBe('t2');
    expect(result.dropped).toEqual({ forgotten: 1 });
  });
  it('green: a list that matches nothing keeps it', () => {
    expect(pickedId({ forgotten: (text) => text.includes('dentist') })).toBe('t1');
  });
});

describe("G5 not-callers-own: only the caller's own things", () => {
  it.each<[string, Partial<FollowUp>]>([
    ["Ferni's promise", { kind: 'promise' }],
    ['a read-back action', { action: { tool: 'reachOut', waitingOn: 'you' } }],
    ['a row Ferni owns', { owner: 'ferni' }],
  ])('red: %s is dropped', (_name, over) => {
    const result = plan({ candidates: [thread(over)] });
    expect(result).toEqual({ pick: null, blockedBy: null, dropped: { 'not-callers-own': 1 } });
  });
  it("green: the caller's own commitment is kept", () => {
    expect(pickedId({ candidates: [thread({ kind: 'commitment' })] })).toBe('t1');
  });
});

describe("G6 premature: never before the event, in the caller's zone", () => {
  const dropped = (over: Partial<FollowUp>) => plan({ candidates: [thread(over)] }).dropped;
  it("red: precision 'time' an hour from now", () => {
    expect(dropped({ eventAt: ago(-HOUR), eventPrecision: 'time' })).toEqual({ premature: 1 });
  });
  it("green: precision 'time' an hour ago", () => {
    expect(dropped({ eventAt: ago(HOUR), eventPrecision: 'time' })).toEqual({});
  });
  it("red: precision 'day' for today in New York, though that instant has passed", () => {
    // 10:00 New York today; the day ends at midnight New York, after NOW (15:00 New York).
    expect(dropped({ eventAt: '2026-11-10T15:00:00.000Z', eventPrecision: 'day' })).toEqual({
      premature: 1,
    });
  });
  it("red: precision 'day' late on today's New York date, past UTC midnight", () => {
    // 23:30 New York on the 10th is 04:30 UTC on the 11th: still today in New York.
    const late = { eventAt: '2026-11-11T04:30:00.000Z', eventPrecision: 'day' as const };
    expect(pickThread(input({ candidates: [thread(late)] }), new Date('2026-11-11T04:45:00Z')).dropped).toEqual({ premature: 1 }); // prettier-ignore
  });
  it("green: precision 'day' for yesterday in New York", () => {
    expect(dropped({ eventAt: '2026-11-09T15:00:00.000Z', eventPrecision: 'day' })).toEqual({});
  });
  it("red: precision 'week' for this week (Monday the 9th; the week ends Monday the 16th)", () => {
    expect(dropped({ eventAt: '2026-11-09T15:00:00.000Z', eventPrecision: 'week' })).toEqual({
      premature: 1,
    });
  });
  it("green: precision 'week' for last week (Sunday the 8th; that week ended Monday the 9th)", () => {
    expect(dropped({ eventAt: '2026-11-08T15:00:00.000Z', eventPrecision: 'week' })).toEqual({});
  });
  it('red: no eventAt, but the time to ask (dueAt) is still ahead', () => {
    expect(dropped({ dueAt: ago(-DAY) })).toEqual({ premature: 1 });
  });
  it('green: an undated thread passes', () => {
    expect(dropped({ dueAt: null, eventAt: null })).toEqual({});
  });
});

describe('G7 stale: open only, and not past rightMoment expiry', () => {
  it('red: already surfaced (asked, waiting on the answer)', () => {
    expect(plan({ candidates: [thread({ status: 'surfaced' })] }).dropped).toEqual({ stale: 1 });
  });
  it('red: an undated thread 20 days old expires', () => {
    expect(plan({ candidates: [thread({ createdAt: ago(20 * DAY) })] }).dropped).toEqual({
      stale: 1,
    });
  });
  it('green: open and 2 days old', () => {
    expect(plan({ candidates: [thread()] }).dropped).toEqual({});
  });
});

describe('G8 asked-48h: the same follow-up or topic within 48 h', () => {
  const dropped = (over: Partial<ArbiterInput>) => plan(over).dropped;
  it('red: this follow-up was raised 47 h ago', () => {
    expect(dropped({ asks: [ask('t1', 47 * HOUR)] })).toEqual({ 'asked-48h': 1 });
  });
  it('red: another row on the same topic was asked 47 h ago', () => {
    expect(dropped({ asks: [ask('other', 47 * HOUR, 'interview bakery')] })).toEqual({
      'asked-48h': 1,
    });
  });
  it('red: still snoozed after a "not yet"', () => {
    const candidates = [thread({ snoozedUntil: ago(-DAY) })];
    expect(dropped({ candidates })).toEqual({ 'asked-48h': 1 });
  });
  it('green: raised 49 h ago, on the same topic', () => {
    expect(pickedId({ asks: [ask('t1', 49 * HOUR, 'interview bakery')] })).toBe('t1');
  });
});

describe('G9 every-other-call: not when the call that just ended had a Ferni-started ask', () => {
  it('red: an ask 10 minutes ago, during the call, on another thread', () => {
    expect(plan({ asks: [ask('x', 10 * 60_000)] })).toEqual({
      pick: null,
      blockedBy: 'every-other-call',
      dropped: {},
    });
  });
  it('green: the last ask was a minute before the call started', () => {
    expect(pickedId({ asks: [ask('x', 31 * 60_000)] })).toBe('t1');
  });
});

describe('G10 weekly-cap: asks in the rolling 7 days against the appetite budget', () => {
  const asks = (n: number) => Array.from({ length: n }, (_, i) => ask(`x${i}`, (3 + i) * DAY));
  it('red: three asks this week meet the prior budget of three', () => {
    expect(plan({ asks: asks(3) }).blockedBy).toBe('weekly-cap');
  });
  it('green: two asks this week', () => {
    expect(pickedId({ asks: asks(2) })).toBe('t1');
  });
  it('green: an ask 8 days ago is outside the window', () => {
    expect(pickedId({ asks: [...asks(2), ask('old', 8 * DAY)] })).toBe('t1');
  });
  it('red: a brushed-off appetite (budget 1) is capped by one ask', () => {
    expect(plan({ asks: asks(1), appetite: { alpha: 2, beta: 6 } }).blockedBy).toBe('weekly-cap');
  });
});

describe('G11 heavy-wait: a heavy or sensitive thread waits 7 days from when it was raised', () => {
  const salience = { weight: 0.9, heavy: false, sensitive: true, by: 'llm' as const, v: 1 };
  const light = thread({ id: 'light', text: 'the garden', topicKey: 'garden' });
  it('red: a sensitive thread raised 2 days ago holds the whole plan', () => {
    const heavy = thread({ id: 'h', salience, createdAt: ago(2 * DAY) });
    expect(plan({ candidates: [light, heavy] }).blockedBy).toBe('heavy-wait');
  });
  it('red: a heavy (not sensitive) thread raised 2 days ago', () => {
    const heavy = thread({ id: 'h', salience: { ...salience, sensitive: false, heavy: true } });
    expect(plan({ candidates: [light, heavy] }).blockedBy).toBe('heavy-wait');
  });
  it('green: the same thread raised 8 days ago', () => {
    const heavy = thread({ id: 'h', salience, createdAt: ago(8 * DAY) });
    expect(plan({ candidates: [light, heavy] }).blockedBy).toBeNull();
  });
});

describe('ranking among survivors', () => {
  it("is the opener's order: due ones first (latest due first), then undated newest first", () => {
    const dueEarly = thread({ id: 'due-early', topicKey: 'a', dueAt: ago(5 * HOUR) });
    const dueLate = thread({ id: 'due-late', topicKey: 'b', dueAt: ago(2 * HOUR) });
    const undated = thread({ id: 'undated', topicKey: 'c', createdAt: ago(HOUR) });
    const all = [undated, dueEarly, dueLate];
    expect(pickedId({ candidates: all })).toBe('due-late');
    expect(pickedId({ candidates: all })).toBe(pickOpenerFollowUp(all, NOW)?.id);
    expect(pickedId({ candidates: [undated, dueEarly] })).toBe('due-early');
  });
});

describe('the plan can neither schedule nor send', () => {
  it('has exactly a pick, a gate and the counts: no time to act and no channel', () => {
    expectTypeOf<keyof ThreadPlan>().toEqualTypeOf<'pick' | 'blockedBy' | 'dropped'>();
    expect(Object.keys(plan()).sort()).toEqual(['blockedBy', 'dropped', 'pick']);
  });
});
