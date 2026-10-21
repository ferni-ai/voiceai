import { beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_CHARS,
  commitmentLine,
  isActionableCommitment,
  judgeCommitment,
  needsContext,
  toSecondPerson,
} from '../commitment-quality.js';

describe('isActionableCommitment', () => {
  const rejected = [
    // One of the two stored for the owner on prod (2026-10-18), as captured and as summarised.
    "I'll catch you later.",
    'catch you later',
    // Sign-offs and pleasantries, every part of the line.
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
    "I'll be fine",
    "I'll think about it",
    "I'll try",
    // No verb at all.
    'dinner',
  ];
  const kept = [
    // A pronoun is never a reason to drop one: the reader decides how to show it.
    "I'll call her tomorrow.",
    "I'll text him back",
    "I'm going to do it this week",
    'finish that by Friday',
    'send Mindy the photos',
    'call mom on Sunday',
    'finish the deck by Friday',
    'see my doctor next week',
    "I'm going to email the landlord tomorrow",
    "I'm going to the gym tonight",
    'off to dinner with my sister',
    'exercise daily',
    // Near-misses that share a word with a sign-off.
    'bypass the toll road',
    'see your dentist',
    "I'll take care of the bills",
    "I'll run to the store",
    "I'll plan the goodbye party for Sam",
    // A goodbye after words that name something is kept: the gate only drops what it is sure of.
    'my sister lands at six, I need to go',
  ];

  it.each(rejected)('rejects %j', (s) => {
    expect(isActionableCommitment(s)).toBe(false);
  });

  it.each(kept)('keeps %j', (s) => {
    expect(isActionableCommitment(s)).toBe(true);
  });
});

/** The statement judgeCommitment keeps, or null. */
const actionableCommitment = (s: string, context?: { person?: string }): string | null => {
  const verdict = judgeCommitment(s, context);
  return verdict.ok ? verdict.statement : null;
};

describe('actionableCommitment', () => {
  it('names the person her/him/them was about, when the writer knows', () => {
    expect(actionableCommitment("I'll call her tomorrow", { person: 'Mindy' })).toBe(
      "I'll call Mindy tomorrow"
    );
    expect(actionableCommitment('text him back', { person: 'dad' })).toBe('text dad back');
    expect(actionableCommitment("I'll text her back after lunch", { person: 'Mindy' })).toBe(
      "I'll text Mindy back after lunch"
    );
    expect(actionableCommitment('Remind them about the rent', { person: 'roommates' })).toBe(
      'Remind roommates about the rent'
    );
    // Her as a possessive is not the person: "her mom" stays.
    expect(actionableCommitment("I'll call her mom about the party", { person: 'Mindy' })).toBe(
      "I'll call her mom about the party"
    );
  });

  it('keeps the line as said when there is no person, or the "person" is a pronoun', () => {
    expect(actionableCommitment("I'll do it", { person: 'Mindy' })).toBe("I'll do it");
    expect(actionableCommitment("I'll call her", { person: 'her' })).toBe("I'll call her");
    expect(actionableCommitment('  send Mindy the photos ', { person: 'Sam' })).toBe(
      'send Mindy the photos'
    );
  });
});

describe('commitmentLine and needsContext', () => {
  it('is null for what judgeCommitment rejects', () => {
    expect(commitmentLine("I'll catch you later.")).toBeNull();
  });

  it('takes off the lead-in, fillers and trailing punctuation, and keeps their words', () => {
    expect(commitmentLine("Yeah so I'm gonna just email the landlord, I guess.")).toEqual({
      text: 'email the landlord',
      whole: false,
    });
    expect(commitmentLine('I need to see my doctor next week!!')?.text).toBe(
      'see my doctor next week'
    );
    expect(commitmentLine("I'm going to the gym tonight")?.text).toBe('go to the gym tonight');
  });

  it('keeps the whole line when the words before the lead-in name what it is about', () => {
    const line = commitmentLine("I owe Tom fifty bucks, I'll pay him back Friday.");
    expect(line).toEqual({ text: "I owe Tom fifty bucks, I'll pay him back Friday", whole: true });
    expect(line && needsContext(line)).toBe(false);
  });

  it('says a line needs context when its object is a bare her/him/them/it/that', () => {
    const shown = (s: string) => {
      const line = commitmentLine(s);
      return line && !needsContext(line) ? line.text : null;
    };
    expect(shown("I'll call her tomorrow")).toBeNull();
    expect(shown("I'll pay it Thursday")).toBeNull();
    expect(shown("I'm gonna do that tonight")).toBeNull();
    expect(shown("I'll call her mom about the party")).toBe('call her mom about the party');
    expect(shown("I'll fix that noise in the car")).toBe('fix that noise in the car');
    expect(shown('send Mindy the photos')).toBe('send Mindy the photos');
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

  // best of three: the work done, not a scheduler or GC pause
  const bestOfThree = (s: string): number => {
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      judgeCommitment(s, { person: 'Mindy' });
      commitmentLine(s);
      toSecondPerson(s);
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };

  // The limit is relative to a short ordinary sentence timed on the same machine.
  // A fixed 50 ms failed a loaded CI runner with coverage on (198 ms for linear
  // work) and ejected PRs from the merge queue. Healthy, these inputs cost up to
  // ~10x the short sentence; anything worse than linear costs over 200x more on
  // the 300-character input than on this 21-character one.
  let limit = 50;
  beforeAll(() => {
    judgeCommitment('send Mindy the photos'); // first call loads the lexicon
    limit = Math.max(50, 30 * bestOfThree('send Mindy the photos'));
  });

  it.each(pathological.map((s) => [s.slice(0, 24), s]))(
    '%j... finishes within 30x a short sentence',
    (_, s) => {
      expect(bestOfThree(s)).toBeLessThan(limit);
    }
  );

  it('judges only the first MAX_CHARS characters', () => {
    expect(MAX_CHARS).toBe(300);
    const long = `${'send Mindy the photos and '.repeat(20)}`;
    expect(actionableCommitment(long)?.length).toBeLessThanOrEqual(MAX_CHARS);
  });
});
