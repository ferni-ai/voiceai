/**
 * safety-talk is the one reader for "does this sentence name an emergency
 * service or a help line?" (reachesHelp) and "is it safety talk?" (isSafetyTalk).
 * It must never be narrower than the readers it replaces, and it fails closed:
 * the overmatches below are the price. All lines are fictional.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { offersCrisisLine } from '../crisis-line-speech.js';
import { CRISIS_RESOURCES } from '../crisis-response.js';
import { OTHER_HELP_LINES } from '../other-help-lines.js';
import { EMERGENCY_SERVICE, isCareTalk, isSafetyTalk, reachesHelp } from '../index.js';

type Reader =
  | 'service'
  | 'offersCrisisLine'
  | 'namesSafetyLine'
  | 'lineCallerDials'
  | 'reachesHelp'
  | 'isSafetyTalk'
  | 'isCareTalk';
/**
 * Every string an old reader matched, pinned so the new one is never narrower:
 * emergency-claim's SERVICE (EMERGENCY_SERVICE, read lower-case), offersCrisisLine,
 * #3499's namesSafetyLine (at 8d122af2b), #3500's lineCallerDials (at 4e227ce9f,
 * closed, read as a whole `who`), and #3483's reachesHelp, isSafetyTalk and
 * isCareTalk (at 726c79e70). Three of them are not on main, so their hits are
 * kept here. Computed 2026-11-06 over those readers' own tests, main's
 * action-claim and crisis-line tests, the scripts/crisis-eval corpus and
 * labelled cases, and the lines the crisis verifies listed; #3483's reachesHelp
 * also over CUT_ROWS and SHOUT_ROWS below. Re-run 2026-11-07: #3483's reader (`git show
 * 726c79e70:src/services/safety/safety-talk.ts`) over this file's whole line set (525)
 * reads exactly the pinned reachesHelp list (271), 0 extra and 0 missing. notHelp: the only
 * strings an old reader matched that the new one leaves, each with the reason.
 */
const PINNED = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/safety-talk-corpus.json'), 'utf8')
) as Record<Reader, string[]> & { notHelp: Record<string, string> };
const NEW: Record<Reader, (t: string) => boolean> = {
  service: reachesHelp,
  offersCrisisLine: reachesHelp,
  namesSafetyLine: reachesHelp,
  lineCallerDials: reachesHelp,
  reachesHelp,
  isSafetyTalk,
  isCareTalk,
};
const SERVICE = new RegExp(EMERGENCY_SERVICE);
/**
 * One line per family the #3565 r2 verify found an old reader read and this one
 * missed: a service name then walk, film or case as a verb; SHOUT or NAMI in
 * capitals, or Shout opening a sentence that says what it is; an emergency number
 * then "people" or "times".
 */
const CUT_ROWS = [
  'The police walk you through what happens next.',
  'Paramedics film the scene so the hospital knows what they saw.',
  'Samaritans walk you through it, one step at a time.',
  'The police case the area before they come in.',
  'Paramedics walk you out if you can stand.',
  'A crisis counselor walks you through the next hour.',
  'The hotline walks you through a safety plan.',
  'SHOUT is free and confidential.',
  "I'd recommend SHOUT for this.",
  "In the UK there's SHOUT, free and confidential.",
  'Shout is free and confidential.',
  "Shout's free and confidential.",
  'NAMI walks families through the first visit.',
  'The 999 people will talk you through it.',
  'The 999 people know exactly what to do.',
  'Call 999 times like this need it.',
];
/**
 * One line per form of the family the #3565 r3 verify found #3483 read and this one missed: Shout
 * in its own case opening a sentence, a verb that does not say what it is, no contact word. Also
 * Shout after a colon, and SHOUT with such a verb.
 */
