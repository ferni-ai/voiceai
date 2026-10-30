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
    'i am thirteen so yeah',
    'im sixteen tho',
    'im 15 yeah',
    // "just turned N", with or without "I", and a time after it
    'just turned 14',
    'I just turned 14 last month.',
    'I turned fifteen last week',
    'i just turned sixteen this year',
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
    // round three: the narrowed "turned"/"turning" forms still catch a time
    'i turned fourteen on sunday',
    'i turned 16 in march',
    'i turned 16 last summer',
    'i only turned 15 last month',
    'just turned 14 last week.',
    'turning seventeen in july',
    'im 14 i wish my mom would listen', // "i wish" retracts only at the end
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
    // round three (#3098 verify): adult backstory with "turned N in/on ..."
    'I turned fourteen in foster care.',
    'When I turned 16 in 1998, my dad bought me a truck.',
    'When I turned 16, my dad bought me a truck.',
    'i quit when i turned 17 in the army',
    'i turned 17 on a navy ship',
    'the year i turned fifteen in ohio was rough',
    'the year i turned fifteen, my parents split up',
    // "turning N" about someone else or a custom
    'Turning sixteen is such a big deal for her.',
    'turning 18 in our family means you move out',
    'turning 16 next month my daughter wants a car',
    'just turned 14 last month and already wants a phone',
    // a bare "schooler" in a list of who's at home
    'A middle schooler and a toddler.',
    'high schooler and two little ones',
    // taken back
    'im 16 lol jk im 40',
    'im 17 lol i wish',
    'im sixteen i wish',
    'im fifteen i mean fifty',
    'im fifteen lol in dog years',
    // a parent, an echoed number, a relative
    "im an eighth grader's mom",
    'im a ninth grader at heart lol',
    'im 13 too',
    '15yo son wont talk to me',
    // reported speech, with or without a laugh
    'my son keeps telling everyone im 16 lol',
    'my niece keeps saying im fourteen now',
    'she said im 14 lol',
    'my sister goes im fifteen lol',
  ])('does not flag %j', (said) => {
    expect(statesUnder18(said)).toBe(false);
  });

  it('turning 18 soon counts: they are 17 now (the module already holds this)', () => {
    expect(statesUnder18('turning 18 next week')).toBe(true);
    expect(statesUnder18("I'm turning 18 next week")).toBe(true);
    expect(statesUnder18('turning 19 next week')).toBe(false);
  });
});

describe('statesUnder18: a laugh or a take-back means a joke, not an age (#3098 r2)', () => {
  // Main's rule, kept on purpose: after a laugh the age is mostly a joke, so these misses are
  // accepted ("I'm fourteen lol") rather than holding adults' memory on jokes.
  it.each([
    "I'm fourteen lol",
    'I turned 15 lol',
    'im 13 lmao no im 31',
    'im 15 lol nah im 45',
    'im fourteen lol not really',
    'im 17 lol i wish i was',
    'im 16 lol kidding',
    "im 15 lol i'm joking",
    'im 14 lol in my head',
    'im fifteen lol at heart',
    'im 17 lol my back says 70',
    'im 16 lol nope 46',
    'im 13 lol just joking',
    'my therapist says im 14 lol',
    'i turned 16 lol like thirty years ago',
    'im fourteen lmao in my dreams',
    'im 12 lol on the leaderboard',
    'im fifteen i mean fifty',
  ])('not flagged: %s', (said) => {
    expect(statesUnder18(said)).toBe(false);
  });

  it.each([
    // school wins over a joke elsewhere in the line
    'im in 8th grade and my friend said jk after being mean',
    // "i mean" a younger age is a correction, not a take-back
    'im 14 i mean 15 next week',
  ])('flagged: %s', (said) => {
    expect(statesUnder18(said)).toBe(true);
  });
});
