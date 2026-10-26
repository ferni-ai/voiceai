import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeForSpeech } from '../normalize.js';
import { spokenContractionsEnabled } from '../spoken-contractions.js';

const say = (text: string): string => normalizeForSpeech(text).text;

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Ferni's own lines from the 2026-10-21 humanness red team on dev (#2334). */
const RED_TEAM_LINES: ReadonlyArray<readonly [string, string]> = [
  ['That is a massive shift.', "That's a massive shift."],
  ["It is a lot, even when you say it's fine.", "It's a lot, even when you say it's fine."],
  [
    'No, I am not going to say your feelings are valid.',
    "No, I'm not going to say your feelings are valid.",
  ],
  ['It is not dumb.', "It's not dumb."],
  [
    'Ugh, four emails and nothing? That is incredibly frustrating.',
    "Ugh, four emails and nothing? That's incredibly frustrating.",
  ],
  [
    'Well, I am currently hiding from my reading glasses.',
    "Well, I'm currently hiding from my reading glasses.",
  ],
];

describe('SPOKEN_CONTRACTIONS', () => {
  it('is off unless set to on', () => {
    expect(spokenContractionsEnabled({})).toBe(false);
    expect(spokenContractionsEnabled({ SPOKEN_CONTRACTIONS: 'true' })).toBe(false);
    expect(spokenContractionsEnabled({ SPOKEN_CONTRACTIONS: 'on' })).toBe(true);
  });

  it.each(RED_TEAM_LINES)('off: %s is spoken exactly as written', (line) => {
    expect(normalizeForSpeech(line)).toEqual({ text: line, count: 0 });
  });

  it.each(RED_TEAM_LINES)('on: %s', (line, contracted) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(contracted);
  });

  it('on: counts each contraction for the shadow log', () => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(normalizeForSpeech('I am sure it is not that bad.').count).toBe(2);
  });

  it('on: "I will not" is "I won\'t" and "that is not" is "that\'s not"', () => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say('I will not tell anyone, and that is not a joke.')).toBe(
      "I won't tell anyone, and that's not a joke."
    );
  });

  it.each([
    // Clause-final: nothing follows, so "you're." would break English.
    "I'm ready when you are.",
    'Tell me who you are.',
    // A comma follows: "that is" here means "in other words".
    'That is, I think so.',
    // Stressed: the caller should hear the emphasis.
    'I am NOT going back there.',
    // Inside a word, not a pair.
    'The edit is notable.',
    // Markup is never touched.
    'It is <break time="200ms"/> a lot.',
  ])('on: leaves %s as written', (line) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(line.replace('NOT', 'not'));
  });

  /** Lead verifier's FAIL on 7dcd5c688 (PR #2347): each was contracted at a stranded spot. */
  it.each([
    'Who you are matters.',
    'I like who you are now.',
    'I know where it is now.',
    'I wonder how old they are today.',
    'I lost track of where that is anymore.',
    'I will tomorrow.',
    'Look at what there is to do.',
    'It is as easy as it is now.',
  ])('on: a stranded auxiliary keeps the full form: %s', (line) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(normalizeForSpeech(line)).toEqual({ text: line, count: 0 });
  });

  it('on: "That is who I am today" contracts only the pair with a complement', () => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say('That is who I am today.')).toBe("That's who I am today.");
  });

  it.each([
    ['I am *not* going.', 'I am not going.'],
    ['It is _really_ hard.', 'It is really hard.'],
    ['*It is* a lot.', 'It is a lot.'],
  ])('on: emphasis keeps the full form: %s', (line, spoken) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(spoken);
  });

  it.each([
    ['I will call you after.', "I'll call you after."],
    ['They are so tired.', "They're so tired."],
    ['You are right about that.', "You're right about that."],
    ['There is a dog outside.', "There's a dog outside."],
    ['I am still here.', "I'm still here."],
  ])('on: a complement after the auxiliary still contracts: %s', (line, contracted) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(contracted);
  });
});
