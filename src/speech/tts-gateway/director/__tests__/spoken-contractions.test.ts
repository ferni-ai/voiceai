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
});
