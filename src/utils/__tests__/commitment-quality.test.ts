import { beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_CHARS,
  actionableCommitment,
  commitmentAction,
  isActionableCommitment,
  judgeCommitment,
  toSecondPerson,
} from '../commitment-quality.js';

describe('isActionableCommitment', () => {
  const rejected = [
    // The two stored for the owner on prod (2026-10-18), as captured and as summarised.
    "I'll call her tomorrow.",
    'call her tomorrow',
    "I'll catch you later.",
    'catch you later',
    // Sign-offs and pleasantries.
    'talk soon',
    "I'll talk to you later",
    'see you',
    'see ya tomorrow',
    'take care',
    'bye',
    'Okay, bye bye!',
    "I'll let you go, take care",
    'I need to go',
    "I'm gonna head out",
    'good night',
    // No action verb, or only a stance.
    "I'll be fine",
    "I'll think about it",
    "I'll try",
    'dinner',
    // Only a bare pronoun to act on.
    "I'll text him back",
    "I'm going to do it this week",
    'I need to figure it out',
    "I'll call you tomorrow",
    'finish that by Friday',
    'tell them',
  ];
  const kept = [
    'send Mindy the photos',
    'call mom on Sunday',
    'finish the deck by Friday',
    'see my doctor next week',
    "I'll call my sister on Sunday",
    "I'm going to email the landlord tomorrow",
    'I need to start journaling every night',
    "I'm going to the gym tonight",
    'off to dinner with my sister',
    'exercise daily',
    // Near-misses that share a word with a sign-off or a pronoun.
    'bypass the toll road',
    'see your dentist',
    "I'll take care of the bills",
    "I'll run to the store",
    "I'll call her mom about the party",
    "I'll plan the goodbye party for Sam",
  ];

  it.each(rejected)('rejects %j', (s) => {
    expect(isActionableCommitment(s)).toBe(false);
  });

  it.each(kept)('keeps %j', (s) => {
    expect(isActionableCommitment(s)).toBe(true);
  });
});

describe('actionableCommitment', () => {
  it('names the person a bare her/him/them was about, when the writer knows', () => {
    expect(actionableCommitment("I'll call her tomorrow", { person: 'Mindy' })).toBe(
      "I'll call Mindy tomorrow"
    );
    expect(actionableCommitment('text him back', { person: 'dad' })).toBe('text dad back');
    expect(actionableCommitment('Remind them about the rent', { person: 'roommates' })).toBe(
      'Remind roommates about the rent'
    );
    // Her as a possessive is not the person: "her mom" stays.
    expect(actionableCommitment("I'll call her mom about the party", { person: 'Mindy' })).toBe(
      "I'll call her mom about the party"
    );
  });

  it('cannot name what "it" or "you" was, so still rejects those', () => {
    expect(actionableCommitment("I'll do it", { person: 'Mindy' })).toBeNull();
    expect(actionableCommitment("I'll call you tomorrow", { person: 'Mindy' })).toBeNull();
    expect(actionableCommitment("I'll call her", { person: 'her' })).toBeNull();
  });

  it('keeps an actionable statement word for word', () => {
    expect(actionableCommitment('  send Mindy the photos ', { person: 'Sam' })).toBe(
      'send Mindy the photos'
    );
  });
});

describe('commitmentAction', () => {
  it('is null for what judgeCommitment rejects', () => {
    expect(commitmentAction("I'll catch you later.")).toBeNull();
    expect(commitmentAction("I'll call her tomorrow.")).toBeNull();
  });

  it('takes off the lead-in, fillers and trailing punctuation, and keeps their words', () => {
    expect(commitmentAction("Yeah so I'm gonna just email the landlord, I guess.")).toBe(
      'email the landlord'
    );
    expect(commitmentAction('I need to see my doctor next week!!')).toBe('see my doctor next week');
    expect(commitmentAction('off to dinner with my sister')).toBe('off to dinner with my sister');
  });
});

describe('toSecondPerson', () => {
  it('turns their first person into "you", whole words only', () => {
    expect(toSecondPerson('call my mom and tell her I miss her')).toBe(
      'call your mom and tell her you miss her'
    );
    expect(toSecondPerson('mymail cleanup')).toBe('mymail cleanup');
  });
});

describe('caller text cannot make the patterns run away', () => {
  const pathological = [
    `${' ,'.repeat(5000)}x`,
    `${', '.repeat(5000)}lol x`,
    `${'ok '.repeat(3500)}x`,
    `I'll ${'probably '.repeat(1200)}x`,
    `see you ${'later '.repeat(1800)}x`,
    `${'bye, '.repeat(2500)}x`,
    `call ${'her '.repeat(3000)}x`,
    `${'my me '.repeat(2000)}x`,
    `${'I will '.repeat(1500)}`,
  ];

  // The parser's first call loads its lexicon; time the patterns, not that.
  beforeAll(() => {
    judgeCommitment('send Mindy the photos');
  });

  it.each(pathological.map((s) => [s.slice(0, 24), s]))('%j... finishes in under 50 ms', (_, s) => {
    let best = Infinity; // best of three: the work done, not a scheduler or GC pause
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      judgeCommitment(s, { person: 'Mindy' });
      commitmentAction(s);
      toSecondPerson(s);
      best = Math.min(best, performance.now() - started);
    }
    expect(best).toBeLessThan(50);
  });

  it('judges only the first MAX_CHARS characters', () => {
    expect(MAX_CHARS).toBe(300);
    const long = `${'send Mindy the photos and '.repeat(20)}`;
    expect(actionableCommitment(long)?.length).toBeLessThanOrEqual(MAX_CHARS);
  });
});
