/**
 * The shared contact-data rule, tested once, adversarially. The leak and ordinary
 * corpora merge both independent verifiers' files: #2975 (call-sheet renderer, rounds
 * 2 and 3) and #2978 (facts store value matrix). Every number is fictional (555-01xx).
 */
import { describe, expect, it } from 'vitest';
import { containsContactData, isContactValueAllowed, toE164 } from '../contact-data.js';

const SEP = (c: string) => ['727', '555', '0142'].join(c);

const PHONES: Array<[string, string]> = [
  ['spaces', 'call Pat back on 727 555 0142'],
  ['dots', 'call Pat on 727.555.0142'],
  ['parens', 'call Pat on (727) 555-0142'],
  ['plain', 'call Pat on 7275550142'],
  ['plus', 'call Pat on +1 727 555 0142'],
  ['seven digits', 'call Pat on 5550142'],
  ['seven dashed', 'reach him at 555-0142'],
  ['spaced singles', '5 5 5 0 1 4 2'],
  ['ext', 'call Pat on 727 555 0142 ext 12'],
  ['fullwidth', 'call Pat on ７２７５５５０１４２'],
  ['fullwidth spaced', 'call Pat on ７２７ ５５５ ０１４２'],
  ['arabic-indic', 'call Pat on ٧٢٧٥٥٥٠١٤٢'],
  ['arabic-indic spaced', 'call Pat on ٧٢٧ ٥٥٥ ٠١٤٢'],
  ['arabic-indic dashed', 'call Pat on ٧٢٧-٥٥٥-٠١٤٢'],
  ['extended arabic-indic', 'call Pat on ۷۲۷۵۵۵۰۱۴۲'],
  ['devanagari', 'call Pat on ७२७५५५०१४२'],
  ['mixed scripts', 'call Pat on 727 ٥٥٥ ０１４２'],
  ['mixed scripts unspaced', 'call Pat on 727٥٥٥०१४२'],
  ['circled', 'call Pat on ⑦②⑦⑤⑤⑤⓪①④②'],
  ['superscript', 'call Pat on ⁷²⁷⁵⁵⁵⁰¹⁴²'],
  ['subscript', 'call Pat on ₇₂₇₅₅₅₀₁₄₂'],
  ['math bold', '𝟓𝟓𝟓𝟎𝟏𝟒𝟐'],
  ['tabs and newlines', 'call Pat on 727\t555\n0142'],
  ['word joiner and space', 'call Pat on 5⁠ 5⁠ 5⁠ 0 1 4 2'],
  ['zwj between every digit', '5‍5‍5‍0‍1‍4‍2'],
  ['spelled', 'call Pat on five five five zero one four two'],
  ['spelled with oh', 'five five five oh one four two'],
  ['spelled hyphenated', 'five-five-five-zero-one-four-two'],
  ['spelled and typed', 'call me five five five 0142'],
  ['spelled ten', 'call Pat on seven two seven five five five zero one four two'],
  ['a year inside a phone', 'call Pat on (727) 012-2019'],
  ['a phone after a date', 'on 2026-10-20 call 555 0142'],
  ['a phone behind a dollar sign', 'send $5550142 to 7275550142'],
  ['comma groups behind a dollar sign', '$727,555,0142'],
  // a currency sign never masks part of a number (security review of #C1)
  ['money then dashes', 'send $555-0142'],
  ['money then dashes and more', 'send $555-0142-123'],
  ['money comma groups', '$555,014,2123'],
  ['money comma group then digits', '$555,014 2123'],
  ['money after digits', 'call 727 555 $0142'],
  ['small money then digits', 'pay $72 7555 0142'],
  ['money with a space', '$ 555 0142'],
  // an amount holds at most 6 whole digits (push security review)
  ['large signed amount', 'send $5550142123'],
  ['large grouped amount', 'send $5,550,142,123'],
  ['amount over six whole digits', 'wire $7,275,550'],
  // cents count toward the 6-digit cap: "$55,501.42" holds 555-0142
  ['amount with cents over six digits', 'wire $55,501.42'],
  ['bare cents amount', '$5,550,142.00'],
  // space-joined years and times no longer hide a number (third review)
  ['years then digits', 'call 1955 2014 0142'],
  ['two years', 'call 1987 2015'],
  ['year list', 'call 1987, 2015, 2020'],
  ['times', 'call 12:30 14:20 01:42'],
  ['date then digits', 'call 2026-10-20 0142'],
  ['date in an unkept shape', 'call 5550/01/42'],
  ['a range of three years', 'call 1987-2015-2020'],
];
const SEPARATORS: Array<[string, string]> = [
  ['nbsp', ' '],
  ['narrow nbsp', ' '],
  ['ideographic space', '　'],
  ['zwsp', '​'],
  ['zwnj', '‌'],
  ['word joiner', '⁠'],
  ['soft hyphen', '­'],
  ['bidi mark', '‎'],
  ['bom', '﻿'],
  ['slash', '/'],
  ['underscore', '_'],
  ['hyphen U+2010', '‐'],
  ['nb hyphen', '‑'],
  ['figure dash', '‒'],
  ['en dash', '–'],
  ['em dash', '—'],
  ['bar', '―'],
  ['minus', '−'],
  ['fullwidth hyphen', '－'],
  ['bullet', '•'],
  ['middle dot', '·'],
  ['pipe', '|'],
  ['plus', '+'],
  ['colon', ':'],
  ['comma', ','],
  ['asterisk', '*'],
  ['tilde', '~'],
  ['hash', '#'],
];
const EMAILS = [
  'jo@example.com',
  'jane＠example.com',
  'jane﹫example.com',
  'jo＠example．com',
  'jane​@​example.com',
  'jane%40example.com',
  'jane&#64;example.com',
  'jo(at)example.com',
  'jane (at) example (dot) com',
  'jo [at] example [dot] com',
  'jo {at} example.com',
  'mail jo at example dot com',
  'JANE AT EXAMPLE DOT COM',
  'jo AT example DOT com',
  'jo at example.com',
  'jo at example.co.uk',
  'jo at  example . com',
  'jo at example . com',
  'jo at example. com',
  'jo at example dot c0m',
  'jo at example.cοm', // Greek omicron TLD
  'jo at exаmple.com', // Cyrillic a in the domain
  'jo ａｔ example ｄｏｔ com', // full-width words
  'jo a​t example dot com', // zero-width inside "at"
  'email jo at gmail',
  'email jo at gmail.',
  'jo at gmail, she answers fast',
  'jo at Yahoo dot',
  'jo at protonmail',
  'jo at the.com', // a determiner is excluded only before a space
  'jo at my.org',
  'jo at example. co.uk', // or before another ".label"
];

