/**
 * Frozen-clock suite for the temporal resolver. Every case passes the moment
 * of speaking and the caller's zone explicitly; the system clock is pinned to
 * 2031 to prove nothing reads it. Expected times are caller-local wall clocks.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eventState } from '../event-state.js';
import type { Certainty, Precision, Tense } from '../civil.js';
import { type ResolvedTime, resolveTime, warmTemporalParser } from '../resolve-time.js';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const TOKYO = 'Asia/Tokyo';
const KIRITIMATI = 'Pacific/Kiritimati';
const PAGO = 'Pacific/Pago_Pago';
// Thu 2026-10-22 10:00 EDT
const THU = '2026-10-22T10:00:00-04:00';

const local = (ms: number, tz: string): string =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));

/** resolveTime that fails the test instead of returning null. */
function must(phrase: string, said: number, tz?: string, tense?: Tense): ResolvedTime {
  const r = resolveTime(phrase, said, tz, { tense });
  if (!r) throw new Error(`no time resolved for "${phrase}"`);
  return r;
}

type Row = [
  name: string,
  phrase: string,
  said: string,
  tz: string,
  start: string,
  end: string,
  precision: Precision,
  certainty: Certainty,
  tense?: Tense,
];

function check([, phrase, said, tz, start, end, precision, certainty, tense]: Row): void {
  const r = must(phrase, Date.parse(said), tz, tense);
  const zone = tz === 'Not/AZone' ? 'UTC' : tz;
  expect({
    start: local(r.start, zone),
    end: local(r.endExclusive, zone),
    precision: r.precision,
    certainty: r.certainty,
  }).toEqual({ start, end, precision, certainty });
}

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
  expect(await warmTemporalParser()).toBe(true);
});
afterAll(() => vi.useRealTimers());

const D = '00:00';
const day = (ymd: string, next: string): [string, string] => [`${ymd} ${D}`, `${next} ${D}`];

