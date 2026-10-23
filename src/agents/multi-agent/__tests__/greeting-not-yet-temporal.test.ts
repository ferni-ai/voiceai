/**
 * TEMPORAL_RESOLVER wiring in the hello's not-yet check (#2452). With the flag
 * on, a commitment's statement and the last call's topic are read by the
 * deterministic resolver; with it off nothing changes. Runs the #2335
 * verifier's N1-N8 and every #2335 adversarial case with the flag on.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { warmTemporalParser } from '../../../understanding/temporal/resolve-time.js';
import { zonedWallTimeToUtc } from '../../../utils/time-zone.js';
import { commitmentAhead, openingRestraint } from '../greeting-not-yet.js';

const DAY = 86_400_000;
const NY = 'America/New_York';
const ON = { TEMPORAL_RESOLVER: 'on' };
const OFF = { TEMPORAL_RESOLVER: 'off' };
const RESTRAINT_ON = { RECENT_CALL_RESTRAINT: undefined, TEMPORAL_RESOLVER: 'on' };
/** An instant from a New York wall clock, DST included. */
const ny = (ymd: string, hour: number, minute = 0): number => {
  const [year, month, day] = ymd.split('-').map(Number);
  return zonedWallTimeToUtc({ year, month, day, hour, minute }, NY).getTime();
};
// Wed 2026-10-21 09:00 New York
const WED_NY_9AM = ny('2026-10-21', 9);

beforeAll(async () => {
  expect(await warmTemporalParser()).toBe(true);
});

type Check = [label: string, at: number, ahead: boolean];
const N_CASES: Array<[name: string, statement: string, said: number, checks: Check[]]> = [
  [
    'N1 "on Friday" said Fri 7pm',
    'dinner with Jo on Friday',
    ny('2026-10-23', 19),
    [
      ['Sat next morning', ny('2026-10-24', 9), true],
      ['Fri 10-30, the day', ny('2026-10-30', 9), true],
      ['Sat 10-31', ny('2026-10-31', 9), false],
    ],
  ],
  [
    'N2 "Monday morning" said Mon 7am',
    'dentist Monday morning',
    ny('2026-10-19', 7),
    [
      ['Mon 8am same day', ny('2026-10-19', 8), true],
      ['Tue, read as next Monday', ny('2026-10-20', 9), true],
      ['Tue 10-27', ny('2026-10-27', 9), false],
    ],
  ],
  [
    'N3 "tonight" said 11pm',
    'big date tonight',
    ny('2026-10-21', 23),
    [
      ['11:30pm same night', ny('2026-10-21', 23, 30), true],
      ['next morning', ny('2026-10-22', 9), false],
    ],
  ],
  [
    'N4 "next weekend" said Sat',
    'camping next weekend',
    ny('2026-10-24', 12),
    [
      ['Sun 10-25', ny('2026-10-25', 9), true],
      ['Sat 10-31', ny('2026-10-31', 9), true],
      ['Sun 11-01, last day', ny('2026-11-01', 9), true],
      ['Mon 11-02', ny('2026-11-02', 9), false],
    ],
  ],
  [
    'N5 "for 3 days" from tomorrow',
    'conference for 3 days starting tomorrow',
    ny('2026-10-22', 10),
    [
      ['Sat, day 2', ny('2026-10-24', 9), true],
      ['Sun, day 3', ny('2026-10-25', 9), true],
      ['Mon, over', ny('2026-10-26', 9), false],
    ],
  ],
  [
    'N6 "on the 30th"',
    'job interview on the 30th',
    ny('2026-10-22', 10),
    [
      ['Fri 10-23, before', ny('2026-10-23', 9), true],
      ['Sat 10-31, after', ny('2026-10-31', 9), false],
    ],
  ],
  [
    'N7 "in two weeks"',
    'surgery in two weeks',
    ny('2026-10-22', 10),
    [
      ['Thu 10-29, one week in', ny('2026-10-29', 9), true],
      ['Fri 11-06, after', ny('2026-11-06', 9), false],
    ],
  ],
  [
    'N8 "last Monday"',
    'had my interview last Monday',
    ny('2026-10-22', 10),
    [
      ['same day', ny('2026-10-22', 11), false],
      ['Fri', ny('2026-10-23', 9), false],
    ],
  ],
];