describe('containsContactData: every leak shape is caught', () => {
  it.each(PHONES)('phone: %s', (_label, text) => {
    expect(containsContactData(text)).toBe(true);
  });
  it.each(SEPARATORS)('phone separated by %s', (_label, sep) => {
    expect(containsContactData(`call Pat on ${SEP(sep)}`)).toBe(true);
  });
  it('email: any 2+ letter label after ". " ending the text ("jo at example. co")', () => {
    expect(containsContactData('jo at example. co')).toBe(true);
    expect(containsContactData('write to jo at example. co')).toBe(true);
  });
  it.each(EMAILS)('email: %s', (text) => {
    expect(containsContactData(text)).toBe(true);
    expect(containsContactData(`write to ${text} later`)).toBe(true);
  });
});

// Both verifiers' false-positive lists (#2975 r2/r3, #2978) plus the r3 sentence break.
const ORDINARY = [
  'meet Jo at noon',
  'dinner at the lake house',
  'call back in 15 minutes',
  'ask how the 5k went',
  '7:30-8:45',
  'meet 7:30-8:45 at the gym',
  'we lost 3-2',
  'score was 3-2, then 4-1',
  'ages 4, 6, 9 and 11',
  'ages 4, 6, 9, 11',
  'room 12, floor 3, seat 4',
  'dinner at 6:30 pm, movie at 9:15',
  'gate 12, seat 14A',
  '2 to 3 weeks',
  'lost 15 lbs in 12 weeks',
  '3 kids, 2 dogs, 1 cat',
  '3 kids, 2 dogs',
  'on 10/20',
  'on Oct 20, 2026',
  'back by 10-11pm',
  'called twice at 3 and 4 pm',
  '2 or 3 or 4 apartments at 1200 a month',
  'tickets 2 x 45 dollars',
  'weighs 180 lbs, 6 ft 2',
  'order #12345',
  'chapter 7, page 12 to 45',
  '15 minutes',
  '3 kids',
  'Room 101',
  'meet at 3 at the cafe on 5th street',
  'dinner at 7:30 at Luigi',
  'call back at 6',
  'looking at 2 or 3 apartments',
  'Pat at work',
  'sits at a desk',
  'flight at 8 am, gate 12 and seat 14',
  'born in 1985',
  'lives at 221 Baker Street',
  'a 10 year plan',
  'meet at the dot com office',
  'visit at example parks',
  'on 2026-10-20 at 3pm',
  'ran 5 miles at 6 am for 45 minutes',
  'she is at university',
  'at the end of the day',
  'lunch at Panera dot',
  'chat at Yahoo office',
  'meet at gmail HQ',
  'works at Apple dot',
  'mom at home. Dad at work',
  'She was at work. Busy week',
  'she was at work. busy week',
  'Jo at Work Smith',
  "Ann-Marie O'Neil",
  'two dogs and 3 cats',
  'ran 5k in 2026',
  // #2978 ordinary values, and their neighbours
  'born in 1987, moved 2015',
  "mom's 70th birthday is June 5th, 2026",
  'save $15,000 by 2027',
  'run the 2027-04-19 marathon',
  'appointment with Dr. Patel on 2026-11-03',
  'takes 20 mg daily since 2024',
  'likes the 1985 film, 2nd viewing',
  'married June 12, 2010',
  'graduated 2008, started at Acme 2015',
  '1-800-Flowers',
  '3M',
  '7-Eleven',
  'VP of Engineering since 2019',
  'lives at 1245 Oak St, 33701',
  'wedding anniversary 06/12/2010',
  '03/14/1987',
  '1987-03-14',
  'March 14, 1987',
  '14 March 1987',
  '1987-3-14',
  '1987-03-14T00:00:00Z',
  'March 14th',
  '3/14',
  'bought the house in 2019 for $450,000',
  'beagle named Biscuit, adopted 2021',
  'runs 5k most mornings, PR 21:45',
  'flight UA 1234 on 11/03',
  'kid is 7, other kid is 11',
  'lives in apt 12B',
  'blood pressure 128/82',
  'St. Petersburg',
  // the two kept run shapes: one full date, one two-year range
  'lived there 2015-2019',
  'lived there 1998–2004',
  'paid € 2,400.50 on 2026-10-20',
  'on ٢٠٢٦-١٠-٢٠',
  'on ２０２６-１０-２０',
  'oh, one more thing',
  'no one knows',
  'paid $1,234.56 on 2026-10-20',
  '$999,999',
];
// Ordinary-looking values that are refused, each with its reason (see the PR body).
const REFUSED = [
  // "<word> at <word> dot com" is exactly how an address is dictated ("jo at example dot com").
  'wait at home dot com stuff',
  // "at" a mail provider with no place noun after it reads as "jo at gmail".
  'Pat works at Yahoo now',
  // 7 whole digits: an amount that large could be a phone number ("$5,550,142").
  'sold for $1,250,000',
  // 7 digits with the cents: the same shape as "$55,501.42". Rare; refused the safe way.
  'paid $12,345.67',
  // Fail closed (#3009 third review): a 7+ digit run is kept only when it is exactly one
  // full date (YYYY-MM-DD, MM/DD/YYYY) or one two-year range (1987-2015).
  'meeting 12:00-1:30', // a time range: no allowance for times
  'on 2026-10-20 15:30', // a date and a time in one run
  '1987/03/14', // YYYY/MM/DD is neither kept date shape
  'born 1987, 2015 moved', // two years in a list, not a dash range
  'from 10/20-10/25', // two short dates in one run
  // "X at Y. Z" at the very end of the text reads as "jo at example. co".
  'Pat was at work. Busy',
];

