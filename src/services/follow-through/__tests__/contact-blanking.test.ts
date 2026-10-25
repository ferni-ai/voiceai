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
  // A match kept as prose doesn't hide the address after it.
  ['email her at jo dot me at gmail dot com', 'email her at an email address'],
  ['met Sarah at jo dot kim at gmail dot com', 'met Sarah at an email address'],
  // A dotted or many-part name is always an address.
  ['jo.kim at example dot org', 'an email address'],
  ['email ana at dot dot org', 'email an email address'],
  ['email ana (at) dot dot dev', 'email an email address'],
  ['ask the jo dot kim at example dot org', 'ask the an email address'],
  // A mailbox word is a name like any other.
  ['contact at acme dot com', 'an email address'],
  ['write to info at acme dot io', 'write to an email address'],
  ['email us at acme dot com', 'email an email address'],
  ['jobs at acme dot com is open', 'an email address is open'],
  ['hello at acme dot dev', 'an email address'],
  ['support at acme.com', 'an email address'],
  // Sending something to a name at a domain makes it an address, written dot or not.
  ['email kofi at acme.com', 'email an email address'],
  ['reach kofi at acme.com today', 'reach an email address today'],
  ['send the deck to kofi at acme.com', 'send the deck to an email address'],
  ['jane at acme.com', 'an email address'],
  ['email interns at apple.com', 'email an email address'],
  ['write to staff at acme.com', 'write to an email address'],
  ['met jane at gmail.com', 'met an email address'],
  // A phone number shaped like a date range is a number.
  ['call 2026-2027-1234', 'call a number'],
  ['call 2026-2027', 'call a number'],
  ['call 2026/2040', 'call a number'],
  ['call 2027/2026', 'call a number'],
  ['call 1999/2000/2001', 'call a number'],
  ['call 555/555/0199', 'call a number'],
  ['call 2026-10-24–2032-12-30', 'call a number'],
  ['call 2026-10-24-2026-10-25-2026-10-26', 'call a number'],
  // Seven said digits are a number, counting or not.
  ['one two three four five six seven', 'a number'],
  ['five five five one two one two', 'a number'],
  // Emails: a written dot after a plain "at", a spaced or fullwidth "@", any ending.
  ['email jane at gmail.com', 'email an email address'],
  ['email jane at mail.example.co.uk today', 'email an email address today'],
  ['email jane @ gmail.com today', 'email an email address today'],
  ['email jane@ gmail.com', 'email an email address'],
  ['email jane＠gmail.com', 'email an email address'],
  ['email jane ＠ gmail．com', 'email an email address'],
  ['email jo at example dot tv', 'email an email address'],
  ['email jo at example dot xyz', 'email an email address'],
  ['email jo at example dot app', 'email an email address'],
  ['email jo at example dot ai', 'email an email address'],
  ['email jo at example dot dev', 'email an email address'],
  ['email jo at example dot studio', 'email an email address'],
  ['email jane at acme dot io', 'email an email address'],
  ['email jane at acme dot co dot uk', 'email an email address'],
  ['email jo at example dot co', 'email an email address'],
  ['email jo (at) example (dot) shop', 'email an email address'],
  ["email o'brien at gmail dot com", 'email an email address'],
  ['email Sarah at google dot com', 'email an email address'],
  // Phones: any dash, a slash, an underscore or a backslash between the groups.
  ['call 415/555/0132', 'call a number'],
  ['call 415–555–0132', 'call a number'],
  ['call 415—555—0132 now', 'call a number now'],
  ['call 415‐555‐0132', 'call a number'],
  ['call 415−555−0132', 'call a number'],
  ['call 415_555_0132', 'call a number'],
  ['call 415 \\ 555 \\ 0132', 'call a number'],
  ['call 415\\555\\0132', 'call a number'],
  ['call (415)/555/0132', 'call a number'],
  // Said digits: "o" for zero, and groups split by ";" or a dash.
  ['four one five five five five o one seven seven', 'a number'],
  ['call four one five; five five five; oh one three two', 'call a number'],
  ['call four one five – five five five – o one three two', 'call a number'],
  // A year counts when the said digits aren't a count.
  ['call five five five 2026', 'call a number'],
  ['call four one five 555 2026', 'call a number'],
];

/**
 * The leak floor: each of these was blanked by #2716 (bee3589df) and must stay
 * blanked. The first ones were let through by a guard or a match that used up
 * the name ("her at ana dot ruiz" hid "ana dot ruiz at gmail dot com").
 */
const LEAK_FLOOR: ReadonlyArray<readonly [string, string]> = [
  ['send the deck to anna and kofi at gmail dot com', 'send the deck to anna and an email address'],
  ['cc with kofi at gmail dot com', 'cc with an email address'],
  ['lunch with kofi at gmail dot com', 'lunch with an email address'],
  ['email her at ana dot ruiz at gmail dot com', 'email her at an email address'],
  ['call him at jo dot kim at yahoo dot com', 'call him at an email address'],
  ['write to us at sales dot team at acme dot com', 'write to an email address'],
  ['reach me at jo at gmail dot com', 'reach me at an email address'],
  ['contact us at info at acme dot com today', 'contact us at an email address today'],
  ['look at jo dot lee at example dot com', 'look at an email address'],
  // Said digits that don't count up from one (or down to one) are a number, year or not.
  ['four five six 2026', 'a number'],
  ['nine eight seven 2024', 'a number'],
  ['two three four five six seven 2026', 'a number'],
  ['zero one two 2026', 'a number'],
  ['five four three 2026', 'a number'],
  ['one two three 2026 0132', 'a number'],
  // A said digit is never a domain ending, so the number before "(at)" still goes whole.
  ['call 415 555 0132 (at) six dot two', 'call a number (at) six dot two'],
];