describe('TEMPORAL_RESOLVER on: verifier N1-N8', () => {
  for (const [name, statement, said, checks] of N_CASES) {
    it.each(checks)(`${name} @ %s`, (_label, at, ahead) => {
      expect(commitmentAhead({ statement, createdAt: said }, at, NY, ON)).toBe(ahead);
    });
  }
  it('N6 with an extractor targetDate still works', () => {
    const c = {
      statement: 'job interview on the 30th',
      createdAt: ny('2026-10-22', 10),
      targetDate: Date.parse('2026-10-30T00:00:00Z'),
    };
    expect(commitmentAhead(c, ny('2026-10-23', 9), NY, ON)).toBe(true);
    expect(commitmentAhead(c, ny('2026-10-31', 9), NY, ON)).toBe(false);
  });
  it('N7 as the last topic, with no date written, is kept out of the hello', () => {
    const r = openingRestraint(
      { calls: 3, daysSince: 1, lastTopic: 'surgery in two weeks' },
      NY,
      ny('2026-10-23', 9),
      RESTRAINT_ON
    );
    expect(r.history?.lastTopic).toBeUndefined();
  });
  it('N6 as the last topic is kept out until it has happened, then allowed', () => {
    const h = { calls: 3, daysSince: 1, lastTopic: 'job interview on the 30th' };
    expect(
      openingRestraint(h, NY, ny('2026-10-23', 9), RESTRAINT_ON).history?.lastTopic
    ).toBeUndefined();
    const after = { ...h, daysSince: 9 };
    expect(openingRestraint(after, NY, ny('2026-10-31', 9), RESTRAINT_ON).history?.lastTopic).toBe(
      h.lastTopic
    );
  });
});

describe('TEMPORAL_RESOLVER off: unchanged (#2452 still open there)', () => {
  it('N6 and N7 read as not ahead, as on main', () => {
    const said = ny('2026-10-22', 10);
    expect(
      commitmentAhead(
        { statement: 'job interview on the 30th', createdAt: said },
        ny('2026-10-23', 9),
        NY,
        OFF
      )
    ).toBe(false);
    expect(
      commitmentAhead(
        { statement: 'surgery in two weeks', createdAt: said },
        ny('2026-10-29', 9),
        NY,
        OFF
      )
    ).toBe(false);
    expect(
      commitmentAhead(
        { statement: 'surgery in two weeks', createdAt: said },
        ny('2026-10-29', 9),
        NY
      )
    ).toBe(false);
    const r = openingRestraint(
      { calls: 3, daysSince: 1, lastTopic: 'surgery in two weeks' },
      NY,
      ny('2026-10-23', 9),
      {}
    );
    expect(r.history?.lastTopic).toBe('surgery in two weeks');
  });
});

