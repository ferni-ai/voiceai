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
];

describe('containsContactData: every leak shape is caught', () => {
  it.each(PHONES)('phone: %s', (_label, text) => {
    expect(containsContactData(text)).toBe(true);
  });
  it.each(SEPARATORS)('phone separated by %s', (_label, sep) => {
    expect(containsContactData(`call Pat on ${SEP(sep)}`)).toBe(true);
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
  'meeting 12:00-1:30',
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
  '1987/03/14',
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
  // the allowance's own shapes
  'born 1987, 2015 moved',
  'lived there 2015-2019',
  'lived there 1998–2004',
  'sold for $1,250,000',
  'paid € 2,400.50 on 2026-10-20',
  'from 10/20-10/25',
  'on 2026-10-20 15:30',
  'on ٢٠٢٦-١٠-٢٠',
  'on ２０２６-１０-２０',
  'oh, one more thing',
  'no one knows',
];
// Ordinary-looking values that are refused, with the reason (see the PR body).
const REFUSED = [
  // "<word> at <word> dot com" is exactly how an address is dictated ("jo at example dot com").
  'wait at home dot com stuff',
  // "at" a mail provider with no place noun after it reads as "jo at gmail".
  'Pat works at Yahoo now',
];

// Kept in a prompt, refused as a stored fact: 7 digits outside any date, time, year or amount.
const STORED_REFUSED = ['2 or 3 or 4 apartments at 1200 a month'];

describe('containsContactData: ordinary values are kept', () => {
  it.each(ORDINARY)('keeps %j', (text) => {
    expect(containsContactData(text)).toBe(false);
  });
  it.each(REFUSED)('refuses %j (reads as a dictated address)', (text) => {
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
  it('a stored value refuses 7+ loose digits even when letters split them', () => {
    const split = [
      'call 555 then 0142',
      'five five five and zero one four two',
      'ask 727, 555, or 0142',
    ];
    for (const v of split) {
      expect(containsContactData(v), v).toBe(false); // the prompt guard reads runs only
      expect(isContactValueAllowed('other', v), v).toBe(false);
    }
    // digits inside recognised dates, years, times, amounts and an ending ZIP don't count
    for (const v of ORDINARY.filter((t) => !STORED_REFUSED.includes(t)))
      expect(isContactValueAllowed('other', v), v).toBe(true);
    for (const v of STORED_REFUSED) expect(isContactValueAllowed('other', v), v).toBe(false);
  });
  it('a birthday may be a bare date; a phone is refused under every other attribute', () => {
    expect(isContactValueAllowed('birthday', '1960-04-12')).toBe(true);
    expect(isContactValueAllowed('birthday', '04-12')).toBe(true);
    for (const attr of ['other', 'city', 'employer', 'pet', 'goal', 'birthday']) {
      expect(isContactValueAllowed(attr, '727-555-0142'), attr).toBe(false);
      expect(isContactValueAllowed(attr, 'jane at example dot com'), attr).toBe(false);
      expect(isContactValueAllowed(attr, 'born in 1987, moved 2015'), attr).toBe(true);
    }
  });
});

describe('containsContactData: long input', () => {
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
