/**
 * isHeavyMoment: every word of the caller's last two turns, the hard things
 * the older lists missed, and none of the everyday mishaps that are often the
 * funniest thing a caller says.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  forgetCallerTurns,
  isHeavyMoment,
  noteCallerTurn,
  recentCallerTurns,
} from '../heavy-moment.js';

const HEAVY = [
  'lol my grandma passed',
  "I can't do this anymore lol",
  'kill myself lol',
  "my dad's in the ICU haha",
  'my mom started chemo',
  'I got let go today',
  "I'm broke and can't make rent",
  'we got evicted',
  'she left me',
  'we broke up last night',
  'he wants a divorce',
  'I just want to die',
  'what do I even do now??',
  'honestly it feels hopeless',
  'my dog died',
  'my grandpa’s in hospital',
  // The crisis side's words, "lol" or not (2026-10-17 review).
  "i'm suicidal lol",
  'kms lol',
  'I wish I was dead haha',
  'he hits me lol',
  'we lost the baby lol',
  'there is no point lol',
  'my nephew passed',
  'unalive',
  'i dont want to live',
  'my sister relapsed',
  "we're in the ER lol",
  "mom's in ER again lol",
  'I cried all night haha',
  'better off without me',
  'took too many pills',
  'I cut myself again',
  // Loss, illness, work, love and violence the first list missed.
  "my dad's gone",
  'we had to put our dog down',
  'we buried him today',
  'I miss her so much',
  'my mom has dementia',
  'they found a lump',
  "it's stage 4",
  'they let me go today',
  'my boss laid me off',
  'I got canned lol',
  'we split up',
  "we're separated now",
  'she was assaulted',
  'he was abusive',
];
const LIGHT = [
  'I passed my driving test!',
  'the cat knocked my coffee over lol',
  'I spilled soup all over my shirt haha',
  'she left me a voicemail about tacos',
  'what are we doing this weekend??',
  'hahaha you are ridiculous',
  // Idioms that only sound hard.
  "I'm dying laughing",
  'i almost died laughing',
  'i nearly died lol',
  'my phone died lol',
  'my battery died',
  'the plant died lol',
  'that killed me',
  'dead tired',
  'he passed me the salt',
  'she passed her exam',
  'my sister passed her driving test',
  'fired up',
  'crying laughing',
  'tears of joy',
  'let me go grab a coffee',
  'beats me lol',
  "it's not brain surgery lol",
  'so er, I forgot again lol',
];

afterEach(() => forgetCallerTurns('hm'));

describe('isHeavyMoment', () => {
  it('reads hard news, despair and self-harm as heavy, laughing or not', () => {
    for (const t of HEAVY) expect(isHeavyMoment([t]), t).toBe(true);
  });

  it('leaves light turns and everyday mishaps light', () => {
    for (const t of LIGHT) expect(isHeavyMoment([t]), t).toBe(false);
  });

  it('reads the whole turn: grief more than 12 words before the end still counts', () => {
    const long =
      'so my grandma passed on Tuesday and then the whole family flew in and we ended up eating way too much pie at the house haha';
    expect(long.split(' ').length).toBeGreaterThan(20);
    expect(isHeavyMoment([long])).toBe(true);
  });

  it('looks back over the last two turns, and no further', () => {
    expect(isHeavyMoment(['my dad died last week', 'haha anyway'])).toBe(true);
    expect(isHeavyMoment(['my dad died last week', 'yeah', 'haha anyway'])).toBe(false);
    expect(isHeavyMoment([undefined, 'haha anyway'])).toBe(false);
  });
});

describe('the caller turns kept per session', () => {
  it('keeps a heavy turn when the next one only starts with its words', () => {
    noteCallerTurn('hm', 'she left me');
    noteCallerTurn('hm', 'she left me a voicemail lol');
    expect(recentCallerTurns('hm')).toEqual(['she left me', 'she left me a voicemail lol']);
    expect(isHeavyMoment(recentCallerTurns('hm'))).toBe(true);
  });

  it('with turn ids, merges only the same turn', () => {
    noteCallerTurn('hm', 'she left', 3);
    noteCallerTurn('hm', 'she left me', 3);
    expect(recentCallerTurns('hm')).toEqual(['she left me']);
    noteCallerTurn('hm', 'she left me alone with the dishes', 4);
    expect(recentCallerTurns('hm')).toEqual(['she left me', 'she left me alone with the dishes']);
    noteCallerTurn('hm', 'she left me alone with the dishes', 5);
    expect(recentCallerTurns('hm')).toHaveLength(2);
  });

  it('keeps the latest two, and a partial grown into the final is one turn', () => {
    noteCallerTurn('hm', 'my dad');
    noteCallerTurn('hm', 'my dad died last week');
    expect(recentCallerTurns('hm')).toEqual(['my dad died last week']);
    noteCallerTurn('hm', 'haha anyway');
    noteCallerTurn('hm', 'so what are you up to');
    expect(recentCallerTurns('hm')).toEqual(['haha anyway', 'so what are you up to']);
    forgetCallerTurns('hm');
    expect(recentCallerTurns('hm')).toEqual([]);
  });
});
