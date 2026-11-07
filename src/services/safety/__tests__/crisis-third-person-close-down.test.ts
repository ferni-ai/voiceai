/**
 * Someone close fell or collapsed, and nothing else is said about it (owner, 2026-11-07): "my dad
 * collapsed", "my wife fainted". That is imminent, and the reply leads with 911 for them, the same
 * kernel reply "fell and can't get up" gets. Read by thirdPartyEmergency (crisis-third-person.ts).
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';
import { EMERGENCY_FOR_THEM } from '../crisis-guard-replies.js';

const OPENER = 'hey, can I tell you about something going on with my family?';
const firstAndMid = (line: string) => [
  detectCrisis(line),
  detectCrisis(line, undefined, { recentMessages: [OPENER] }),
];

const VERBS = ['fell', 'collapsed', 'fainted', 'passed out', 'blacked out', 'went down'];
const CLOSE = [
  ...['dad', 'mom', 'father', 'mother', 'grandma', 'grandpa', 'brother', 'sister'],
  ...['son', 'daughter', 'kid', 'wife', 'husband', 'partner', 'boyfriend', 'girlfriend'],
  ...['friend', 'roommate'],
];
const SHAPES: Record<string, (who: string, verb: string) => string> = {
  plain: (who, verb) => `my ${who} ${verb}`,
  just: (who, verb) => `my ${who} just ${verb}`,
  'on the floor': (who, verb) => `my ${who} ${verb} on the floor`,
  'in the kitchen': (who, verb) => `my ${who} ${verb} in the kitchen`,
  'just, on the floor': (who, verb) => `my ${who} just ${verb} on the floor`,
};

/** What "my dad fell and is not moving" reads today: the line every new row must match. */
const expectEmergencyForThem = (line: string) => {
  for (const read of firstAndMid(line)) {
    expect(read.severity, line).toBe(0.9);
    expect(read.subject, line).toBe('third_party');
    expect(read.indicators, line).toEqual(
      expect.arrayContaining(['third_party_emergency', 'imminent_danger'])
    );
    const guard = guardFromDetection(read);
    expect(guard.shouldBlock, line).toBe(true);
    expect(guard.replacementResponse, line).toBe(EMERGENCY_FOR_THEM);
  }
  expect(crisisRead(line), line).toBe(true);
};

/** How main reads a line with no risk in it: nothing at all. */
const expectNothing = (line: string) => {
  for (const read of firstAndMid(line)) {
    expect(read.severity, line).toBe(0);
    expect(read.subject, line).toBeUndefined();
    expect(read.indicators, line).toEqual([]);
  }
};

describe('someone close went down, with no second clause', () => {
  it('reads the same as a fall with a second clause', () => {
    const reference = detectCrisis('my dad fell and he is not moving');
    const bare = detectCrisis('my dad fell');
    expect(bare.severity).toBe(reference.severity);
    expect(bare.subject).toBe(reference.subject);
    expect(guardFromDetection(bare).replacementResponse).toBe(
      guardFromDetection(reference).replacementResponse
    );
  });

  it.each([
    'my dad collapsed',
    'my dad fell',
    'my mom collapsed',
    'my dad just collapsed',
    'my dad collapsed on the floor',
    'my wife fainted',
    'my dad passed out',
  ])('reads them as imminent, 911 first, first and mid-call: %s', expectEmergencyForThem);

  it.each(VERBS.flatMap((verb) => Object.keys(SHAPES).map((shape) => [verb, shape] as const)))(
    'reads "%s" (%s) for every close person',
    (verb, shape) => {
      for (const who of CLOSE) expectEmergencyForThem(SHAPES[shape](who, verb));
    }
  );

  it.each([
    "my dad's just collapsed",
    'my mom has fallen',
    'our son fell down the stairs',
    'my grandpa fell over in the bathroom',
    'my best friend fainted at the gym',
    'my brother went down hard',
    'my dad collapsed, please help',
    "my dad just collapsed i think he's having a heart attack",
    'help, my mom just fell',
    'my dad collapsed again, he fell last year too',
    'my dad collapsed and he had a stroke last year',
    'my dad collapsed, is he going to be okay',
    "my dad collapsed but he's not fine now",
    'i fell and my dad collapsed',
  ])('reads the everyday ways it is said: %s', expectEmergencyForThem);

  it("keeps the caller's own crisis in the same turn: 911 for them first, then the caller's reply", () => {
    for (const line of [
      'my dad collapsed and i want to kill myself',
      'my mom fell. i want to die',
    ]) {
      for (const read of firstAndMid(line)) {
        expect(read.subject, line).toBe('self');
        expect(read.indicators, line).toEqual(
          expect.arrayContaining(['explicit_crisis_language', 'third_party_emergency'])
        );
        const guard = guardFromDetection(read);
        expect(guard.shouldBlock, line).toBe(true);
        const reply = guard.replacementResponse ?? '';
        expect(reply.startsWith(EMERGENCY_FOR_THEM.split('\n\n')[0]), line).toBe(true);
        expect(reply.indexOf('911'), line).toBeLessThan(reply.indexOf('988'));
      }
    }
  });

  it.each([
    // A compound place, or a fall seconds ago (#3587 round 2).
    'my dad fell on the kitchen floor',
    'my mom collapsed on the bathroom floor',
    'my wife fainted on the living room floor',
    'my dad fell in the kitchen floor',
    'my grandpa fell on the bathroom floor just now',
    'my dad fell seconds ago',
    'my mom collapsed moments ago',
    'my dad just fell a few seconds ago',
  ])('reads a compound place or a moment ago: %s', expectEmergencyForThem);
});

describe('words that only look like a fall stay as main reads them', () => {
  it.each([
    'I fell asleep',
    'my dad fell for it',
    'the market collapsed',
    'my phone fell',
    'my dad fell asleep on the couch',
    'my mom passed out flyers',
    'my dad went down to the store',
    // Not a fall that happened: a maybe, a near miss, an object or a direction.
    'if my dad fell',
    'what if my mom collapsed',
    'even if my dad fell he would be fine',
    'my dad nearly fainted',
    'my dad collapsed the tent',
    'my dad went down the stairs',
    'my son went down for a nap',
    'my dad fell in love',
    'my dad fell hard for her',
    'my dad fell down on the job',
    'my mom fell asleep in the kitchen',
    'my dad passed out on the couch',
    // A pronoun alone is a story about someone, not a call about them.
    'she collapsed',
  ])('%s', expectNothing);
});

describe('a fall long ago, or one they are fine from, is not imminent (owner, 2026-11-07)', () => {
  it.each([
    "my dad fell last year and he's fine now",
    // Each guard on its own, so dropping either one turns a row red.
    'my dad fell last year',
    'my dad fell in 2019',
    'my mom collapsed a few years ago',
    "my dad fell and he's fine now",
    'my mom fainted, she has fully recovered',
    'my dad collapsed, he got better',
    "my grandma fell on the floor last year and she's okay now",
    'my dad fell on the kitchen floor last year',
    "my mom collapsed on the bathroom floor a few years ago and she's fine now",
    "my dad fell seconds ago and he's fine now",
    "my dad fell on the kitchen floor and he's fine now",
    'if my dad fell on the kitchen floor',
  ])('%s', expectNothing);
});