describe('resolveTime: dates said on Thu 2026-10-22 10:00 New York', () => {
  const rows: Row[] = [
    [
      'ordinal with on',
      'job interview on the 30th',
      THU,
      NY,
      ...day('2026-10-30', '2026-10-31'),
      'day',
      'exact',
    ],
    ['bare ordinal', 'the 30th', THU, NY, ...day('2026-10-30', '2026-10-31'), 'day', 'exact'],
    [
      'ordinal already passed this month',
      'the 5th',
      THU,
      NY,
      ...day('2026-11-05', '2026-11-06'),
      'day',
      'exact',
    ],
    [
      'ordinal that is today',
      'on the 22nd',
      THU,
      NY,
      ...day('2026-10-22', '2026-10-23'),
      'day',
      'exact',
    ],
    [
      'ordinal yesterday rolls on',
      'the 21st',
      THU,
      NY,
      ...day('2026-11-21', '2026-11-22'),
      'day',
      'exact',
    ],
    [
      'in two weeks',
      'surgery in two weeks',
      THU,
      NY,
      ...day('2026-11-05', '2026-11-06'),
      'day',
      'exact',
    ],
    [
      'couple of weeks is assumed',
      'in a couple of weeks',
      THU,
      NY,
      ...day('2026-11-05', '2026-11-06'),
      'day',
      'assumed',
    ],
    ['in 3 days', 'in 3 days', THU, NY, ...day('2026-10-25', '2026-10-26'), 'day', 'exact'],
    ['tomorrow', 'tomorrow', THU, NY, ...day('2026-10-23', '2026-10-24'), 'day', 'exact'],
    [
      'day after tomorrow',
      'the day after tomorrow',
      THU,
      NY,
      ...day('2026-10-24', '2026-10-25'),
      'day',
      'exact',
    ],
    ['yesterday', 'yesterday', THU, NY, ...day('2026-10-21', '2026-10-22'), 'day', 'exact'],
    [
      'tonight is the evening',
      'tonight',
      THU,
      NY,
      '2026-10-22 17:00',
      '2026-10-23 00:00',
      'part_of_day',
      'exact',
    ],
    [
      'this morning',
      'this morning',
      THU,
      NY,
      '2026-10-22 06:00',
      '2026-10-22 12:00',
      'part_of_day',
      'exact',
    ],
    [
      'clock time',
      'tomorrow at 3pm',
      THU,
      NY,
      '2026-10-23 15:00',
      '2026-10-23 16:00',
      'hour',
      'exact',
    ],
    [
      'clock with minutes',
      'Friday at 10:30 a.m.',
      THU,
      NY,
      '2026-10-23 10:30',
      '2026-10-23 11:30',
      'hour',
      'exact',
    ],
    [
      'noon',
      'lunch at noon tomorrow',
      THU,
      NY,
      '2026-10-23 12:00',
      '2026-10-23 13:00',
      'hour',
      'exact',
    ],
    [
      'coming weekday',
      'dinner on Friday',
      THU,
      NY,
      ...day('2026-10-23', '2026-10-24'),
      'day',
      'exact',
    ],
    [
      'same weekday = next week (A8)',
      'interview Thursday',
      THU,
      NY,
      ...day('2026-10-29', '2026-10-30'),
      'day',
      'assumed',
    ],
    [
      'same weekday + later = today',
      'interview Thursday later on',
      THU,
      NY,
      ...day('2026-10-22', '2026-10-23'),
      'day',
      'exact',
    ],
    [
      'next Friday in-week is ambiguous',
      'next Friday',
      THU,
      NY,
      ...day('2026-10-30', '2026-10-31'),
      'day',
      'ambiguous',
    ],
    ['next Monday', 'next Monday', THU, NY, ...day('2026-10-26', '2026-10-27'), 'day', 'exact'],
    ['this Friday', 'this Friday', THU, NY, ...day('2026-10-23', '2026-10-24'), 'day', 'exact'],
    [
      'last Monday is this week',
      'last Monday',
      THU,
      NY,
      ...day('2026-10-19', '2026-10-20'),
      'day',
      'exact',
    ],
    [
      'this past Tuesday',
      'this past Tuesday',
      THU,
      NY,
      ...day('2026-10-20', '2026-10-21'),
      'day',
      'exact',
    ],
    [
      'past tense weekday',
      'I went on Monday',
      THU,
      NY,
      ...day('2026-10-19', '2026-10-20'),
      'day',
      'exact',
      'past',
    ],
    [
      'past tense same weekday',
      'it was on Thursday',
      THU,
      NY,
      ...day('2026-10-15', '2026-10-16'),
      'day',
      'ambiguous',
      'past',
    ],
    ['this weekend', 'this weekend', THU, NY, ...day('2026-10-24', '2026-10-26'), 'span', 'exact'],
    [
      'next weekend mid-week is ambiguous',
      'next weekend',
      THU,
      NY,
      ...day('2026-10-31', '2026-11-02'),
      'span',
      'ambiguous',
    ],
    ['last weekend', 'last weekend', THU, NY, ...day('2026-10-17', '2026-10-19'), 'span', 'exact'],
    [
      'next week',
      'my trip to Lisbon next week',
      THU,
      NY,
      ...day('2026-10-26', '2026-11-02'),
      'week',
      'exact',
    ],
    ['this week', 'this week', THU, NY, ...day('2026-10-19', '2026-10-26'), 'week', 'exact'],
    ['last week', 'last week', THU, NY, ...day('2026-10-12', '2026-10-19'), 'week', 'exact'],
    [
      'week of an ordinal',
      'the week of the 10th',
      THU,
      NY,
      ...day('2026-11-09', '2026-11-16'),
      'week',
      'exact',
    ],
    [
      'week of an ISO date',
      'the week of 2026-11-18',
      THU,
      NY,
      ...day('2026-11-16', '2026-11-23'),
      'week',
      'exact',
    ],
    [
      'duration with no start',
      'for 3 days',
      THU,
      NY,
      ...day('2026-10-22', '2026-10-25'),
      'span',
      'assumed',
    ],
    [
      'duration from tomorrow (N5)',
      'conference for 3 days starting tomorrow',
      THU,
      NY,
      ...day('2026-10-23', '2026-10-26'),
      'span',
      'exact',
    ],
    [
      'duration in weeks',
      'away for two weeks from Monday',
      THU,
      NY,
      ...day('2026-10-26', '2026-11-09'),
      'span',
      'exact',
    ],
    [
      'a few days',
      'off for a few days next week',
      THU,
      NY,
      ...day('2026-10-26', '2026-10-29'),
      'span',
      'assumed',
    ],
    ['ISO date', 'on 2026-10-30', THU, NY, ...day('2026-10-30', '2026-10-31'), 'day', 'exact'],
    ['month and day', 'October 30th', THU, NY, ...day('2026-10-30', '2026-10-31'), 'day', 'exact'],
    [
      'holiday, vague',
      'around Thanksgiving',
      THU,
      NY,
      ...day('2026-11-26', '2026-11-27'),
      'day',
      'assumed',
    ],
    ['next month', 'next month', THU, NY, ...day('2026-11-01', '2026-12-01'), 'span', 'exact'],
    ['in an hour', 'in an hour', THU, NY, '2026-10-22 11:00', '2026-10-22 12:00', 'hour', 'exact'],
  ];
  it.each(rows)('%s: "%s"', (...row) => check(row as Row));

  it('no time named: null', () => {
    expect(resolveTime('call my mom', Date.parse(THU), NY)).toBeNull();
    expect(resolveTime('', Date.parse(THU), NY)).toBeNull();
    expect(resolveTime('tomorrow', Number.NaN, NY)).toBeNull();
  });
  it('canonical keeps the rule and its inputs', () => {
    const at = Date.parse(THU);
    expect(resolveTime('the 30th', at, NY)?.canonical).toBe('day_of_month=30;dir=next');
    expect(resolveTime('interview Thursday', at, NY)?.canonical).toBe(
      'weekday=thursday;dir=next;same_day=+7d'
    );
    expect(resolveTime('for 3 days starting tomorrow', at, NY)?.canonical).toBe(
      'relative_day=1;span=P3D'
    );
  });
});

