/**
 * PR #2482 fix round 1, frozen clock. A modifier moves the day it names ("a
 * week from Thursday" is not this Thursday, "after the weekend" is not the
 * weekend), a modifier no rule reads leaves the day assumed, never exact, and
 * a past-tense sentence is not read as a date ahead.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Tense } from '../civil.js';
import { eventState } from '../event-state.js';
import {
  type ResolvedTime,
  resolveTime,
  resolveTimes,
  warmTemporalParser,
} from '../resolve-time.js';
import { hasPastVerb, sentenceTense } from '../tense.js';

const NY = 'America/New_York';
/** An instant from a New York wall clock in EDT (all dates here are before Nov 1). */
const ny = (wall: string): number => Date.parse(`${wall}-04:00`);
const MON = ny('2026-10-19T10:00:00');
const THU = ny('2026-10-22T10:00:00');

const ymd = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: NY, dateStyle: 'short' }).format(new Date(ms));

function must(phrase: string, said: number, tense?: Tense): ResolvedTime {
  const r = resolveTime(phrase, said, NY, { tense });
  if (!r) throw new Error(`no time resolved for "${phrase}"`);
  return r;
}
const read = (r: ResolvedTime): string[] => [ymd(r.start), ymd(r.endExclusive), r.certainty];

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
  expect(await warmTemporalParser()).toBe(true);
});
afterAll(() => vi.useRealTimers());

describe('modifiers move the day they name', () => {
  it('"a week from Thursday" said Mon 10-19 is Thu 10-29, still upcoming on 10-25', () => {
    const r = must('a week from Thursday', MON);
    expect(read(r)).toEqual(['2026-10-29', '2026-10-30', 'exact']);
    expect(eventState(r, ny('2026-10-25T12:00:00'), NY)).toBe('upcoming');
    expect(eventState(r, ny('2026-10-29T12:00:00'), NY)).toBe('ongoing');
    expect(eventState(r, ny('2026-10-30T12:00:00'), NY)).toBe('past');
  });

  it('"after the weekend" said Thu 10-22 starts Mon 10-26 and is not past on Mon 11:00', () => {
    const r = must('call the bank after the weekend', THU);
    expect(read(r)).toEqual(['2026-10-26', '2026-10-27', 'assumed']);
    expect(eventState(r, ny('2026-10-24T12:00:00'), NY)).toBe('upcoming');
    expect(eventState(r, ny('2026-10-26T11:00:00'), NY)).not.toBe('past');
  });

  it('"two weeks from Friday" said Thu 10-22 is Fri 11-06', () => {
    expect(read(must('two weeks from Friday', THU))).toEqual(['2026-11-06', '2026-11-07', 'exact']);
    expect(read(must('2 weeks from friday', THU))).toEqual(['2026-11-06', '2026-11-07', 'exact']);
  });

  it('"after Monday" said Thu 10-22 starts Tue 10-27, assumed', () => {
    expect(read(must('after Monday', THU))).toEqual(['2026-10-27', '2026-10-28', 'assumed']);
  });

  it('"a week from today/tomorrow" and "the Thursday after next"', () => {
    expect(read(must('a week from today', MON))).toEqual(['2026-10-26', '2026-10-27', 'exact']);
    expect(read(must('a week from tomorrow', MON))).toEqual(['2026-10-27', '2026-10-28', 'exact']);
    expect(read(must('the Friday after next', THU))).toEqual(['2026-10-30', '2026-10-31', 'exact']);
    expect(read(must('weekend after next', THU))).toEqual(['2026-10-31', '2026-11-02', 'exact']);
  });

  it('a modifier no rule reads leaves the day assumed, never exact', () => {
    for (const phrase of ['the day before Thursday', 'the following Monday', 'Friday next week']) {
      expect(must(phrase, THU).certainty, phrase).toBe('assumed');
    }
    expect(read(must('the day after tomorrow', THU))).toEqual([
      '2026-10-24',
      '2026-10-25',
      'exact',
    ]);
  });
});

describe('tense', () => {
  it('reads the verbs: event past, reporting past, future, mixed', () => {
    expect(sentenceTense('I saw her on the 9th')).toBe('past');
    expect(sentenceTense('we visited grandma friday')).toBe('past');
    expect(sentenceTense("I'm seeing her on the 9th")).toBe('future');
    expect(sentenceTense('I booked the dentist for the 30th')).toBeUndefined();
    expect(sentenceTense("I'm so excited for Friday")).toBeUndefined();
    expect(sentenceTense('dinner with Jared on Friday')).toBeUndefined();
    expect(hasPastVerb('I booked the dentist for the 30th')).toBe(true);
    expect(hasPastVerb('I need to see her on the 9th')).toBe(false);
  });

  it('resolveTimes with no tense never reads a past-tense clause as an exact day ahead', () => {
    const [r] = resolveTimes('I saw her on the 9th', THU, NY);
    expect(r.certainty).not.toBe('exact');
    const [plan] = resolveTimes('seeing her on the 9th', THU, NY);
    expect(read(plan)).toEqual(['2026-11-09', '2026-11-10', 'exact']);
  });

  it('resolveTimes passes the tense it is given to each clause', () => {
    const [r] = resolveTimes('I saw her on the 9th', THU, NY, { tense: 'past' });
    expect(read(r)).toEqual(['2026-10-09', '2026-10-10', 'exact']);
  });
});