// Kept in a prompt, refused as a stored fact: a stored free-text value may hold at most
// 6 digits in total, however letters split them. Dates belong in typed fields
// (validFrom, a birthday attribute), not in free text.
const STORED_REFUSED = [
  '2 or 3 or 4 apartments at 1200 a month',
  'on 2026-10-20 at 3pm',
  'born in 1987, moved 2015',
  "mom's 70th birthday is June 5th, 2026",
  'save $15,000 by 2027',
  'run the 2027-04-19 marathon',
  'appointment with Dr. Patel on 2026-11-03',
  'graduated 2008, started at Acme 2015',
  'lives at 1245 Oak St, 33701',
  'wedding anniversary 06/12/2010',
  '03/14/1987',
  '1987-03-14',
  '1987-3-14',
  '1987-03-14T00:00:00Z',
  'bought the house in 2019 for $450,000',
  'flight UA 1234 on 11/03',
  'lived there 2015-2019',
  'lived there 1998–2004',
  'paid € 2,400.50 on 2026-10-20',
  'on ٢٠٢٦-١٠-٢٠',
  'on ２０２６-１０-２０',
  'paid $1,234.56 on 2026-10-20',
];

describe('containsContactData: ordinary values are kept', () => {
  it.each(ORDINARY)('keeps %j', (text) => {
    expect(containsContactData(text)).toBe(false);
  });
  it.each(REFUSED)('refuses %j (reason in the list above)', (text) => {
    expect(containsContactData(text)).toBe(true);
  });
});

