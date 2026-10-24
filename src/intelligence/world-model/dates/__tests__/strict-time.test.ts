import { describe, expect, it } from 'vitest';

import { toDateObservations, type DateMention } from '../extract.js';
import { strictTimeOfDay } from '../strict-time.js';
import { MAIN_DAYS } from './day-parity.fixture.js';

/** Tuesday 2026-10-20, 10:00 in New York. */
const CALL = { sessionId: 's1', observedAt: '2026-10-20T14:00:00.000Z', callDate: '2026-10-20' };

const stored = (when: string, guess?: string) =>
  toDateObservations(
    [
      {
        who: 'self', what: 'scan', kind: 'medical', when, ...(guess ? { guess } : {}),
        recurring: false, past: false, correction: false, unsure: false, confidence: 0.9,
      } satisfies DateMention,
    ],
    CALL
  )[0]; // prettier-ignore

describe('strictTimeOfDay: only forms with one reading', () => {
  it.each([
    ['3pm', '15:00'],
    ['3 pm', '15:00'],
    ['3:30 p.m.', '15:30'],
    ['friday at 3a.m.', '03:00'],
    ['9:05am', '09:05'],
    ['12pm', '12:00'],
    ['12:15pm', '12:15'],
    ['15:00', '15:00'],
    ['08:30', '08:30'],
    ['00:15', '00:15'],
    ['23:59', '23:59'],
    ['noon', '12:00'],
    ['12 noon', '12:00'],
    ['twelve noon', '12:00'],
    ['around 3pm', '15:00'],
    ['3pm, I think, yes 3pm', '15:00'],
    ['3pm, which is 15:00', '15:00'],
  ])('%s is %s', (text, at) => {
    expect(strictTimeOfDay(text)).toMatchObject({ at, midnight: false });
  });

  it.each([
    ['12am', '00:00'],
    ['12:30am', '00:30'],
    ['midnight', '00:00'],
    ['12 midnight', '00:00'],
  ])('%s is %s, marked midnight', (text, at) => {
    expect(strictTimeOfDay(text)).toMatchObject({ at, midnight: true });
  });

  it.each([
    'at 3', 'at 12', '3', 'tonight at 12', '12 at night', "three o'clock", '3 o\'clock pm', 'three pm',
    '5.30', 'at 5.30', '5.30pm', 'at 5 30', 'at 5, 30', 'at 5. 30', 'at 3. 15', 'at five thirty',
    '3:30', '10:30', '12:00', '1:00', '24:00', '12:60', '13:00 pm', 'at 1530', '17h30', '0am', '13pm',
    '2-4pm', '2 - 4pm', '2–4pm', '11-1pm', '2pm-4pm', 'from 2pm to 4pm', 'between 2 and 4pm', '3 or 4pm',
    '3pm or 4pm', '3pm to 4', '3pm till 6', '10 to 5pm', 'ten to 5pm', 'half past 4pm', 'quarter to 9am',
    'before 3pm', 'after 3pm', 'by 3pm', 'until 3pm', 'before noon', 'after midnight', 'at 5 10pm',
    'October 5 3pm', '3pm, 10/22', 'noon or 3pm', 'at 3pm, or maybe 5pm', 'at 9am then 14:00', 'noon, no wait, 1pm', 'the 14th', 'afternoon', '',
  ])('%s gives no time', (text) => {
    expect(strictTimeOfDay(text)).toBeNull();
  }); // prettier-ignore

  it('takes the time and its "at" out of the rest, and leaves the day words alone', () => {
    expect(strictTimeOfDay('Friday at 3pm')?.rest).toBe('friday');
    expect(strictTimeOfDay('the 24th at around 12 noon')?.rest).toBe('the 24th');
    expect(strictTimeOfDay('12am on Friday')?.rest).toBe('on friday');
  });
});

describe('toDateObservations: the stored time is right or missing, never wrong', () => {
  // Every input from the two FAIL verifies' Blocking lists (round 1 2abdace5f, round 2 0f58dd70d).
  it.each([
    // [when, the right time, or null when there is no single right time]
    ['at 5.30', '17:30'],
    ['Thursday at 9.30', '09:30'],
    ['tonight at 12', '00:00'],
    ['12 at night', '00:00'],
    ['at 12 at night', '00:00'],
    ['at 5 30', '17:30'],
    ['at 5, 30', '17:30'],
    ['at 5. 30', '17:30'],
    ['at 3. 15', '15:15'],
    ['12am on friday', '00:00'],
    ['monday 12am', '00:00'],
    ['at 12 am on the 5th', '00:00'],
    ['12:00am tomorrow', '00:00'],
    ['tomorrow at 12am', '00:00'],
    ['12:30am on the 23rd', '00:30'],
    ['saturday morning at 12', '00:00'],
    ['sunday morning at 12.30', '00:30'],
    ['at 12:30am friday', '00:30'],
    ['at 1:30am friday', '01:30'],
    ['12 noon', '12:00'],
    ['12 midnight', '00:00'],
  ])('%s: the time is %s or none', (when, right) => {
    for (const guess of [undefined, '2026-10-20']) {
      const o = stored(when, guess);
      if (o?.at !== undefined) expect(o.at).toBe(right);
    }
  });

  it('keeps a time only on a day the words give without it', () => {
    expect(stored('Friday at 6pm')).toMatchObject({ eventDate: '2026-10-23', at: '18:00' });
    expect(stored('the 24th at 3pm')).toMatchObject({ eventDate: '2026-10-24', at: '15:00' });
    // The day reader takes "12" or "3" here for a day of the month: no time rides on that.
    expect(stored('12 noon')).not.toHaveProperty('at');
    expect(stored('Friday at 3:30pm')).not.toHaveProperty('at');
    // No day the words give: the model's guess is not one to time.
    expect(stored('at 3pm', '2026-10-20')).not.toHaveProperty('at');
  });

  it('a midnight time is asked about before anything relies on it, on the same day', () => {
    expect(stored('12am on friday')).toMatchObject({
      eventDate: '2026-10-23',
      at: '00:00',
      needsConfirmation: true,
    });
    expect(stored('Friday at 6pm')?.needsConfirmation).toBe(false);
  });
});

