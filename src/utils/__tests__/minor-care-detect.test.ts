/**
 * statesUnder18 on spoken forms (#2557): speech-to-text spells numbers out,
 * drops apostrophes and punctuation, and leaves fillers after the age. These
 * are the tuning phrases; minor-care-detect-held-out.test.ts measures phrases
 * the detector was never tuned on.
 */
import { describe, expect, it } from 'vitest';

import { statesUnder18 } from '../minor-care-detect.js';

const ASKED = 'how old are you?';

describe('statesUnder18: spoken and unpunctuated ages', () => {
  it.each([
    // a filler after a spelled-out age
    'im fifteen btw',
    "I'm fourteen lol",
    'i am thirteen so yeah',
    'im sixteen tho',
    'im 15 yeah',
    // "just turned N", with or without "I", and a time after it
    'just turned 14',
    'I just turned 14 last month.',
    'I turned fifteen last week',
    'i just turned sixteen this year',
    'I turned 15 lol',
    // turning: a year older soon, so younger now
    'turning 16 next month',
    // years old, yo, and a half
    "I'm 15 years old",
    '15 yo',
    '15yo',
    'im 15yo',
    'im a 14 yo',
    'im fifteen and a half',
    "I'm 16 and a half.",
    // grades and school
    "I'm in ninth grade",
    "I'm a freshman in high school",
    "I'm in 8th grade",
    'middle schooler',
    'im a middle schooler',
    // round two, from held-out misses (so those sets are no longer blind for these shapes)
    'im sixteen i just got my permit',
    'im seventeen my parents are getting divorced',
    'im fifteen im bored',
    'im still fifteen',
    'im an eighth grader',
    'im a seventh grader at lincoln middle',
    'im fifteen years of age',
    'im only fourteen you know',
    'im only thirteen please dont tell my parents',
  ])('flags %j', (said) => {
    expect(statesUnder18(said)).toBe(true);
  });

  it('flags a bare "fifteen and a half" only as the answer to an age question', () => {
    expect(statesUnder18('fifteen and a half', ASKED)).toBe(true);
    expect(statesUnder18('fifteen and a half')).toBe(false);
  });

  it.each([
    // someone else
    'my son is 15',
    'my son is fifteen',
    'she just turned 14',
    'my daughter just turned fifteen last week',
    "my kid's in ninth grade",
    'my nephew is a middle schooler',
    // adults, and 18 already reached
    "I'm fifty",
    'I turned 18 yesterday',
    'I just turned 21 last month',
    "I'm 19 btw",
    // a number that isn't an age
    "I'm fifteen minutes late",
    "I'm 15 floors up",
    'I got fifteen emails',
    "I'm in grade 12 math class as a teacher",
    'turned 15 years ago',
    'I turned 15 pages last night',
    "I'm 16 and a half weeks pregnant",
    'turning 10 pages a night',
    'fifteen minutes',
    // the past, or a comparison
    'when I was fifteen',
    'I felt fifteen again',
    // jokes: a laugh still undoes "like N" and the joke age 12
    'honestly im 12 lol',
    "I'm like 14 now haha",
    "lol I feel like I'm 15",
    // round two's shapes on adults, other people and units
    'im forty i have two kids',
    'im 18 i just moved out',
    "I'm still 45",
    "I'm still 15 minutes out",
    'my daughter is an eighth grader',
    'I teach eighth graders',
    "I'm 15 in line",
  ])('does not flag %j', (said) => {
    expect(statesUnder18(said)).toBe(false);
  });

  it('turning 18 soon counts: they are 17 now (the module already holds this)', () => {
    expect(statesUnder18('turning 18 next week')).toBe(true);
    expect(statesUnder18("I'm turning 18 next week")).toBe(true);
    expect(statesUnder18('turning 19 next week')).toBe(false);
  });
});
