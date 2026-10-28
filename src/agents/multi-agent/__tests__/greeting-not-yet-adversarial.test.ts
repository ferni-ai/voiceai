import { describe, expect, it } from 'vitest';
import { commitmentAhead, localYmd, namesDayAhead, openingRestraint } from '../greeting-not-yet.js';

const DAY = 86_400_000;
const ON = { RECENT_CALL_RESTRAINT: undefined };
const OFF = { RECENT_CALL_RESTRAINT: 'off' };
// Wed 2026-10-21 09:00 in New York (13:00Z)
const WED_NY_9AM = Date.parse('2026-10-21T13:00:00Z');
const NY = 'America/New_York';
const weekday = (ymd: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(`${ymd}T12:00:00Z`))
    .toLowerCase();

/**
 * The verifier's adversarial cases for #2335 (2026-10-22), kept as tests. A9's
 * same-weekday cell was adjusted to A8's rule: "on Monday" said on a Monday is
 * next Monday, so it is behind on day 8, not day 7.
 */
describe('ADV #2335', () => {
  it('A1 future weekday said earlier today is ahead (Stripe Monday, said Wed)', () => {
    const c = {
      statement: 'go to my Stripe interview on Monday',
      createdAt: WED_NY_9AM - 3600_000,
    };
    expect(commitmentAhead(c, WED_NY_9AM, NY)).toBe(true);
  });
  it('A2 past-due weekday (said last Wed about Monday) is NOT ahead -> may be asked as past', () => {
    const c = { statement: 'go to my Stripe interview on Monday', createdAt: WED_NY_9AM - 7 * DAY };
    expect(commitmentAhead(c, WED_NY_9AM, NY)).toBe(false);
    const r = openingRestraint(
      { calls: 3, daysSince: 7, lastTopic: 'interview at Stripe on Monday 2026-10-19' },
      NY,
      WED_NY_9AM,
      ON
    );
    expect(r.history?.lastTopic).toContain('Stripe');
  });
  it('A3a due date today (targetDate later today) is ahead', () => {
    const c = {
      statement: 'nail the interview',
      createdAt: WED_NY_9AM - 2 * DAY,
      targetDate: WED_NY_9AM + 6 * 3600_000,
    };
    expect(commitmentAhead(c, WED_NY_9AM, NY)).toBe(true);
  });
  it('A3b due date today stored as a date (midnight UTC of today) is still not past at 9am', () => {
    const c = {
      statement: 'nail the interview',
      createdAt: WED_NY_9AM - 2 * DAY,
      targetDate: Date.parse('2026-10-21T00:00:00Z'),
    };
    expect(commitmentAhead(c, WED_NY_9AM, NY)).toBe(true);
  });
  it('A3c "tomorrow" said yesterday = today: ahead (skipped)', () => {
    const c = { statement: 'interview tomorrow', createdAt: WED_NY_9AM - DAY };
    expect(commitmentAhead(c, WED_NY_9AM, NY)).toBe(true);
    const r = openingRestraint(
      { calls: 3, daysSince: 1, lastTopic: 'has the interview tomorrow' },
      NY,
      WED_NY_9AM,
      ON
    );
    expect(r.history?.lastTopic).toBeUndefined();
  });
  it('A4 caller zone differs from UTC: "tonight" said Wed 10am PT, now Wed 8pm PT (Thu UTC)', () => {
    const now = Date.parse('2026-10-22T03:00:00Z');
    const c = { statement: 'my show tonight', createdAt: Date.parse('2026-10-21T17:00:00Z') };
    expect(localYmd(now, 'America/Los_Angeles')).toBe('2026-10-21');
    expect(localYmd(now)).toBe('2026-10-22');
    expect(commitmentAhead(c, now, 'America/Los_Angeles')).toBe(true);
  });
  it('A4b Tokyo: Monday said Sun 23:30 JST (Sun 14:30Z) is next day Monday; now Mon 08:00 JST (Sun 23:00Z) ahead', () => {
    const said = Date.parse('2026-10-25T14:30:00Z'); // Sun 23:30 JST
    const now = Date.parse('2026-10-25T23:00:00Z'); // Mon 08:00 JST, still Sunday UTC
    expect(localYmd(now, 'Asia/Tokyo')).toBe('2026-10-26');
    expect(
      commitmentAhead({ statement: 'interview Monday', createdAt: said }, now, 'Asia/Tokyo')
    ).toBe(true);
  });
  it('A5 no due date and no day words: not ahead (asked as before)', () => {
    expect(
      commitmentAhead({ statement: 'call my mom', createdAt: WED_NY_9AM - 2 * DAY }, WED_NY_9AM, NY)
    ).toBe(false);
  });
  it('A6 multi-day "trip next week": ahead on the Monday after', () => {
    const c = { statement: 'my trip to Lisbon next week', createdAt: WED_NY_9AM };
    expect(commitmentAhead(c, WED_NY_9AM + 5 * DAY, NY)).toBe(true);
  });
  it('A6b multi-day trip mid-trip (next Thursday) is NOT framed as done', () => {
    const c = { statement: 'my trip to Lisbon next week', createdAt: WED_NY_9AM };
    expect(commitmentAhead(c, WED_NY_9AM + 8 * DAY, NY)).toBe(true);
  });
  it('A7 "last Monday" is behind them', () => {
    expect(namesDayAhead('rough day last Monday', '2026-10-21', '2026-10-21')).toBe(false);
  });
  it('A8 weekday said on the same weekday ("interview on Monday", said Monday) two days later', () => {
    const said = Date.parse('2026-10-19T14:00:00Z'); // Mon 10am NY
    expect(
      commitmentAhead({ statement: 'interview on Monday', createdAt: said }, WED_NY_9AM, NY)
    ).toBe(true);
  });
  it('A9 weekday math: every named day from every said-on day lands on that weekday, within 0..6 days', () => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < 7; i++) {
      const saidOn = `2026-10-${String(18 + i).padStart(2, '0')}`;
      for (const d of days) {
        // ahead today == saidOn for every weekday; and not ahead 7 days later
        expect(namesDayAhead(`thing on ${d}`, saidOn, saidOn)).toBe(true);
        // Said on that very weekday it means next week's (A8): that day is still
        // ahead 7 days on (it's today) and behind only on day 8.
        const same = weekday(saidOn) === d;
        const later = new Date(`${saidOn}T12:00:00Z`);
        later.setUTCDate(later.getUTCDate() + (same ? 8 : 7));
        expect(namesDayAhead(`thing on ${d}`, later.toISOString().slice(0, 10), saidOn)).toBe(
          false
        );
      }
    }
    expect(weekday('2026-10-21')).toBe('wednesday');
    expect(weekday('2026-10-26')).toBe('monday');
  });
  it('A10 UTC boundary extremes: Kiritimati (+14) and Pago Pago (-11) same instant', () => {
    const t = Date.parse('2026-10-21T11:00:00Z');
    expect(localYmd(t, 'Pacific/Kiritimati')).toBe('2026-10-22');
    expect(localYmd(t, 'Pacific/Pago_Pago')).toBe('2026-10-21');
    expect(localYmd(t, 'Not/AZone')).toBe('2026-10-21');
  });
  it('A11 same-day return: everything held, flag off restores', () => {
    const h = { calls: 4, daysSince: 0, lastTopic: 'the interview went great 2026-10-19' };
    const on = openingRestraint(h, NY, WED_NY_9AM, ON);
    expect(on.sameDay).toBe(true);
    expect(on.history?.lastTopic).toBeUndefined();
    expect(on.allows('anything')).toBe(false);
    const off = openingRestraint(h, NY, WED_NY_9AM, OFF);
    expect(off.sameDay).toBe(false);
    expect(off.history?.lastTopic).toContain('interview');
  });
  it('A12 mixed past+future ISO dates: dropped (a future date is present)', () => {
    const r = openingRestraint(
      { calls: 4, daysSince: 2, lastTopic: 'first round 2026-10-19, final on 2026-10-26' },
      NY,
      WED_NY_9AM,
      ON
    );
    expect(r.history?.lastTopic).toBeUndefined();
  });
});
