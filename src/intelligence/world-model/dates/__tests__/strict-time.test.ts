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
    ['tomorrow morning at 9am', '09:00'],
    ['this afternoon at 4pm', '16:00'],
    ['tonight at 9pm', '21:00'],
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
    // Two times, even the same one twice: one is all a reminder can be built on.
    '3pm, I think, yes 3pm', '3pm, which is 15:00', '3pm 15:00', 'at 3, then 4pm', 'at 12 noon, 1pm',
    // Hedged, zoned, an alternative, another thing's time, or a part of the day that disagrees.
    'around 3pm', 'about 3pm', '3pm-ish', '3pm or so', 'not at 3pm', 'no later than 3pm', '3pm EST',
    '3pm, or 4', 'leave at 1pm for the appointment', 'tomorrow morning at 3pm', 'tonight at 9am', '３pm, 4pm',
  ])('%s gives no time', (text) => {
    expect(strictTimeOfDay(text)).toBeNull();
  }); // prettier-ignore

  it('takes the time and its "at" out of the rest, and leaves the day words alone', () => {
    expect(strictTimeOfDay('Friday at 3pm')?.rest).toBe('friday');
    expect(strictTimeOfDay('the 24th at 12 noon')?.rest).toBe('the 24th');
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
  const LEADS = ['', 'at '];
  const EDGES = [
    'before ', 'after ', 'by ', 'from 2 to ', '2-', '2 - ', 'between 1 and ', 'at 5 ', 'at 5.', 'ten to ', 'half past ',
    'around ', 'at about ', 'not at ', 'no later than ', 'earlier than ', 'leave at ', 'or ', 'maybe ',
  ]; // prettier-ignore
  const TIMES = [
    '1am', '3pm', '3 pm', '3PM', '3 p.m.', '3p.m.', '7:15am', '7:15 am', '11:59pm', '12am', '12pm',
    '12:30am', '12:30 pm', '9 a.m.', '10am', '00:00', '01:05', '08:30', '13:00', '17:45', '23:59',
    'noon', '12 noon', 'midnight', '12 midnight', '3', '15', '3:30', '10:30', '12:00', '5.30', '5 30',
    "three o'clock", '24:00', '12:60', '13pm', '0am', '1530',
  ]; // prettier-ignore
  const TAILS = ['', ' on friday', ' tomorrow', ' sharp', ' for the scan', '.'];
  const EDGE_TAILS = [' or 4pm', ' till 6', ' to 5', ', 10/22', '-5pm', ' or 4', '-ish', ' est', ' my time', ' london time', ', or 4', ' or so', ' in tokyo']; // prettier-ignore

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

/** The task's own reading of "looks like a time", kept apart from strict-time.ts's. */
const TIME_LIKE = /\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\d{1,2}:\d{2}|noon|midnight/gi;
const timeLike = (text: string): number => text.match(TIME_LIKE)?.length ?? 0;

describe('strictTimeOfDay: two times in the words give none', () => {
  const TIMED = ['9am', '10am', '3pm', '3 pm', '3:30pm', '3 p.m.', '12am', '12pm', '15:00', '08:30', '7:15', 'noon', '12 noon', 'midnight']; // prettier-ignore
  const SEPS = [', ', ' ', '; ', '. ', '/', ',', ' and ', ' then ', ', no, ', ' or ', ' - ', ', which is ', ' i mean ']; // prettier-ignore
  const DAYS = ['', 'friday ', 'friday at ', 'the 23rd at '];

  it('any two, the same or different, back to back or apart, give null', () => {
    let n = 0;
    for (const day of DAYS)
      for (const a of TIMED)
        for (const b of TIMED)
          for (const sep of SEPS) {
            const text = `${day}${a}${sep}${b}`;
            expect(timeLike(text), text).toBeGreaterThanOrEqual(2);
            expect(strictTimeOfDay(text), text).toBeNull();
            n += 1;
          }
    expect(n).toBe(DAYS.length * TIMED.length ** 2 * SEPS.length);
  });

  it('and so do three', () => {
    for (const text of ['friday 3pm 4pm 5pm', 'friday 9am, 10am, 11am', 'noon, 1pm or 2pm'])
      expect(strictTimeOfDay(text), text).toBeNull();
  });
});

/**
 * Every Blocking and non-blocking input from the ferni-verifier rounds on #2527
 * (2abdace5f, 0f58dd70d, e9a305453): [when, the right time, or null when only no time is right].
 */
const VERIFIER_INPUTS: ReadonlyArray<readonly [string, string | null]> = [
  // Round 1.
  ['at 5.30', null], ['Thursday at 9.30', null], ['tonight at 12', null], ['12 at night', null],
  ['at 12 at night', null], ['at 12', null], ['12pm', '12:00'], ['12am', '00:00'], ['2-4pm', null],
  ['at 01:00', '01:00'], ['by 5', null], ['around 3', null], ['at 13', null], ['at 12:30am', '00:30'],
  ['at 3 on the 3rd', null], ['at 10 tonight', null], ['at 7 in the evening', null], ['at 2024', null],
  ['half past 4', null], ['quarter to 9', null], ['3 tomorrow', null], ['around 3ish', null], ['noon-ish', null],
  ['Tuesday at 3', null], ['tomorrow at 9 in the morning', null], ['3pm', '15:00'], ['3:30 p.m.', '15:30'],
  ['15:00', '15:00'], ["three o'clock", null], ['noon', '12:00'], ['at 3', null], ['on the 3rd', null],
  // Round 2.
  ['at 5 30', null], ['at 5, 30', null], ['at 5. 30', null], ['at 3. 15', null], ['12am on friday', '00:00'],
  ['monday 12am', '00:00'], ['at 12 am on the 5th', '00:00'], ['12:00am tomorrow', '00:00'],
  ['tomorrow at 12am', '00:00'], ['12:30am on the 23rd', '00:30'], ['saturday morning at 12', null],
  ['sunday morning at 12.30', null], ['at 12:30am friday', '00:30'], ['at 1:30am friday', '01:30'],
  ['12 noon', '12:00'], ['12 midnight', '00:00'], ['at 5.30pm tomorrow', '17:30'], ['at 9.05', null],
  ['at 5.30 on friday', null], ['tonight at 11.45', null], ['at 6 tomorrow morning', null],
  ['noon tomorrow', '12:00'], ["3 o'clock friday", null], ['at 10:30 on the 31st', null], ['at 3 on 11/5', null],
  ['at 4:45pm next tuesday', '16:45'], ['at 12.15am', '00:15'], ['midnight friday', '00:00'],
  ['at 7.30 tonight', null], ['at 12.30 in the afternoon', null], ['2:30-3:30pm friday', null],
  ['wednesday the 23rd at 3', null], ['5.30 on friday', null], ['the 5.30 train', null], ['version 2.10', null],
  ['scored 7.5 out of 10', null], ['costs 5.30', null], ['from 9 till 5', null], ['between 2 and 3', null],
  ['every day at 8', null], ['at 8 sharp', null], ['at quarter past', null], ['ten thirty', null],
  ['at 1530', null], ['at 0830', null], ['in 2 hours', null], ['at 3.0', null], ['at 3.300', null],
  ['17h30', null], ['um 15 Uhr', null], ['at 10.30.2026', null], ['at 1.10.26', null], ['at 24:00', null],
  ['at 12:60', null], ['by 5.30', null], ['around 5.30', null], ['before 5.30', null], ['at 5.30ish', null],
  ['at 5 or 6', null], ['room 3.12 at 4', null], ['at 7 friday', null], ['at 12 noon friday', '12:00'],
  ['12 midnight friday', '00:00'], ['at 12 midnight', '00:00'], ['at 5 30 tomorrow', null],
  ['at 9 15 on friday', null], ['at five thirty', null], ['recital at 8', null],
  // Round 3, Blocking: two times listed.
  ['friday 9am, 10am', null], ['friday 11am 3pm', null], ['friday 2pm 3pm', null], ['friday 3pm, 4pm', null],
  ['friday 3pm; 4pm', null], ['friday 3pm. 4pm', null], ['friday at 4pm,5pm', null], ['friday 3pm 4pm 5pm', null],
  ['next tuesday 9am, 2pm', null], ['10/23 9am, 11am', null], ['the 23rd 9am, 10am', null],
  ['friday 12am, 1am', null], ['3pm/4pm', null],
  // Round 3, non-blocking: zones, negations, alternatives, another thing's time, approximate.
  ['3pm EST', null], ['3pm PT', null], ['3pm london time', null], ['3pm their time', null], ['3pm in tokyo', null],
  ['15:00 utc', null], ['3pm my time', null], ['3pm your time', null], ['not at 3pm', null],
  ['no later than 3pm', null], ['earlier than 3pm', null], ['before 3pm', null], ['after 3pm', null],
  ['by 3pm', null], ['until 3pm', null], ['3pm, or 4', null], ['3pm or 4pm', null],
  ['3pm tomorrow or 4pm friday', null], ['leave at 1pm for the appointment', null], ['3pm-ish', null],
  ['around 3pm', null], ['midnight-ish', null], ['3pm or so', null], ['friday at 3pm EST', null],
  ['friday 3pm my time', null], ['friday not at 3pm', null], ['friday no later than 3pm', null],
  ['friday at 3pm room 12', '15:00'], ['friday at 2pm 2nd floor', null], ['friday at 12 noon', '12:00'],
  ['friday at 3pm the 12th', '15:00'], ['friday at 12am', '00:00'], ['moved it to 4pm', null],
  // Round 3, held out.
  ['3 : 30pm', '15:30'], ['3, 30pm', null], ['3. 30pm', null], ['3.30 pm', null], ['3 30 pm', null],
  ['7:00', null], ['9:05', null], ['0:30', null], ['15:30h', null], ['1530', null], ['15h30', null],
  ['10:30 tonight', null], ['３pm', null], ['٣pm', null], ['3 pm', '15:00'], ['3 pm', '15:00'],
  ['3\tpm', '15:00'], ['3  pm', '15:00'], ['call 555 3pm', null], ['version 3.1pm', null], ['ward 7 3pm', null],
  ['gate 4, 3pm', null], ['past midnight', null], ['after midnight', null], ['by midnight', null],
  ['3pm–4pm', null], ['3pm—4pm', null], ['3pm through 5', null], ['8am to 9am', null],
  ['the 3pm train was late but we meet at 5pm', null], ['3 or 4pm', null], ['twelve noon', '12:00'],
  ['12 am', '00:00'], ['12a.m.', '00:00'], ['12:59am', '00:59'], ['07:00', '07:00'], ['00:30', '00:30'],
  ['3 p.m.', '15:00'], ['3P.M.', '15:00'], ['3 p. m.', '15:00'], ['3pm.', '15:00'], ['11:59 p.m.', '23:59'],
  ['3pm 15:00', '15:00'],
]; // prettier-ignore

describe('every input a verifier tried ends right or with no time', () => {
  it.each(VERIFIER_INPUTS)('%s', (when, right) => {
    const direct = strictTimeOfDay(when)?.at;
    const viaExtract = [undefined, '2026-10-20'].map((guess) => stored(when, guess)?.at);
    for (const got of [direct, ...viaExtract]) {
      if (right === null) expect(got).toBeUndefined();
      else if (got !== undefined) expect(got).toBe(right);
    }
  });

  it('is not vacuous: 43 of the 47 with a right time give it (the other 4 give none)', () => {
    const none = new Set(['at 5.30pm tomorrow', 'at 12.15am', '3 : 30pm', '3pm 15:00']);
    const timed = VERIFIER_INPUTS.filter(([w, right]) => right !== null && !none.has(w));
    expect(timed).toHaveLength(43);
    for (const [when, right] of timed) expect(strictTimeOfDay(when)?.at, when).toBe(right);
  });

  it('none of them gives a time when the words hold two times', () => {
    for (const [when] of VERIFIER_INPUTS)
      if (timeLike(when) >= 2) expect(strictTimeOfDay(when), when).toBeNull();
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