const SHOUT_ROWS = [
  'Shout replies within a few minutes.',
  'Shout sends a reply in minutes.',
  'Shout picked up on the first ring.',
  'Shout calmed me down last spring.',
  'Shout gave my brother a plan for the weekend.',
  'Her tip: Shout answered her within minutes.',
  "SHOUT replied before I'd even put the kettle on.",
];
/** The CUT_ROWS no old reader (EMERGENCY_SERVICE, #3483) reads; only the CUT_ROWS test pins them. */
const NO_OLD_READER = new Set([
  'A crisis counselor walks you through the next hour.',
  'The hotline walks you through a safety plan.',
  'NAMI walks families through the first visit.',
]);
const CORPUS_DIR = join(__dirname, '../../../../scripts/crisis-eval/corpus');

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('never narrower than an old reader', () => {
  it.each(Object.keys(NEW) as Reader[])('reads every string %s read', (reader) => {
    const hits = PINNED[reader].filter((t) => !(t in PINNED.notHelp));
    expect(hits.length).toBeGreaterThan(80);
    expect(hits.filter((t) => !NEW[reader](t))).toEqual([]);
  });

  it('reads whatever offersCrisisLine or EMERGENCY_SERVICE reads in the crisis-eval corpus', () => {
    const corpus = readdirSync(CORPUS_DIR).flatMap((f) =>
      strings(JSON.parse(readFileSync(join(CORPUS_DIR, f), 'utf8')))
    );
    const read = corpus.filter((t) => offersCrisisLine(t) || SERVICE.test(t.toLowerCase()));
    expect(read.length).toBeGreaterThan(10);
    expect(read.filter((t) => !reachesHelp(t))).toEqual([]);
  });

  it('reads every help line that EMERGENCY_SERVICE or #3483 read', () => {
    const lines = [
      ...new Set([
        ...(Object.keys(NEW) as Reader[]).flatMap((r) => PINNED[r]),
        ...CUT_ROWS,
        ...SHOUT_ROWS,
      ]),
    ].filter((t) => !(t in PINNED.notHelp));
    const oldRead = lines.filter(
      (t) => SERVICE.test(t.toLowerCase()) || PINNED.reachesHelp.includes(t)
    );
    expect(oldRead.length).toBeGreaterThan(250);
    // every family the cut fixed (verbs, SHOUT/Shout, "999 people"), so undoing any one goes red
    expect(oldRead).toEqual(expect.arrayContaining(CUT_ROWS.filter((t) => !NO_OLD_READER.has(t))));
    expect(oldRead).toEqual(expect.arrayContaining(SHOUT_ROWS));
    expect(oldRead.filter((t) => !reachesHelp(t))).toEqual([]);
  });

  it('leaves only amounts, times, labels and stories an old reader matched', () => {
    for (const t of [
      ...Object.keys(PINNED.notHelp),
      // SERVICE reads any 999, 112 or "police"; these are a count and a story
      '999 problems',
      'I owe 112 dollars.',
      'the police drama',
      // #3483 reads any Shout in its own case; a film named Shout is a story, like the police drama
      'We saw the Shout movie last night.',
    ]) {
      expect(isSafetyTalk(t), t).toBe(false);
    }
    expect(SERVICE.test('999 problems')).toBe(true);
  });
});

describe('the lines the crisis verifies found missing', () => {
  it.each([
    // #3483 round 3: lines the ledger named
    'You can text HOME any time.',
    'The Trevor Project is there all night.',
    'Telefonseelsorge is free to call.',
    'SOS Amitie listens day and night.',
    'Befrienders Worldwide lists a line near you.',
    // #3500 rounds 1 and 3: lines Ferni offered to call for the caller
    'the suicide prevention line',
    'suicide prevention',
    'RAINN',
    'NAMI',
    'SAMHSA',
    'Childhelp',
    'the Trevor Project',
    'a crisis counselor',
    'the warmline',
    '1-800-273-TALK',
    'nine eight eight',
    '741741',
    'the ER',
    'A&E',
    'urgent care',
    'Trans Lifeline',
    'Veterans Crisis Line',
    'a DV hotline',
    'nine-eight-eight',
    '9 8 8',
    'Crisis Text Line',
    'text HOME to 741741',
    'Text CONNECT to 686868.',
    'Text START to 678678.',
  ])('reaches help: %s', (text) => {
    expect(reachesHelp(text)).toBe(true);
  });

  it.each([
    'Stay right here with me.',
    'Hold onto something cold.',
    'Hand the keys to your friend.',
    "You've survived every hard day so far.",
    'Can you get away from the tracks?',
  ])('safety talk: %s', (text) => {
    expect(isSafetyTalk(text)).toBe(true);
  });
});

describe('reads the lines from the kernel lists', () => {
  const resources = Object.values(CRISIS_RESOURCES).flat();

  it.each(resources.map((r) => [r.name]))('CRISIS_RESOURCES by name: %s', (name) => {
    expect(reachesHelp(`You could reach ${name}.`)).toBe(true);
  });

  it.each(OTHER_HELP_LINES.flatMap((l) => [l.name, ...(l.aka ?? [])]))(
    'OTHER_HELP_LINES by name: %s',
    (name) => {
      expect(reachesHelp(`You could reach ${name}.`)).toBe(true);
    }
  );

  it('by the short name a line starts with', () => {
    for (const short of ['RAINN', 'NAMI', 'SAMHSA', 'Childhelp']) {
      expect(reachesHelp(`Have you tried ${short}?`), short).toBe(true);
    }
  });

  it('by every phone and text number, and every texted word', () => {
    const numbers = [
      ...resources.flatMap((r) => [r.phone, r.text]),
      ...OTHER_HELP_LINES.flatMap((l) => l.numbers),
    ]
      .map((s) => (s ?? '').replace(/[^\d -]/g, '').trim())
      .filter((d) => d.replace(/\D/g, '').length >= 3);
    expect(numbers.length).toBeGreaterThan(15);
    for (const n of numbers) expect(reachesHelp(`The number is ${n}.`), n).toBe(true);
    for (const k of OTHER_HELP_LINES.flatMap((l) => l.keyword ?? []))
      expect(reachesHelp(`You can text ${k} any time.`), k).toBe(true);
  });

  it('knows "Shout" and "NAMI" by their capitals, or beside a contact or help word', () => {
    for (const t of [
      'Shout is there by text, day or night.',
      'You could try Shout tonight.',
      'NAMI',
      'Have you tried NAMI?',
      'You can text shout to 85258.',
      'nami has a helpline you can call.',
      'Reach the Nami helpline any weekday.',
      'Shout is free and open all night.',
    ])
      expect(reachesHelp(t), t).toBe(true);
    for (const t of [
      "Don't shout, it's fine.",
      'We heard a shout from the garden.',
      "Nami said she'd bring the cake.",
      'My friend Nami is visiting.',
      'nami loves sushi.',
    ])
      expect(reachesHelp(t), t).toBe(false);
  });
});

