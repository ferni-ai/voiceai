import { describe, expect, it } from 'vitest';
import {
  datesNear,
  detectSignificantDate,
  formatDatesNear,
  type SignificantDate,
} from '../significant-dates.js';

// Friday 2026-10-02, 19:00 in Denver (01:00 UTC Saturday)
const now = new Date('2026-10-03T01:00:00Z');
const tz = 'America/Denver';
const detect = (text: string) => detectSignificantDate(text, now, tz);

describe('detectSignificantDate', () => {
  it('hears a birthday, whose it is, and the day', () => {
    expect(detect('My birthday is March 3rd')).toMatchObject({
      kind: 'birthday',
      who: 'self',
      month: 2,
      day: 3,
    });
    expect(detect("my mom's birthday is the 14th of june")).toMatchObject({
      kind: 'birthday',
      who: 'mom',
      month: 5,
      day: 14,
    });
    expect(detect("it's sam's birthday on Nov 9")).toMatchObject({ who: 'Sam', month: 10, day: 9 });
  });

  it('hears a loss with its year, and an anniversary', () => {
    expect(detect('My dad died on October 2nd, 2019')).toMatchObject({
      kind: 'loss',
      who: 'dad',
      month: 9,
      day: 2,
      year: 2019,
    });
    expect(detect('Tomorrow is our wedding anniversary')).toMatchObject({
      kind: 'anniversary',
      month: 9,
      day: 3,
    });
  });

  it("reads today in the caller's calendar", () => {
    // 01:00 UTC on Oct 3 is still Oct 2 in Denver
    expect(detect('Today is my birthday')).toMatchObject({ month: 9, day: 2 });
  });

  it('takes a relative day only when it names the day of the thing', () => {
    expect(detect("What should I get for my wife's birthday? I need it by tomorrow")).toBeNull();
    expect(detect("It's not my birthday today")).toBeNull();
    expect(detect('Our anniversary is tomorrow')).toMatchObject({ month: 9, day: 3 });
  });

  it('does not mistake everyday sentences for a date that matters', () => {
    expect(detect('My phone died yesterday')).toBeNull();
    expect(detect('My son passed his exam on June 3')).toBeNull();
    expect(detect('My birthday is coming up')).toBeNull();
    expect(detect('The meeting is on March 3')).toBeNull();
  });
});

describe('datesNear across the calendar', () => {
  it('keeps a Feb 29 date on Feb 28 in other years', () => {
    const leapDay: SignificantDate = { id: 'b', kind: 'birthday', who: 'self', month: 1, day: 29 };
    const feb28 = new Date('2027-02-28T18:00:00Z');
    expect(datesNear([leapDay], feb28, 'UTC').map((n) => n.when)).toEqual(['today']);
  });

  it('counts years from the caller\u2019s own year at New Year', () => {
    const nye: SignificantDate = {
      id: 'l',
      kind: 'loss',
      who: 'dad',
      month: 11,
      day: 31,
      year: 2019,
    };
    // 16:00 UTC on Dec 31 2025 is already Jan 1 2026 in Tokyo
    const now = new Date('2025-12-31T16:00:00Z');
    const note = formatDatesNear(datesNear([nye], now, 'Asia/Tokyo'));
    expect(note).toContain('Yesterday was the anniversary of losing their dad (6 years).');
  });
});

describe('datesNear / formatDatesNear', () => {
  const dad: SignificantDate = {
    id: 'loss-dad-10-2',
    kind: 'loss',
    who: 'dad',
    month: 9,
    day: 2,
    year: 2019,
  };
  const birthday: SignificantDate = {
    id: 'birthday-self-10-3',
    kind: 'birthday',
    who: 'self',
    month: 9,
    day: 3,
  };
  const far: SignificantDate = { id: 'b', kind: 'birthday', who: 'mom', month: 0, day: 5 };

  it('finds the dates today, tomorrow and yesterday, today first', () => {
    const near = datesNear([birthday, far, dad], now, tz);
    expect(near.map((n) => `${n.date.id}:${n.when}`)).toEqual([
      'loss-dad-10-2:today',
      'birthday-self-10-3:tomorrow',
    ]);
  });

  it('is gentle about a loss and warm about a birthday', () => {
    const note = formatDatesNear(datesNear([dad, birthday], now, tz));
    expect(note).toContain('Today is the anniversary of losing their dad (7 years). Be gentle.');
    expect(note).toContain('Tomorrow is their birthday.');
    expect(note).toMatch(/never say you looked it up/);
    expect(formatDatesNear([])).toBeNull();
  });
});
