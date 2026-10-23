import { describe, expect, it } from 'vitest';

import { nextOccurrence, resolveWhen } from '../timex.js';

/** Sunday 2026-10-11 (the week Mon Oct 5 to Sun Oct 11). */
const SUN = '2026-10-11';

describe('resolveWhen: absolute days', () => {
  it.each([
    ['October 14th', '2026-10-14'],
    ['the 7th of November', '2026-11-07'],
    ['the twenty-first of October', '2026-10-21'],
    ['10/22', '2026-10-22'],
    ['2026-11-15', '2026-11-15'],
    // A month and day already past this year is next year's.
    ['June 3rd', '2027-06-03'],
    ['Christmas Eve', '2026-12-24'],
    ['Thanksgiving', '2026-11-26'],
  ])('%s said on Sun Oct 11 is %s', (when, day) => {
    expect(resolveWhen(when, SUN)).toEqual({ date: day, ambiguous: false });
  });

  it('keeps a stated year, and refuses days that do not exist', () => {
    expect(resolveWhen('March 9th, 2019', SUN)?.date).toBe('2019-03-09');
    expect(resolveWhen('April 31', SUN)).toBeNull();
  });
});

describe('resolveWhen: relative to the call', () => {
  it.each([
    ['tomorrow', '2026-10-12'],
    ['the day after tomorrow', '2026-10-13'],
    ['Friday morning', '2026-10-16'],
    ['in two weeks', '2026-10-25'],
    ['in a couple of weeks', '2026-10-25'],
    ['a week from Tuesday', '2026-10-20'],
    ['next week, on the 16th', '2026-10-16'],
    // Sunday ends the week, so "next Thursday" has one reading.
    ['next Thursday', '2026-10-15'],
  ])('%s said on Sun Oct 11 is %s', (when, day) => {
    expect(resolveWhen(when, SUN)).toEqual({ date: day, ambiguous: false });
  });

  it('reads things that already happened backwards', () => {
    expect(resolveWhen('last Tuesday', SUN)?.date).toBe('2026-10-06');
    expect(resolveWhen('yesterday', SUN, true)?.date).toBe('2026-10-10');
    expect(resolveWhen('Tuesday', SUN, true)?.date).toBe('2026-10-06');
  });

  it('leaves phrases with no single day unresolved', () => {
    expect(resolveWhen('next month', SUN)).toBeNull();
    expect(resolveWhen('sometime in June', SUN)).toBeNull();
    expect(resolveWhen('soon', SUN)).toBeNull();
  });
});

describe('resolveWhen: the time of day, kept beside the day', () => {
  it.each([
    ['thursday at 3pm', '2026-10-15', '15:00'],
    ['Thursday at 3', '2026-10-15', '15:00'],
    ['the 14th at 15:00', '2026-10-14', '15:00'],
    ["October 14th at three o'clock", '2026-10-14', '15:00'],
    ['Friday at noon', '2026-10-16', '12:00'],
    ['tomorrow at 9:30 a.m.', '2026-10-12', '09:30'],
    // No day said: the call's own day ("biopsy at 3").
    ['at 3', SUN, '15:00'],
  ])('%s said on Sun Oct 11 is %s at %s', (when, day, at) => {
    expect(resolveWhen(when, SUN)).toEqual({ date: day, ambiguous: false, at });
  });

  // The rule for an hour with no am or pm: 7 to 11 morning, 12 noon, 1 to 6 afternoon,
  // unless the words say which part of the day.
  it.each([
    ['at 3', '15:00'],
    ['at 6', '18:00'],
    ['at 7', '07:00'],
    ['at 11', '11:00'],
    ['at 12', '12:00'],
    ['at 3 in the morning', '03:00'],
    ['tonight at 8', '20:00'],
    ['at 10 in the evening', '22:00'],
    ['3 in the morning', '03:00'],
    ['8 tonight', '20:00'],
    ['5 in the afternoon', '17:00'],
  ])('%s is %s', (when, at) => {
    expect(resolveWhen(when, SUN)?.at).toBe(at);
  });

  it('gives no time when none was said, and never reads a day as an hour', () => {
    expect(resolveWhen('the 14th', SUN)).toEqual({ date: '2026-10-14', ambiguous: false });
    expect(resolveWhen('on the 3rd', SUN)).not.toHaveProperty('at');
    // An hour before a part of the day is that day's hour, never "the 3rd".
    expect(resolveWhen('3 in the morning', SUN)).toEqual({
      date: SUN,
      ambiguous: false,
      at: '03:00',
    });
    expect(resolveWhen('Friday morning', SUN)).toEqual({ date: '2026-10-16', ambiguous: false });
  });
});

describe('resolveWhen: the hard cases', () => {
  it('"the 3rd" near a month end is next month, not this one', () => {
    expect(resolveWhen('the 3rd', '2026-10-30')).toEqual({ date: '2026-11-03', ambiguous: false });
    expect(resolveWhen('the 2nd', '2026-10-31')).toEqual({ date: '2026-11-02', ambiguous: false });
  });

  it('marks a day-of-month just passed as ambiguous (did they mean two days ago?)', () => {
    expect(resolveWhen('the 3rd', '2026-10-05')).toEqual({ date: '2026-11-03', ambiguous: true });
  });

  it('"next Friday" on a Monday is ambiguous and reads as next week', () => {
    expect(resolveWhen('next Friday', '2026-10-12')).toEqual({
      date: '2026-10-23',
      ambiguous: true,
    });
    expect(resolveWhen('this Friday', '2026-10-12')?.date).toBe('2026-10-16');
  });

  it('a bare weekday said on that weekday is ambiguous', () => {
    expect(resolveWhen('Thursday', '2026-10-15')).toEqual({ date: '2026-10-22', ambiguous: true });
  });

  it('a weekday that disagrees with the date asks; one that agrees does not', () => {
    expect(resolveWhen('Wednesday, the 14th', SUN)).toEqual({
      date: '2026-10-14',
      ambiguous: false,
    });
    expect(resolveWhen('Tuesday the 14th', SUN)?.ambiguous).toBe(true);
  });

  it('resolves in the caller day, so the anchor decides (Sunday night in LA is Monday in UTC)', () => {
    expect(resolveWhen('tomorrow', '2026-10-11')?.date).toBe('2026-10-12');
    expect(resolveWhen('tomorrow', '2026-10-12')?.date).toBe('2026-10-13');
  });
});

describe('nextOccurrence', () => {
  it('is this year when still ahead (today included), else next year', () => {
    expect(nextOccurrence('10-14', SUN)).toBe('2026-10-14');
    expect(nextOccurrence('10-11', SUN)).toBe('2026-10-11');
    expect(nextOccurrence('10-10', SUN)).toBe('2027-10-10');
  });

  it('puts Feb 29 on Feb 28 outside leap years', () => {
    expect(nextOccurrence('02-29', SUN)).toBe('2027-02-28');
    expect(nextOccurrence('02-29', '2027-03-01')).toBe('2028-02-29');
  });
});
