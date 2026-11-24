/**
 * #2499, frozen clock: compromise read "the week after next" and "the week
 * before Thanksgiving" as one exact day. They name a week, assumed. A day
 * compromise reads beside a week or month modifier is never exact. Phrases
 * the old rules read ("next week", "the week of the 15th", "the weekend after
 * next", "two weeks from now") read exactly as before.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Precision } from '../civil.js';
import { type ResolvedTime, resolveTime, warmTemporalParser } from '../resolve-time.js';

const NY = 'America/New_York';
// Thu 2026-10-22 10:00 EDT
const THU = Date.parse('2026-10-22T10:00:00-04:00');
/** A New York wall clock after the 1 November DST change (EST). */
const est = (wall: string): number => Date.parse(`${wall}T10:00:00-05:00`);

const ymd = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: NY, dateStyle: 'short' }).format(new Date(ms));

function must(phrase: string, said: number): ResolvedTime {
  const r = resolveTime(phrase, said, NY);
  if (!r) throw new Error(`no time resolved for "${phrase}"`);
  return r;
}
const read = (r: ResolvedTime): [string, string, Precision, string] => [
  ymd(r.start),
  ymd(r.endExclusive),
  r.precision,
  r.certainty,
];

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
  expect(await warmTemporalParser()).toBe(true);
});
afterAll(() => vi.useRealTimers());

describe('#2499: the phrases from the issue, said Thu 2026-10-22', () => {
  it('"the week after next" is the ISO week of 11-02, assumed, not the day 11-02 exact', () => {
    expect(read(must('the week after next', THU))).toEqual([
      '2026-11-02',
      '2026-11-09',
      'week',
      'assumed',
    ]);
    expect(read(must('visiting my sister week after next', THU))).toEqual([
      '2026-11-02',
      '2026-11-09',
      'week',
      'assumed',
    ]);
  });

  it('"the week before Thanksgiving" is the seven days ending at 11-26, assumed', () => {
    expect(read(must('the week before Thanksgiving', THU))).toEqual([
      '2026-11-19',
      '2026-11-26',
      'span',
      'assumed',
    ]);
  });
});

describe('#2499: fresh variants', () => {
  it('"the week after next" across a month boundary (said Wed 11-18)', () => {
    expect(read(must('the week after next', est('2026-11-18')))).toEqual([
      '2026-11-30',
      '2026-12-07',
      'week',
      'assumed',
    ]);
  });

  it('"the week after next" across a year boundary (said Mon 12-21 and Sun 12-27)', () => {
    const jan = ['2027-01-04', '2027-01-11', 'week', 'assumed'];
    expect(read(must('the week after next', est('2026-12-21')))).toEqual(jan);
    // On a Sunday the week under way ends today, so next week starts tomorrow.
    expect(read(must('the week after next', est('2026-12-27')))).toEqual(jan);
  });

  it('"the week before Christmas" is this year while Christmas is ahead, next year after it', () => {
    const thisYear = ['2026-12-18', '2026-12-25', 'span', 'assumed'];
    expect(read(must('the week before christmas', est('2026-12-20')))).toEqual(thisYear);
    expect(read(must('the week before christmas', est('2026-12-24')))).toEqual(thisYear);
    expect(read(must('the week before christmas', est('2026-12-28')))).toEqual([
      '2027-12-18',
      '2027-12-25',
      'span',
      'assumed',
    ]);
  });

  it('"the week after" and "the week following" Thanksgiving start the day after it', () => {
    const after = ['2026-11-27', '2026-12-04', 'span', 'assumed'];
    expect(read(must('the week after thanksgiving', THU))).toEqual(after);
    expect(read(must('the week following thanksgiving', THU))).toEqual(after);
  });

  it('"the week of the 15th" is still the ISO week of 11-15, exact', () => {
    expect(read(must('the week of the 15th', THU))).toEqual([
      '2026-11-09',
      '2026-11-16',
      'week',
      'exact',
    ]);
  });

  it('"the weekend after next" is a weekend, not read as a week by the new rule', () => {
    const r = must('the weekend after next', THU);
    expect(read(r)).toEqual(['2026-10-31', '2026-11-02', 'span', 'exact']);
    expect(r.canonical).toBe('weekend=this;after_next=+7d');
  });

  it('"next week" and "two weeks from now" read as before', () => {
    const next = must('next week', THU);
    expect(read(next)).toEqual(['2026-10-26', '2026-11-02', 'week', 'exact']);
    expect(next.canonical).toBe('compromise:2026-10-26/2026-11-02');
    const two = must('two weeks from now', THU);
    expect(read(two)).toEqual(['2026-11-05', '2026-11-06', 'day', 'exact']);
    expect(two.canonical).toBe('now;plus=P14D');
  });
});