/**
 * Main before #2716 left these as written, but each is blanked now, on purpose:
 * an "@" with a domain is never prose, seven said digits are a number, and two
 * bare years joined by a dash are a number. A rare over-blank, never a leak.
 */
const OVER_BLANKED: ReadonlyArray<readonly [string, string]> = [
  ['lunch @ cafe.co tomorrow', 'an email address tomorrow'],
  ['dinner @ noodle.bar friday', 'an email address friday'],
  ['the 1999–2000 season', 'the a number season'],
  ['seven six five four three two one liftoff', 'a number liftoff'],
  ['one two three four five six seven eight', 'a number'],
];

/**
 * The keep floor: main before #2716 left each of these as written, and none is
 * a contact, so they stay as written.
 */
const KEEP_FLOOR: readonly string[] = [
  // A shop or workplace at a written domain, with no address before "at".
  'Bought shoes at zappos.com',
  'got tickets at ticketmaster.com for friday',
  'booked rooms at hotels.com',
  'ordered flowers at ftd.com for mom',
  'found deals at target.com',
  'interns at apple.com start monday',
  'students at mit.edu got in',
  // A said "dot" that isn't a domain.
  'She looked great at polka dot night',
  'mortgage rates at six dot two percent',
  'we upgrade at three dot oh',
  'release at two dot one dot three',
  'We grabbed tea at bluebottle dot cafe',
  'good at math dot period',
  'kids at grandma dot dot dot',
  'kids at grandma dot dot dot later',
  'good at math dot dot dot later',
  // "or at", "and at": no name before "at", so no address.
  'find us online or at acme dot com',
  'tickets are sold here and at acme dot com',
  // Years and date ranges.
  'the 2026/2027 school year',
  'fiscal 2025/2026 budget',
  'trip 2026-10-24–2026-10-30',
  'trip 10/24/2026-10/30/2026',
  'trip 10/24/2026 – 10/30/2026',
  // Counting, with or without a year.
  'remember steps three two one, 2027 kickoff',
  'one, two, three, 2026, 2027',
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
  // A company at a domain is where someone is, not an address.
  "he's at amazon dot com",
  'she’s at google dot com now',
  "mom's at work dot com today",
  'lunch at netflix dot com',
  'job interview at google dot com',
  'met Sarah at google dot com',
  'saw Jo at example dot com',
  'the deal at example.com ends friday',
  'look at jane dot com',
  'polka dot dress at the shop',
  'meet at noon dot then lunch',
  'meet @ 5.30',
  // A count with a year after it.
  'steps one, two, three, 2026 plan',
  'steps one, two, three, 2026',
  'three two one, 2026 here we go',
  'at five o’clock',
  "at five o'clock",
  // Slashed dates and ranges with dashes.
  'on 11/05/2026',
  'from 11/05/2026 to 11/12/2026',
  'on 2026/11/05',
  'dentist 2026–10–22',
  'pages 100–250',
  'tickets 3/4',
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

  it.each(LEAK_FLOOR)('still blanks %j, as #2716 did', (input, expected) => {
    expect(withoutContactDetails(input)).toBe(expected);
  });

  it.each(KEEP_FLOOR)('leaves %j as main did', (input) => {
    expect(withoutContactDetails(input)).toBe(input);
  });

  it.each(OVER_BLANKED)('blanks %j, on purpose', (input, expected) => {
    expect(withoutContactDetails(input)).toBe(expected);
  });

  // A long text is matched whole: nothing is cut, so a contact anywhere in it
  // goes, whatever surrounds it (no gap between words, emoji, CJK).
  it.each([
    ['words', 'we talked about the garden and the weather for a while '],
    ['emoji', '🙂🌿🙂🌿'],
    ['cjk', '中さんによろしく'],
    ['dashes', '— – — '],
    ['caps', 'OK! SURE! '],
  ])('blanks a contact at any offset in a long text of %s', (_name, filler) => {
    for (const contact of [
      '415 555 0132',
      'jo dot lee at example dot com',
      'jane @ gmail.com',
      'four one five five five five o one seven seven',
    ]) {
      for (let pad = 1_900; pad <= 2_110; pad += 5) {
        const lead = filler.repeat(Math.ceil(pad / filler.length)).slice(0, pad);
        const out = withoutContactDetails(`${lead} call ${contact} soon`);
        expect(out).not.toMatch(/\p{Nd}/u);
        expect(out).not.toMatch(/\b(?:jo|lee|example|jane|gmail|seven)\b/);
      }
    }
  });

  // Each of these took seconds on a 100k text before every pattern tried at most
  // once per word with bounded repeats; now each is a few ms.
  it.each([
    ['said dots', 'dot '.repeat(25_000)],
    ['one run of letters', 'a'.repeat(100_000)],
    ['dotted letters', 'a.'.repeat(50_000)],
    ['brackets after a digit', `1${'('.repeat(99_999)}`],
    ['at and dot', 'x at y dot '.repeat(9_000)],
    ['a dotted name', 'jo dot '.repeat(14_300)],
    ['kept addresses', 'lunch at netflix dot com '.repeat(4_000)],
    ['a chain of addresses', 'jo at x dot com '.repeat(6_250)],
    ['spaced @', 'a @ '.repeat(25_000)],
    ['said digits', 'one '.repeat(25_000)],
  ])(
    'stays linear on 100k chars of %s',
    (_name, text) => {
      const start = performance.now();
      withoutContactDetails(text);
      expect(performance.now() - start).toBeLessThan(1_000);
    },
    30_000
  );
});