describe("resolveTime: the verifier's N1-N8 (New York)", () => {
  const rows: Row[] = [
    [
      'N1 Friday said Fri 7pm',
      'dinner with Jo on Friday',
      '2026-10-23T19:00:00-04:00',
      NY,
      ...day('2026-10-30', '2026-10-31'),
      'day',
      'assumed',
    ],
    [
      'N2 Monday morning said Mon 7am',
      'dentist Monday morning',
      '2026-10-19T07:00:00-04:00',
      NY,
      '2026-10-26 06:00',
      '2026-10-26 12:00',
      'part_of_day',
      'assumed',
    ],
    [
      'N3 tonight said 11pm',
      'big date tonight',
      '2026-10-21T23:00:00-04:00',
      NY,
      '2026-10-21 17:00',
      '2026-10-22 00:00',
      'part_of_day',
      'exact',
    ],
    [
      'N4 next weekend said Sat',
      'camping next weekend',
      '2026-10-24T12:00:00-04:00',
      NY,
      ...day('2026-10-31', '2026-11-02'),
      'span',
      'exact',
    ],
    [
      'N5 for 3 days from tomorrow',
      'conference for 3 days starting tomorrow',
      THU,
      NY,
      ...day('2026-10-23', '2026-10-26'),
      'span',
      'exact',
    ],
    [
      'N6 on the 30th',
      'job interview on the 30th',
      THU,
      NY,
      ...day('2026-10-30', '2026-10-31'),
      'day',
      'exact',
    ],
    [
      'N7 in two weeks',
      'surgery in two weeks',
      THU,
      NY,
      ...day('2026-11-05', '2026-11-06'),
      'day',
      'exact',
    ],
    [
      'N8 last Monday',
      'had my interview last Monday',
      THU,
      NY,
      ...day('2026-10-19', '2026-10-20'),
      'day',
      'exact',
    ],
  ];
  it.each(rows)('%s', (...row) => check(row as Row));

  it('N3 tonight at 11pm: under way at 11:30pm, over by the next morning', () => {
    const r = must('big date tonight', Date.parse('2026-10-21T23:00:00-04:00'), NY);
    expect(eventState(r, Date.parse('2026-10-21T23:30:00-04:00'), NY)).toBe('ongoing');
    expect(eventState(r, Date.parse('2026-10-22T09:00:00-04:00'), NY)).toBe('past');
  });
});