describe('isContactValueAllowed and toE164: the facts store exceptions', () => {
  it('a phone attribute holds only an E.164 number', () => {
    expect(toE164('(727) 555-0142')).toBe('+17275550142');
    expect(toE164('1-727-555-0142')).toBe('+17275550142');
    expect(toE164('+44 20 7946 0142')).toBe('+442079460142');
    expect(toE164('555-0142')).toBeNull();
    expect(toE164('٧٢٧٥٥٥٠١٤٢')).toBeNull();
    expect(isContactValueAllowed('phone', '(727) 555-0142')).toBe(true);
    expect(isContactValueAllowed('phone', 'jo@example.com')).toBe(false);
  });
  it('a stored value refuses 7+ digits in total, however letters split them', () => {
    const split = [
      'call 555 then 0142',
      'five five five and zero one four two',
      'ask 727, 555, or 0142',
      'born 1987, zip 33701 and $0142',
      'on 10/20 pay $555 at 01:42',
      'born 1987 and 1988 and 0142', // years are not discounted next to other digits
    ];
    for (const v of split) {
      expect(containsContactData(v), v).toBe(false); // the prompt guard reads runs only
      expect(isContactValueAllowed('other', v), v).toBe(false);
    }
    expect(isContactValueAllowed('other', 'paid $1,234.56')).toBe(true); // 6 digits
    expect(isContactValueAllowed('other', 'since 2019, 12 kids')).toBe(true); // 6 digits
    for (const v of ORDINARY.filter((t) => !STORED_REFUSED.includes(t)))
      expect(isContactValueAllowed('other', v), v).toBe(true);
    for (const v of STORED_REFUSED) expect(isContactValueAllowed('other', v), v).toBe(false);
  });
  it('a birthday may be exactly one ISO date; nothing else with 7+ digits is stored', () => {
    expect(isContactValueAllowed('birthday', '1960-04-12')).toBe(true);
    expect(isContactValueAllowed('birthday', '1987-03-14')).toBe(true);
    expect(isContactValueAllowed('birthday', '04-12')).toBe(true); // 4 digits
    for (const v of ['03/14/1987', '1987-3-14', '1987-03-14T00:00:00Z', '1987-13-01', '5550-14-21'])
      expect(isContactValueAllowed('birthday', v), v).toBe(false);
    expect(isContactValueAllowed('other', '1987-03-14')).toBe(false); // only a birthday
    for (const attr of ['other', 'city', 'employer', 'pet', 'goal', 'birthday']) {
      expect(isContactValueAllowed(attr, '727-555-0142'), attr).toBe(false);
      expect(isContactValueAllowed(attr, 'jane at example dot com'), attr).toBe(false);
      expect(isContactValueAllowed(attr, 'born in 1987, moved 2015'), attr).toBe(false);
    }
  });
});

describe('containsContactData: long input', () => {
  it('a long run of date-like groups is read in linear time and counts as dialable', () => {
    const started = performance.now();
    expect(containsContactData(`${'12-'.repeat(5_000)}12`)).toBe(true);
    expect(containsContactData(`${'12/12/12 '.repeat(5_000)}12`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(50);
  });
  it('stays linear on long unbroken strings (no regex backtracking blow-up)', () => {
    const started = Date.now();
    for (const s of [
      'word.'.repeat(40_000),
      `${'a.'.repeat(40_000)} at b`,
      `${'x.'.repeat(30_000)}x at y`,
    ])
      expect(containsContactData(s)).toBe(false);
    expect(containsContactData(`${'x'.repeat(70)} at example dot com`)).toBe(true);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