describe('#2499: compromise beside a week or month modifier is never exact', () => {
  it('"two weeks before Christmas" keeps compromise\'s day but is assumed', () => {
    expect(read(must('two weeks before christmas', THU))).toEqual([
      '2026-12-11',
      '2026-12-12',
      'day',
      'assumed',
    ]);
  });

  it('"a week before Thanksgiving" names one day, assumed, not the week-long span', () => {
    expect(read(must('a week before thanksgiving', THU))).toEqual([
      '2026-11-19',
      '2026-11-20',
      'day',
      'assumed',
    ]);
  });

  it('"the day before Thanksgiving" and "in two weeks" stay exact', () => {
    expect(read(must('the day before thanksgiving', THU))).toEqual([
      '2026-11-25',
      '2026-11-26',
      'day',
      'exact',
    ]);
    expect(read(must('surgery in two weeks', THU))).toEqual([
      '2026-11-05',
      '2026-11-06',
      'day',
      'exact',
    ]);
  });
});

describe('#2499 round 1: what follows "after next" / "before last" is read', () => {
  it('"the week after next friday" is the week after next Friday, not the bare two weeks on', () => {
    expect(read(must('the week after next friday', THU))).toEqual([
      '2026-10-31',
      '2026-11-07',
      'span',
      'ambiguous',
    ]);
  });

  it('"the week before last christmas" is the seven days before 2025-12-25', () => {
    expect(read(must('the week before last christmas', THU))).toEqual([
      '2025-12-18',
      '2025-12-25',
      'span',
      'assumed',
    ]);
  });

  it('"the week after next month" and "the week before last summer" are not the bare week', () => {
    for (const phrase of ['the week after next month', 'the week before last summer']) {
      const r = must(phrase, THU);
      expect(r.canonical).toMatch(/^compromise:/);
      expect(r.certainty).toBe('assumed');
    }
  });

  it('words after "next" that name no day leave the bare week after next', () => {
    expect(read(must('the week after next for dinner', THU))).toEqual([
      '2026-11-02',
      '2026-11-09',
      'week',
      'assumed',
    ]);
  });
});

describe('#2499 round 1: an anchor longer than a day or read in part goes to the fallback', () => {
  it('"the week after spring break" (compromise: Mar 1 to May 1) is not May 1-8', () => {
    const r = must('the week after spring break', est('2026-02-20'));
    expect(r.canonical).not.toMatch(/^week_after/);
    expect(r.certainty).toBe('assumed');
  });

  it('"the week after labor day weekend" keeps its partial mark, assumed', () => {
    const r = must('the week after labor day weekend', Date.parse('2026-08-20T10:00:00-04:00'));
    expect(r.canonical).toBe('weekend=this;partial');
    expect(r.certainty).toBe('assumed');
  });

  it('"the week before friday next week" does not hang a week on a partial day', () => {
    const r = must('the week before friday next week', THU);
    expect(r.canonical).toBe('weekday=friday;dir=next;partial');
    expect(read(r)).toEqual(['2026-10-23', '2026-10-24', 'day', 'assumed']);
  });
});

describe('#2499 round 1: the guard needs a unit and a direction side by side', () => {
  it('"call me after work next week" and "before the end of the month" stay exact', () => {
    expect(read(must('call me after work next week', THU))).toEqual([
      '2026-10-26',
      '2026-11-02',
      'week',
      'exact',
    ]);
    expect(read(must('before the end of the month', THU))).toEqual([
      '2026-10-22',
      '2026-11-01',
      'span',
      'exact',
    ]);
  });
});

describe('#2499 verifier: an unread noun after "next" / "last" is not the bare week', () => {
  it.each([
    'the week after next semester',
    'the week after next payday',
    'the week after next term',
    'the week after next holiday',
    'the week after next school break',
    'the week before last semester',
  ])('"%s" is not the bare week, and never exact', (phrase) => {
    const r = resolveTime(phrase, THU, NY);
    expect(r?.canonical ?? 'null').not.toMatch(/^week=(?:after_next|before_last)$/);
    expect(r?.certainty ?? 'null').not.toBe('exact');
  });

  it.each(['the week after next, ok?', 'the week after next and then'])(
    '"%s" keeps the bare week after next',
    (phrase) => {
      const r = must(phrase, THU);
      expect(read(r)).toEqual(['2026-11-02', '2026-11-09', 'week', 'assumed']);
      expect(r.canonical).toBe('week=after_next');
    }
  );
});