describe('a verb or a role after the number or the name still names the line', () => {
  it.each([
    '999 works anywhere in the UK.',
    '112 works across Europe, even without a SIM.',
    '999 gets help to you fast.',
    '999 operators answer in seconds.',
    '112 dispatchers speak English too.',
    'Nine one one operators are trained for this.',
    '000 connects you in Australia.',
    'The 999 calls go straight to a dispatcher.',
    'The paramedics show up within minutes.',
    'The police show up quickly here.',
    'An ambulance runs lights all the way.',
    'EMS runs around the clock.',
    'Samaritans run a line all night.',
    'The police game it out with you on the phone.',
    'The French line is 09.72.39.40.50.',
  ])('reaches help: %s', (text) => {
    expect(reachesHelp(text)).toBe(true);
  });

  it.each([
    'I walked 999 steps today.',
    "That's 112 miles from here.",
    'It took 112 days.',
    'We drove 111 kilometres.',
    'Room 112 is upstairs.',
    'Flight 999 is delayed.',
    "It's 9.11 miles to the lake.",
    'We meet at 9.11 am.',
    'The app is 9.99 a month.',
    'She scored 1.12 on the quiz.',
  ])('no help: %s', (text) => {
    expect(reachesHelp(text)).toBe(false);
  });
});

describe('the lines the #3565 r2 verify found missing', () => {
  it.each(CUT_ROWS)('reaches help: %s', (text) => {
    expect(reachesHelp(text)).toBe(true);
  });

  // Lower-case "shout" with no contact word: neither EMERGENCY_SERVICE nor #3483 reads it.
  it.each([
    "Don't shout, it's fine.",
    'I shout at the TV',
    'shout is free and confidential.',
    'shout replies within a few minutes.',
  ])('no help: %s', (text) => {
    expect(reachesHelp(text)).toBe(false);
  });
});

describe('the lines the #3565 r3 verify found missing', () => {
  it.each(SHOUT_ROWS)('reaches help: %s', (text) => {
    expect(reachesHelp(text)).toBe(true);
  });
});

describe('ordinary talk is no safety talk', () => {
  it.each([
    'call the hotel',
    'the police drama',
    'We watched that police procedural again.',
    'the NAMI gala was fun',
    'my warmline mug',
    'a police drama',
    "I'm going home",
    "I'll text home when I land.",
    'my friend Trevor',
    '999 problems',
    'I owe 112 dollars.',
    'Flight 112 leaves at noon.',
    'Room 111 is on the left.',
    'The flight is $911 round trip.',
    'The kiln sounds wonderful.',
    "That's a big step.",
    "That's $120 for the lot.",
    'We moved here in 2019.',
    'Take bus 101 downtown.',
    "I'll call you back at 6.",
    'It cost $1,000 in the end.',
    'The party is at 9:11 sharp.',
    'the fire was lovely',
    'I called my mom.',
    'Route 66 is a long drive.',
    'Order 98812 shipped today.',
  ])('%s', (text) => {
    expect(isSafetyTalk(text)).toBe(false);
  });
});

describe('fails closed on ordinary lines that share the words', () => {
  it.each([
    // offersCrisisLine reads it, and the new reader is never narrower
    'nine eight eight dollars',
    'Hope from the hotline team at work called.',
    "Sam from Samaritan's Purse dropped by.",
    'the customer service hotline',
    'My bank is 1-800-555-0100.',
    'She was a lifeline for the shop.',
    'He works in the ER.',
    "It's not an emergency.",
    'I need the police report for the insurance.',
    'the police station front desk',
    'Call 411 for the number.',
    // walk, case, people and times name the line as often, so these read too
    'the Samaritans walk on Sunday',
    'the NAMI walk was fun',
    'my warmline phone case',
    '999 people attended',
    'There were 999 people in line.',
    // Shout in its own case is the line anywhere, as #3483 reads it, so these read too
    'Shout out to my sister for the cake!',
    'Shout if you need a hand with the boxes.',
    "Shout louder if you can't hear me.",
    'Shout when the kettle boils.',
    'Shout it out if you know the answer.',
  ])('reaches help: %s', (text) => {
    expect(reachesHelp(text)).toBe(true);
  });

  it.each([
    'Please tell me more.',
    'Right now the garden is a mess.',
    'Take a breath, the week is over.',
  ])('safety talk: %s', (text) => {
    expect(isSafetyTalk(text)).toBe(true);
  });
});
