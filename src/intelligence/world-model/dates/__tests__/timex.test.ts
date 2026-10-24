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

describe('resolveWhen: times that must not be guessed wrong (they feed reminders)', () => {
  it('reads minutes after a dot as minutes, never as "the 30th"', () => {
    expect(resolveWhen('at 5.30', SUN)).toEqual({ date: SUN, ambiguous: false, at: '17:30' });
    expect(resolveWhen('Thursday at 9.30', SUN)).toEqual({
      date: '2026-10-15',
      ambiguous: false,
      at: '09:30',
    });
    expect(resolveWhen('5.30pm', SUN)?.at).toBe('17:30');
    expect(resolveWhen('at 9.30 in the morning', SUN)?.at).toBe('09:30');
    expect(resolveWhen('at 17.30', SUN)?.at).toBe('17:30');
  });

  it.each(['10.30.2026', 'on 30.10', 'at 10.30.2026', 'at 1.10.26', 'at 5.3', 'at 5.60', 'at 3:3', '10.11 in the morning'])(
    '%s is no time and no day',
    (when) => {
      expect(resolveWhen(when, SUN)).toBeNull();
    }
  ); // prettier-ignore

  it('an hour run into a date is the date, not a time', () => {
    expect(resolveWhen('at 3/14', SUN)).toEqual({ date: '2027-03-14', ambiguous: false });
  });

  // Midnight is the end of the day it was said with, and is always confirmed.
  it.each([
    ['tonight at 12', '2026-10-12', '00:00'],
    ['12 at night', '2026-10-12', '00:00'],
    ['at 12 at night', '2026-10-12', '00:00'],
    ['12am', '2026-10-12', '00:00'],
    ['midnight', '2026-10-12', '00:00'],
    ['at 12:30am', '2026-10-12', '00:30'],
    ['tonight at 12:30', '2026-10-12', '00:30'],
    ['Friday night at 12', '2026-10-17', '00:00'],
  ])('%s said Sun Oct 11 is %s at %s, to confirm', (when, date, at) => {
    expect(resolveWhen(when, SUN)).toEqual({ date, ambiguous: true, at });
  });

  it.each([
    ['at 12', '12:00'],
    ['12pm', '12:00'],
    ['noon', '12:00'],
    // Zero-padded is 24-hour, and a literal 00:30 is not shifted.
    ['at 01:00', '01:00'],
    ['at 00:30', '00:30'],
    ['at 1:00', '13:00'],
    // A range is its start.
    ['2-4pm', '14:00'],
    ['11-1pm', '11:00'],
    ['12-2pm', '12:00'],
    ['10-11am', '10:00'],
  ])('%s said Sun Oct 11 is that day at %s', (when, at) => {
    expect(resolveWhen(when, SUN)).toEqual({ date: SUN, ambiguous: false, at });
  });

  it('gives up on "10 to 5pm" (4:50, or 10 until 5?)', () => {
    expect(resolveWhen('10 to 5pm', SUN)).toBeNull();
  });

  it('keeps the day under a part of the day it has no word for', () => {
    expect(resolveWhen('tomorrow afternoon', SUN)).toEqual({
      date: '2026-10-12',
      ambiguous: false,
    });
    expect(resolveWhen('tomorrow in the evening', SUN)?.date).toBe('2026-10-12');
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
