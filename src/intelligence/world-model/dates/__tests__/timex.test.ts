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
    ['thursday at 3pm', '2026-10-15'],
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