describe('strictTimeOfDay: property, over generated phrasings', () => {
  const DAYS = ['', 'friday ', 'on the 5th ', 'tomorrow ', 'next tuesday '];
  const LEADS = ['', 'at ', 'around ', 'at about '];
  const EDGES = ['before ', 'after ', 'by ', 'from 2 to ', '2-', '2 - ', 'between 1 and ', 'at 5 ', 'at 5.', 'ten to ', 'half past ']; // prettier-ignore
  const TIMES = [
    '1am', '3pm', '3 pm', '3PM', '3 p.m.', '3p.m.', '7:15am', '7:15 am', '11:59pm', '12am', '12pm',
    '12:30am', '12:30 pm', '9 a.m.', '10am', '00:00', '01:05', '08:30', '13:00', '17:45', '23:59',
    'noon', '12 noon', 'midnight', '12 midnight', '3', '15', '3:30', '10:30', '12:00', '5.30', '5 30',
    "three o'clock", '24:00', '12:60', '13pm', '0am', '1530',
  ]; // prettier-ignore
  const TAILS = ['', ' on friday', ' tomorrow', ' sharp', ' for the scan', '.'];
  const EDGE_TAILS = [' or 4pm', ' till 6', ' to 5', ', 10/22', '-5pm', ' or 4'];

  /** Every way `at` could be said; the input must literally contain one. */
  function spoken(at: string): RegExp {
    const [h, m] = at.split(':').map(Number);
    const h12 = h % 12 || 12;
    const mer = h < 12 ? 'a' : 'p';
    const minutes = m === 0 ? `(?::00)?` : `:${String(m).padStart(2, '0')}`;
    const forms = [`${h12}${minutes} ?${mer}\\.? ?m`, at];
    if (at === '12:00') forms.push('(?:12 |twelve )?noon');
    if (at === '00:00') forms.push('(?:12 |twelve )?midnight');
    return new RegExp(`(?<![\\d:.])(?:${forms.join('|')})(?![\\d])`, 'i');
  }

  it('a time it gives always appears, said that way, in the words', () => {
    let timed = 0;
    for (const day of DAYS)
      for (const lead of LEADS)
        for (const time of TIMES)
          for (const tail of TAILS) {
            const text = `${day}${lead}${time}${tail}`;
            const got = strictTimeOfDay(text);
            if (!got) continue;
            timed += 1;
            expect(text, `${text} -> ${got.at}`).toMatch(spoken(got.at));
            expect(got.at).toMatch(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
          }
    // Not vacuous: most of the accepted forms came through.
    expect(timed).toBeGreaterThan(DAYS.length * LEADS.length * TAILS.length * 20);
  });

  it('a time at the edge of a range, a deadline or another number is never given', () => {
    for (const day of DAYS)
      for (const time of TIMES) {
        for (const edge of EDGES) expect(strictTimeOfDay(`${day}${edge}${time}`), `${day}${edge}${time}`).toBeNull(); // prettier-ignore
        for (const tail of EDGE_TAILS) expect(strictTimeOfDay(`${day}at ${time}${tail}`), `${day}at ${time}${tail}`).toBeNull(); // prettier-ignore
      }
  });
});

describe("the stored day is main's, for every phrase", () => {
  it.each(MAIN_DAYS)('%s (%s guess)', (when, guess, eventDate, needsConfirmation, confidence) => {
    const o = stored(when, guess === 'guess' ? CALL.callDate : undefined);
    if (eventDate === null) {
      expect(o).toBeUndefined();
      return;
    }
    expect(o).toMatchObject({ eventDate, confidence });
    // The one change: a stored midnight time is confirmed first. The day still is main's.
    const midnight = o?.at !== undefined && strictTimeOfDay(when)?.midnight === true;
    expect(o?.needsConfirmation).toBe(needsConfirmation || midnight);
  });

  it('covers phrases where main and the time disagree about the day', () => {
    const whens = new Set(MAIN_DAYS.map(([w]) => w));
    for (const w of [
      '12 noon',
      'Friday at 3:30pm',
      'Tuesday at 3',
      'at 12',
      'at 5.30',
      '12am on friday',
    ])
      expect(whens.has(w), w).toBe(true);
  });
});