describe('resolveTime: time zones', () => {
  // Wed 2026-10-21 20:00 in Los Angeles is already Thursday in UTC.
  const LA_8PM = '2026-10-22T03:00:00Z';
  const rows: Row[] = [
    [
      'LA 8pm tonight is Wednesday',
      'my show tonight',
      LA_8PM,
      LA,
      '2026-10-21 17:00',
      '2026-10-22 00:00',
      'part_of_day',
      'exact',
    ],
    [
      'LA 8pm tomorrow is Thursday',
      'tomorrow',
      LA_8PM,
      LA,
      ...day('2026-10-22', '2026-10-23'),
      'day',
      'exact',
    ],
    [
      'LA 8pm the 22nd is tomorrow',
      'on the 22nd',
      LA_8PM,
      LA,
      ...day('2026-10-22', '2026-10-23'),
      'day',
      'exact',
    ],
    [
      'Tokyo Sun 23:30 Monday is tomorrow',
      'interview Monday',
      '2026-10-25T14:30:00Z',
      TOKYO,
      ...day('2026-10-26', '2026-10-27'),
      'day',
      'exact',
    ],
    [
      'Kiritimati (+14) tomorrow',
      'tomorrow',
      '2026-10-21T11:00:00Z',
      KIRITIMATI,
      ...day('2026-10-23', '2026-10-24'),
      'day',
      'exact',
    ],
    [
      'Pago Pago (-11) same instant',
      'tomorrow',
      '2026-10-21T11:00:00Z',
      PAGO,
      ...day('2026-10-22', '2026-10-23'),
      'day',
      'exact',
    ],
    [
      'invalid zone falls back to UTC',
      'tomorrow',
      '2026-10-21T23:30:00Z',
      'Not/AZone',
      ...day('2026-10-22', '2026-10-23'),
      'day',
      'exact',
    ],
  ];
  it.each(rows)('%s', (...row) => check(row as Row));

  it('no zone is UTC, not the server clock', () => {
    const r = must('tomorrow', Date.parse('2026-10-21T23:30:00Z'));
    expect(new Date(r.start).toISOString()).toBe('2026-10-22T00:00:00.000Z');
  });
});

describe('resolveTime: month ends and year rollover', () => {
  const rows: Row[] = [
    [
      '31st said in November skips to December',
      'the 31st',
      '2026-11-10T10:00:00-05:00',
      NY,
      ...day('2026-12-31', '2027-01-01'),
      'day',
      'exact',
    ],
    [
      '31st said in September is October',
      'the 31st',
      '2026-09-05T10:00:00-04:00',
      NY,
      ...day('2026-10-31', '2026-11-01'),
      'day',
      'exact',
    ],
    [
      '30th said on the 31st',
      'on the 30th',
      '2026-10-31T10:00:00-04:00',
      NY,
      ...day('2026-11-30', '2026-12-01'),
      'day',
      'exact',
    ],
    [
      '30th said in February skips to March',
      'the 30th',
      '2027-02-10T10:00:00-05:00',
      NY,
      ...day('2027-03-30', '2027-03-31'),
      'day',
      'exact',
    ],
    [
      '29th in a non-leap February',
      'the 29th',
      '2027-02-05T10:00:00-05:00',
      NY,
      ...day('2027-03-29', '2027-03-30'),
      'day',
      'exact',
    ],
    [
      '31st in the past from November',
      'the 31st',
      '2026-11-10T10:00:00-05:00',
      NY,
      ...day('2026-10-31', '2026-11-01'),
      'day',
      'exact',
      'past',
    ],
    [
      'the 3rd said Dec 28',
      'on the 3rd',
      '2026-12-28T10:00:00-05:00',
      NY,
      ...day('2027-01-03', '2027-01-04'),
      'day',
      'exact',
    ],
    [
      'next week said Dec 28',
      'next week',
      '2026-12-28T10:00:00-05:00',
      NY,
      ...day('2027-01-04', '2027-01-11'),
      'week',
      'exact',
    ],
    [
      'tomorrow on New Year eve',
      'tomorrow',
      '2026-12-31T10:00:00-05:00',
      NY,
      ...day('2027-01-01', '2027-01-02'),
      'day',
      'exact',
    ],
    [
      'past 30th said Jan 5',
      'the 30th',
      '2027-01-05T10:00:00-05:00',
      NY,
      ...day('2026-12-30', '2026-12-31'),
      'day',
      'exact',
      'past',
    ],
  ];
  it.each(rows)('%s', (...row) => check(row as Row));
});

