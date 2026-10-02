import { describe, expect, it } from 'vitest';
import {
  formatCivil,
  isWithinQuietHours,
  localToday,
  nextOccurrence,
  parseStoredDate,
  zonedTimeToUtc,
} from '../date-math.js';
import { parseSpokenDate, toStoredDate } from '../date-parsing.js';

const day = (s: string) => {
  const [year, month, d] = s.split('-').map(Number);
  return { year, month, day: d };
};

describe('stored dates', () => {
  it('parses YYYY-MM-DD and --MM-DD and rejects impossible days', () => {
    expect(parseStoredDate('2015-06-12')).toEqual({ year: 2015, month: 6, day: 12 });
    expect(parseStoredDate('--02-29')).toEqual({ month: 2, day: 29 });
    expect(parseStoredDate('2023-02-29')).toBeNull();
    expect(parseStoredDate('--13-01')).toBeNull();
    expect(parseStoredDate('June 12')).toBeNull();
  });
});

describe('nextOccurrence', () => {
  it('finds this year or rolls to next year', () => {
    expect(formatCivil(nextOccurrence({ month: 6, day: 12 }, true, day('2026-03-01'))!)).toBe(
      '2026-06-12'
    );
    expect(formatCivil(nextOccurrence({ month: 6, day: 12 }, true, day('2026-06-12'))!)).toBe(
      '2026-06-12'
    );
    expect(formatCivil(nextOccurrence({ month: 1, day: 1 }, true, day('2026-12-31'))!)).toBe(
      '2027-01-01'
    );
  });

  it('moves Feb 29 to Feb 28 in non-leap years, keeps it in leap years', () => {
    expect(formatCivil(nextOccurrence({ month: 2, day: 29 }, true, day('2026-01-10'))!)).toBe(
      '2026-02-28'
    );
    expect(formatCivil(nextOccurrence({ month: 2, day: 29 }, true, day('2027-03-01'))!)).toBe(
      '2028-02-29'
    );
    expect(
      formatCivil(nextOccurrence({ year: 2000, month: 2, day: 29 }, true, day('2027-03-01'))!)
    ).toBe('2028-02-29');
  });

  it('one-off dates occur once and are gone after', () => {
    expect(
      formatCivil(nextOccurrence({ year: 2026, month: 11, day: 3 }, false, day('2026-10-02'))!)
    ).toBe('2026-11-03');
    expect(nextOccurrence({ year: 2026, month: 9, day: 3 }, false, day('2026-10-02'))).toBeNull();
  });
});

describe('time zones', () => {
  it("uses the user's local day", () => {
    const instant = new Date('2026-10-02T03:30:00Z');
    expect(formatCivil(localToday(instant, 'America/Los_Angeles'))).toBe('2026-10-01');
    expect(formatCivil(localToday(instant, 'Asia/Tokyo'))).toBe('2026-10-02');
  });

  it('converts local wall time to UTC across DST', () => {
    // 09:00 in New York: EDT (UTC-4) in October, EST (UTC-5) in December.
    expect(zonedTimeToUtc(day('2026-10-02'), 9 * 60, 'America/New_York').toISOString()).toBe(
      '2026-10-02T13:00:00.000Z'
    );
    expect(zonedTimeToUtc(day('2026-12-02'), 9 * 60, 'America/New_York').toISOString()).toBe(
      '2026-12-02T14:00:00.000Z'
    );
    expect(zonedTimeToUtc(day('2026-10-02'), 9 * 60, 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-02T03:30:00.000Z'
    );
  });

  it('handles overnight and same-day quiet hours', () => {
    expect(isWithinQuietHours(23 * 60, 21 * 60, 8 * 60)).toBe(true);
    expect(isWithinQuietHours(7 * 60, 21 * 60, 8 * 60)).toBe(true);
    expect(isWithinQuietHours(9 * 60, 21 * 60, 8 * 60)).toBe(false);
    expect(isWithinQuietHours(13 * 60, 12 * 60, 14 * 60)).toBe(true);
    expect(isWithinQuietHours(13 * 60, 12 * 60, 12 * 60)).toBe(false);
  });
});

describe('parseSpokenDate', () => {
  const today = day('2026-10-02'); // a Friday

  it.each([
    ['June 12', { month: 6, day: 12 }],
    ['june 12th', { month: 6, day: 12 }],
    ['June 12th, 2015', { year: 2015, month: 6, day: 12 }],
    ['the 12th of June', { month: 6, day: 12 }],
    ['12 June 2015', { year: 2015, month: 6, day: 12 }],
    ['6/12', { month: 6, day: 12 }],
    ['6/12/2015', { year: 2015, month: 6, day: 12 }],
    ['25/12', { month: 12, day: 25 }],
    ['2015-06-12', { year: 2015, month: 6, day: 12 }],
    ["it's on Feb 29", { month: 2, day: 29 }],
    ['remind me 7 days before march 3', { month: 3, day: 3 }],
  ])('reads %s', (phrase, parts) => {
    expect(parseSpokenDate(phrase, today)?.parts).toEqual(parts);
  });

  it.each([
    ['today', '2026-10-02'],
    ['tomorrow', '2026-10-03'],
    ['in 3 days', '2026-10-05'],
    ['in two weeks', '2026-10-16'],
    ['next Friday', '2026-10-09'],
    ['monday', '2026-10-05'],
  ])('reads relative %s', (phrase, expected) => {
    const parsed = parseSpokenDate(phrase, today);
    expect(parsed?.relative).toBe(true);
    expect(toStoredDate(parsed!, false, today)).toBe(expected);
  });

  it('returns null for nonsense and impossible dates', () => {
    expect(parseSpokenDate('sometime soon', today)).toBeNull();
    expect(parseSpokenDate('February 30', today)).toBeNull();
  });

  it('stores recurring dates without a year as --MM-DD and one-offs as the next occurrence', () => {
    const june = parseSpokenDate('June 12', today)!;
    expect(toStoredDate(june, true, today)).toBe('--06-12');
    expect(toStoredDate(june, false, today)).toBe('2027-06-12');
    const withYear = parseSpokenDate('June 12 2015', today)!;
    expect(toStoredDate(withYear, true, today)).toBe('2015-06-12');
    const nov = parseSpokenDate('November 3', today)!;
    expect(toStoredDate(nov, false, today)).toBe('2026-11-03');
  });
});
