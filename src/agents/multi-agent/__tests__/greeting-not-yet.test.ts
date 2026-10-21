/**
 * The hello never asks how something went before it has happened, and a
 * same-day return lets them lead (dev sweep 2026-10-21, B4: "Hey Sam, how did
 * the Stripe interview go?" a minute after "I've got a job interview at Stripe
 * on Monday", 3 of 3 return calls).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { OpenCommitment } from '../../../services/superhuman/commitment-follow-up.js';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => undefined),
  markWinSurfaced: vi.fn(async () => undefined),
}));
const open: OpenCommitment[] = [];
vi.mock('../../../services/outreach/call-status.js', () => ({
  checkInsWithCalls: vi.fn(async () => open),
}));

const { directedGreeting, rememberCallerHistory, GREETING_DIRECTION, CHECK_IN_DIRECTION } =
  await import('../greeting-direction.js');
const { SAME_DAY_DIRECTION, commitmentAhead, localYmd, namesDayAhead, openingRestraint } =
  await import('../greeting-not-yet.js');

/** Wednesday 2026-10-21, 18:13 in Tokyo, where the sweep's caller was. */
const NOW = new Date('2026-10-21T09:13:00Z');
const ZONE = 'Asia/Tokyo';
const TODAY = '2026-10-21';
const DAY = 86_400_000;

/** The dev sweep's last-call summary, with the date the summarizer wrote (call-moment.ts). */
const STRIPE =
  'USER has a job interview at Stripe on Monday 2026-10-26; nervous about system design';
const LAST_TOPIC = 'what you talked about last time';
const DID = 'something they said they would do';

type Request = { direction: string; facts: Record<string, string> };
const lastRequest = (): Request => directedText.mock.calls.at(-1)![1] as unknown as Request;

let n = 0;
async function hello(history: { calls: number; daysSince?: number; lastTopic?: string }) {
  const sessionId = `gny-${++n}`;
  rememberCallerHistory(sessionId, history);
  await directedGreeting(sessionId, 'ferni', {
    userId: 'voice-eval-ny',
    userName: 'Sam',
    callerTimezone: ZONE,
  });
  return lastRequest();
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.unstubAllEnvs();
  open.length = 0;
});

describe('a return call the same day (RECENT_CALL_RESTRAINT)', () => {
  it('opens on nothing from before: no last topic, and they lead', async () => {
    const req = await hello({ calls: 1, daysSince: 0, lastTopic: 'the pottery class and Mochi' });
    expect(req.direction).toBe(GREETING_DIRECTION + SAME_DAY_DIRECTION);
    expect(req.facts[LAST_TOPIC]).toBeUndefined();
    expect(req.facts['last time you talked']).toBe('earlier today');
  });

  it('asks about no commitment either, even one already due', async () => {
    vi.stubEnv('COACH_FOLLOW_THROUGH', 'on');
    open.push({
      id: 'c1',
      statement: 'send the resume to Dana',
      createdAt: NOW.getTime() - 2 * 3600_000,
      followUpAfter: 0,
      followUpCount: 0,
    });
    const req = await hello({ calls: 2, daysSince: 0 });
    expect(req.direction).not.toContain(CHECK_IN_DIRECTION);
    expect(req.facts[DID]).toBeUndefined();
  });

  it('RECENT_CALL_RESTRAINT=off: the old same-day hello', async () => {
    vi.stubEnv('RECENT_CALL_RESTRAINT', 'off');
    const req = await hello({ calls: 1, daysSince: 0, lastTopic: 'the pottery class and Mochi' });
    expect(req.direction).toBe(GREETING_DIRECTION);
    expect(req.facts[LAST_TOPIC]).toBe('the pottery class and Mochi');
  });
});