describe('resolveTime: DST end, America/New_York 2026-11-01', () => {
  const iso = (ms: number): string => new Date(ms).toISOString();
  it('"in two weeks" said 22:30 EDT lands on EST midnight of Nov 5', () => {
    const r = must('surgery in two weeks', Date.parse('2026-10-22T22:30:00-04:00'), NY);
    expect(iso(r.start)).toBe('2026-11-05T05:00:00.000Z');
    expect(iso(r.endExclusive)).toBe('2026-11-06T05:00:00.000Z');
  });
  it('"tomorrow" said Oct 31 is the 25-hour day', () => {
    const r = must('tomorrow', Date.parse('2026-10-31T10:00:00-04:00'), NY);
    expect(iso(r.start)).toBe('2026-11-01T04:00:00.000Z');
    expect(r.endExclusive - r.start).toBe(25 * 3_600_000);
  });
  it('"tonight" on Oct 31 ends at EDT midnight', () => {
    const r = must('tonight', Date.parse('2026-10-31T22:30:00-04:00'), NY);
    expect([iso(r.start), iso(r.endExclusive)]).toEqual([
      '2026-10-31T21:00:00.000Z',
      '2026-11-01T04:00:00.000Z',
    ]);
  });
  it('"next week" said Oct 29 starts at EST midnight Nov 2', () => {
    const r = must('next week', Date.parse('2026-10-29T10:00:00-04:00'), NY);
    expect(iso(r.start)).toBe('2026-11-02T05:00:00.000Z');
    expect(r.endExclusive - r.start).toBe(7 * 86_400_000);
  });
  it('"Sunday at 3pm" said Friday is 3pm EST', () => {
    const r = must('Sunday at 3pm', Date.parse('2026-10-30T10:00:00-04:00'), NY);
    expect(iso(r.start)).toBe('2026-11-01T20:00:00.000Z');
  });
});

describe('eventState', () => {
  const thirtieth = (): ResolvedTime => must('the 30th', Date.parse(THU), NY);
  const ny = (s: string): number => Date.parse(`${s}-04:00`);
  it('upcoming before the start, ongoing during, past at the end', () => {
    expect(eventState(thirtieth(), ny('2026-10-29T23:59:00'), NY)).toBe('upcoming');
    expect(eventState(thirtieth(), ny('2026-10-30T00:00:00'), NY)).toBe('ongoing');
    expect(eventState(thirtieth(), ny('2026-10-30T23:59:00'), NY)).toBe('ongoing');
    expect(eventState(thirtieth(), ny('2026-10-31T00:00:00'), NY)).toBe('past');
  });
  it('a clock-time event has two hours of grace by default', () => {
    const h = must('tomorrow at 3pm', Date.parse(THU), NY);
    expect(eventState(h, ny('2026-10-23T17:30:00'), NY)).toBe('ongoing');
    expect(eventState(h, ny('2026-10-23T18:00:00'), NY)).toBe('past');
  });
  it('an explicit grace in ms', () => {
    expect(eventState(thirtieth(), ny('2026-10-31T00:30:00'), NY, 3_600_000)).toBe('ongoing');
    expect(eventState(thirtieth(), ny('2026-10-31T01:00:00'), NY, 3_600_000)).toBe('past');
  });
  it('next-morning grace: past from 09:00 local the day after', () => {
    expect(eventState(thirtieth(), ny('2026-10-31T08:59:00'), NY, 'next-morning')).toBe('ongoing');
    expect(eventState(thirtieth(), ny('2026-10-31T09:00:00'), NY, 'next-morning')).toBe('past');
  });
  it('next-morning grace across DST is 09:00 EST', () => {
    const sat = must('on the 31st', Date.parse(THU), NY);
    expect(eventState(sat, Date.parse('2026-11-01T13:59:00Z'), NY, 'next-morning')).toBe('ongoing');
    expect(eventState(sat, Date.parse('2026-11-01T14:00:00Z'), NY, 'next-morning')).toBe('past');
  });
});
