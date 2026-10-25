/**
 * withoutContactDetails, case by case: every phone number and email address a
 * person might type or say is blanked, and dates, times, money, short
 * reference numbers and ordinary prose come back exactly as written. It feeds
 * the follow-through list (toHeldItem) and the "on it" view, so a miss here
 * shows someone's number in the app. All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { withoutContactDetails } from '../holding.js';

const SHOULD_BLANK: ReadonlyArray<readonly [string, string]> = [
  // Brackets: the area code goes with the number, and no stray bracket is left.
  ['call (555) 0132 now', 'call a number now'],
  ['call (415) 555 0132', 'call a number'],
  ['The number is (415)555-0132', 'The number is a number'],
  ['call (415) 555-0132 today', 'call a number today'],
  ['call me (415 555 0132)', 'call me (a number)'],
  ['ring (+44) 20 7946 0958', 'ring a number'],
  ['call +1 (415) 555-0132.', 'call a number.'],
  // Extensions go with the number.
  ['call 415.555.0132x99 please', 'call a number please'],
  ['call 415-555-0132 ext. 99', 'call a number'],
  ['call 415-555-0132 ext 12 today', 'call a number today'],
  ['ring +44 20 7946 0958 ext 12', 'ring a number'],
  ['dial 415 555 0132 extension 4410', 'dial a number'],
  ['dial 415 555 0132 X 7', 'dial a number'],
  ['dial 4155550132 ext:301', 'dial a number'],
  // A date that stays doesn't carry a number written straight after it.
  ['on 2026-11-01 x 415 555 0132', 'on 2026-11-01 x a number'],
  // Any script's digits.
  ['call ４１５５５５０１３２', 'call a number'],
  ['call ４１５－５５５－０１３２ now', 'call a number now'],
  ['call （４１５）５５５－０１３２', 'call a number'],
  ['call ٤١٥٥٥٥٠١٣٢', 'call a number'],
  ['call ٤١٥ ٥٥٥ ٠١٣٢ please', 'call a number please'],
  ['call ۴۱۵۵۵۵۰۱۳۲', 'call a number'],
  ['call ४१५५५५०१३२', 'call a number'],
  ['ring ＋４４ ２０ ７９４６ ０９５８', 'ring a number'],
  // The plain shapes the old pattern already caught still go.
  ['call +1 415-555-0132 about the car', 'call a number about the car'],
  ['call 555-0132', 'call a number'],
  ['call 1-800-555-0199 tomorrow', 'call a number tomorrow'],
  ['call 415 555 0132 or 415 555 0199', 'call a number or a number'],
  // Spelled-out numbers, 7+ digits.
  ['four one five five five five zero one seven seven', 'a number'],
  ['call four one five five five five zero one seven seven', 'call a number'],
  ['her number is five five five, oh one three two', 'her number is a number'],
  ['Call Four-One-Five Five-Five-Five Zero-One-Three-Two now', 'Call a number now'],
  ['call 415 five five five 0132', 'call a number'],
  ['call four one five 555 0132', 'call a number'],
  ['call eight six seven five three oh nine.', 'call a number.'],
  // Emails said out loud.
  ['email name at example dot com', 'email an email address'],
  ['email jo dot lee at example dot com today', 'email an email address today'],
  ['write to Jo AT Example DOT Com', 'write to an email address'],
  ['email jo (at) example (dot) com', 'email an email address'],
  ['email jo [at] example [dot] org', 'email an email address'],
  ['email jo(at)example.com', 'email an email address'],
  ['email jo at mail dot example dot co dot uk', 'email an email address'],
  ['email jo_lee99 at example dot io please', 'email an email address please'],
  ['email jo@example.com the form', 'email an email address the form'],
  ['call 415 555 0132 or Vet@Example.COM', 'call a number or an email address'],
];

const MUST_NOT_BLANK: readonly string[] = [
  // Dates.
  'rent due 2026-11-01',
  'rent due (2026-11-01)',
  'dentist 2026-10-22 8:30',
  'dentist 2026-10-22T08:30',
  'meet (2026-11-01 8:30) sharp',
  'from 2026-11-01 to 2026-11-05',
  'renew by 11/05',
  'on 11/05/2026',
  'pick up (2) prescriptions on 2026-11-01',
  // Times.
  'call at 3:30',
  'call at (3pm)',
  'pick up 2 bags at 10:30',
  'between 9:00 and 17:30',
  // Money.
  'pay $1,250.00 for the deposit',
  'pay $12,500 by friday',
  'refund of 1,250,000.00 pending',
  // Short reference numbers.
  'room (12)',
  'flight 1234',
  'order 123456 shipped',
  'page (12) of (30)',
  'zip 94107 and (12)',
  'gate 23 at terminal 4',
  'set the thermostat to 68',
  'room ١٢',
  'order ١٢٣٤٥٦',
  // Prose with "at", "dot" and digit words.
  'meet at the dot com party',
  'look at that',
  'look at example.com for the form',
  'stare at the dot on the map',
  'she works at google',
  'meet at noon dot',
  'one two three four five six',
  'one or two of them',
  'take two pills at nine',
  'oh, one more thing',
  'someone oneself ohio',
  'I have five kids and two dogs',
  'the x-ray at 3pm',
  'buy 2 x 4 boards',
  'meet at my dot com office',
  'look at google dot com later',
  'the party at the dot com launch',
  'dinner at my dot com friends place',
  'the deal at example.com ends friday',
  'chapter 7 of nine',
  'call mom at 7',
];

describe('withoutContactDetails', () => {
  it('has enough cases on both sides', () => {
    expect(SHOULD_BLANK.length).toBeGreaterThanOrEqual(40);
    expect(MUST_NOT_BLANK.length).toBeGreaterThanOrEqual(40);
  });

  it.each(SHOULD_BLANK)('blanks %j', (input, expected) => {
    expect(withoutContactDetails(input)).toBe(expected);
  });

  it.each(MUST_NOT_BLANK)('leaves %j as written', (input) => {
    expect(withoutContactDetails(input)).toBe(input);
  });
});