describe('never before it has happened', () => {
  it("drops a last topic whose day is still ahead (the sweep's Stripe interview)", async () => {
    const req = await hello({ calls: 1, daysSince: 2, lastTopic: STRIPE });
    expect(req.facts[LAST_TOPIC]).toBeUndefined();
    expect(req.direction).toBe(GREETING_DIRECTION);
  });

  it('keeps a last topic that is behind them, exactly as before', async () => {
    const past = 'USER had a job interview at Stripe on Monday 2026-10-19';
    const req = await hello({ calls: 3, daysSince: 2, lastTopic: past });
    expect(req.facts[LAST_TOPIC]).toBe(past);
    expect(req.facts['how well you know each other']).toBe('3 calls so far');
    expect(req.direction).toBe(GREETING_DIRECTION);
  });

  it('asks about no commitment not yet due; one that is due is asked as before', async () => {
    vi.stubEnv('COACH_FOLLOW_THROUGH', 'on');
    open.push({
      id: 'c2',
      statement: 'go to the Stripe interview on Monday',
      createdAt: NOW.getTime() - DAY, // said Tuesday: next Monday
      followUpAfter: 0,
      followUpCount: 0,
    });
    const ahead = await hello({ calls: 2, daysSince: 2 });
    expect(ahead.facts[DID]).toBeUndefined();
    expect(ahead.direction).toBe(GREETING_DIRECTION);

    open.length = 0;
    open.push({
      id: 'c3',
      statement: 'call my sister about the wedding',
      createdAt: NOW.getTime() - 2 * DAY,
      targetDate: NOW.getTime() - DAY,
      followUpAfter: 0,
      followUpCount: 0,
    });
    const due = await hello({ calls: 2, daysSince: 2 });
    expect(due.facts[DID]).toBe('call my sister about the wedding');
    expect(due.direction).toBe(GREETING_DIRECTION + CHECK_IN_DIRECTION);
  });
});

describe('namesDayAhead', () => {
  it.each([
    [STRIPE, undefined, true],
    ['interview on 2026-10-21', undefined, true], // today: may not have happened yet
    ['interview on 2026-10-19', undefined, false],
    ['job interview at Stripe on Monday', TODAY, true], // said Wednesday: next Monday
    ['job interview at Stripe on Monday', '2026-10-14', false], // said a week ago: Monday 10-19 passed
    ['the interview last Monday', TODAY, false],
    ['the dentist tomorrow', '2026-10-19', false],
    ['the dentist tomorrow', TODAY, true],
    ['the party tonight', '2026-10-20', false],
    ['flights next week', '2026-10-20', true],
    ['the interview on Monday 2026-10-19', TODAY, false], // an absolute date decides
    ['Mondays are the worst', TODAY, false],
    ['Pepper and the cone', TODAY, false],
  ])('%s (said %s) → %s', (text, saidOn, ahead) => {
    expect(namesDayAhead(text, TODAY, saidOn)).toBe(ahead);
  });
});

describe('the day is the caller’s', () => {
  it('reads today where the caller is', () => {
    const late = Date.parse('2026-10-21T20:00:00Z');
    expect(localYmd(late, ZONE)).toBe('2026-10-22');
    expect(localYmd(late, 'America/Los_Angeles')).toBe('2026-10-21');
    expect(localYmd(late, 'Not/AZone')).toBe('2026-10-21');
  });

  it('a commitment is ahead until its date or named day comes', () => {
    const base = { createdAt: NOW.getTime() - DAY, followUpAfter: 0, followUpCount: 0 };
    expect(
      commitmentAhead(
        { ...base, statement: 'finish the deck', targetDate: NOW.getTime() + DAY },
        NOW.getTime()
      )
    ).toBe(true);
    expect(
      commitmentAhead(
        { ...base, statement: 'finish the deck', targetDate: NOW.getTime() - 1 },
        NOW.getTime()
      )
    ).toBe(false);
    expect(
      commitmentAhead({ ...base, statement: 'run the 10k on Saturday' }, NOW.getTime(), ZONE)
    ).toBe(true);
    expect(commitmentAhead({ ...base, statement: 'finish the deck' }, NOW.getTime(), ZONE)).toBe(
      false
    );
    // No usable createdAt: read the dates it states, and never throw.
    const undated = { ...base, createdAt: Number.NaN };
    expect(commitmentAhead({ ...undated, statement: 'start running again' }, NOW.getTime())).toBe(
      false
    );
    expect(commitmentAhead({ ...undated, statement: 'move on 2026-10-30' }, NOW.getTime())).toBe(
      true
    );
  });

  it('a pondered ask still ahead, or any thread on a same-day return, is not opened on', () => {
    const later = openingRestraint({ calls: 3, daysSince: 4 }, ZONE, NOW.getTime());
    expect(later.allows('How is the move on 2026-10-30 shaping up?')).toBe(false);
    expect(later.allows('How did the move go?')).toBe(true);
    const sameDay = openingRestraint({ calls: 3, daysSince: 0 }, ZONE, NOW.getTime());
    expect(sameDay.allows('How did the move go?')).toBe(false);
    expect(sameDay.allows(undefined)).toBe(true);
  });
});