describe('TEMPORAL_RESOLVER on: #2335 adversarial cases', () => {
  const ahead = (statement: string, createdAt: number, now = WED_NY_9AM, tz = NY): boolean =>
    commitmentAhead({ statement, createdAt }, now, tz, ON);
  it('A1 future weekday said earlier today is ahead', () => {
    expect(ahead('go to my Stripe interview on Monday', WED_NY_9AM - 3600_000)).toBe(true);
  });
  it('A2 past-due weekday is not ahead, and a past topic is kept', () => {
    expect(ahead('go to my Stripe interview on Monday', WED_NY_9AM - 7 * DAY)).toBe(false);
    const h = { calls: 3, daysSince: 7, lastTopic: 'interview at Stripe on Monday 2026-10-19' };
    expect(openingRestraint(h, NY, WED_NY_9AM, RESTRAINT_ON).history?.lastTopic).toContain(
      'Stripe'
    );
  });
  it('A3a/A3b due today, as a time or as a date, is ahead', () => {
    const base = { statement: 'nail the interview', createdAt: WED_NY_9AM - 2 * DAY };
    expect(
      commitmentAhead({ ...base, targetDate: WED_NY_9AM + 6 * 3600_000 }, WED_NY_9AM, NY, ON)
    ).toBe(true);
    expect(
      commitmentAhead(
        { ...base, targetDate: Date.parse('2026-10-21T00:00:00Z') },
        WED_NY_9AM,
        NY,
        ON
      )
    ).toBe(true);
  });
  it('A3c "tomorrow" said yesterday is today: ahead, and the topic is held', () => {
    expect(ahead('interview tomorrow', WED_NY_9AM - DAY)).toBe(true);
    const h = { calls: 3, daysSince: 1, lastTopic: 'has the interview tomorrow' };
    expect(openingRestraint(h, NY, WED_NY_9AM, RESTRAINT_ON).history?.lastTopic).toBeUndefined();
  });
  it('A4 "tonight" said Wed 10am PT, now Wed 8pm PT (Thu UTC)', () => {
    const LA = 'America/Los_Angeles';
    expect(
      ahead(
        'my show tonight',
        Date.parse('2026-10-21T17:00:00Z'),
        Date.parse('2026-10-22T03:00:00Z'),
        LA
      )
    ).toBe(true);
  });
  it('A4b Tokyo: Monday said Sun 23:30 JST, now Mon 08:00 JST', () => {
    expect(
      ahead(
        'interview Monday',
        Date.parse('2026-10-25T14:30:00Z'),
        Date.parse('2026-10-25T23:00:00Z'),
        'Asia/Tokyo'
      )
    ).toBe(true);
  });
  it('A5 no due date and no day words: not ahead', () => {
    expect(ahead('call my mom', WED_NY_9AM - 2 * DAY)).toBe(false);
  });
  it('A6/A6b a trip next week is ahead on the Monday and mid-trip', () => {
    expect(ahead('my trip to Lisbon next week', WED_NY_9AM, WED_NY_9AM + 5 * DAY)).toBe(true);
    expect(ahead('my trip to Lisbon next week', WED_NY_9AM, WED_NY_9AM + 8 * DAY)).toBe(true);
  });
  it('A7 "last Monday" is behind them', () => {
    expect(ahead('rough day last Monday', WED_NY_9AM)).toBe(false);
  });
  it('A8 weekday said on that weekday, two days later', () => {
    expect(ahead('interview on Monday', ny('2026-10-19', 10))).toBe(true);
  });
  it('A9 every weekday from every said-on day: ahead that day, behind a week on (8 days for the same weekday)', () => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < 7; i++) {
      const saidOn = `2026-10-${18 + i}`;
      const said = ny(saidOn, 10);
      for (const [d, name] of days.entries()) {
        const later = (n: number): number => ny(`2026-10-${18 + i}`, 9) + n * DAY + 3600_000 * 2;
        expect(ahead(`thing on ${name}`, said, said)).toBe(true);
        expect(ahead(`thing on ${name}`, said, later(d === i ? 8 : 7))).toBe(false);
        if (d === i) expect(ahead(`thing on ${name}`, said, later(7))).toBe(true);
      }
    }
  });
  it('A10 UTC extremes and an unknown zone', () => {
    const t = Date.parse('2026-10-21T11:00:00Z');
    // "tonight" in Kiritimati (already the 22nd) is still ahead at this instant; in Pago Pago it is the 21st's.
    expect(ahead('party tonight', t, t, 'Pacific/Kiritimati')).toBe(true);
    expect(ahead('party tonight', t, t + 23 * 3600_000, 'Pacific/Kiritimati')).toBe(false);
    expect(ahead('party tonight', t, t + 23 * 3600_000, 'Pacific/Pago_Pago')).toBe(true);
    expect(ahead('party tomorrow', t, t + DAY, 'Not/AZone')).toBe(true);
  });
  it('A11 same-day return: held with the flag on, as before', () => {
    const h = { calls: 4, daysSince: 0, lastTopic: 'the interview went great 2026-10-19' };
    const on = openingRestraint(h, NY, WED_NY_9AM, RESTRAINT_ON);
    expect([on.sameDay, on.history?.lastTopic, on.allows('anything')]).toEqual([
      true,
      undefined,
      false,
    ]);
    const off = openingRestraint(h, NY, WED_NY_9AM, {
      RECENT_CALL_RESTRAINT: 'off',
      TEMPORAL_RESOLVER: 'on',
    });
    expect(off.history?.lastTopic).toContain('interview');
  });
  it('A12 a topic with a past and a future date is held', () => {
    const h = { calls: 4, daysSince: 2, lastTopic: 'first round 2026-10-19, final on 2026-10-26' };
    expect(openingRestraint(h, NY, WED_NY_9AM, RESTRAINT_ON).history?.lastTopic).toBeUndefined();
  });
});

describe('TEMPORAL_RESOLVER on: #2482 round 1 (modifiers and tense)', () => {
  const ahead = (statement: string, createdAt: number, now: number): boolean =>
    commitmentAhead({ statement, createdAt }, now, NY, ON);
  it('"a week from Thursday" said Mon 10-19 is still ahead on Sun 10-25', () => {
    expect(ahead('dentist a week from Thursday', ny('2026-10-19', 10), ny('2026-10-25', 9))).toBe(
      true
    );
    expect(ahead('dentist a week from Thursday', ny('2026-10-19', 10), ny('2026-10-30', 9))).toBe(
      false
    );
  });
  it('"after the weekend" said Thu 10-22 is still ahead on Mon 10-26 11:00', () => {
    expect(
      ahead('call the bank after the weekend', ny('2026-10-22', 10), ny('2026-10-26', 11))
    ).toBe(true);
  });
  it('"I saw her on the 9th" is behind them: the commitment and the topic are not ahead', () => {
    const said = ny('2026-10-22', 10);
    const fri = ny('2026-10-23', 9);
    expect(ahead('I saw her on the 9th', said, fri)).toBe(false);
    const h = { calls: 3, daysSince: 1, lastTopic: 'I saw her on the 9th' };
    expect(openingRestraint(h, NY, fri, RESTRAINT_ON).history?.lastTopic).toBe(h.lastTopic);
    // A plan for the 9th, in the same words otherwise, is still ahead.
    expect(ahead("I'm seeing her on the 9th", said, fri)).toBe(true);
  });
});
