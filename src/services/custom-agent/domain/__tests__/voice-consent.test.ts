/**
 * A voice is cloned only after its owner reads the consent statement aloud, check
 * words included. Names are fictional.
 */
import { describe, expect, it } from 'vitest';
import {
  buildConsentStatement,
  CHECK_WORDS,
  consentWords,
  MIN_COVERAGE,
  scoreConsentTranscript,
} from '../voice-consent.js';

/** Steps through [0, 1) so each pick is predictable. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const forMaya = buildConsentStatement({
  subjectName: 'Rosa Quill',
  creatorName: 'Maya Quill',
  spokenDate: 'November 1, 2026',
  random: seq(0, 0, 0),
});

describe('buildConsentStatement', () => {
  it('names the subject, who it is for, the date and three distinct check words', () => {
    expect(forMaya.text).toContain('My name is Rosa Quill.');
    expect(forMaya.text).toContain("for Maya Quill's private use");
    expect(forMaya.text).toContain('I can take this back at any time.');
    expect(forMaya.text).toContain('Today is November 1, 2026.');
    expect(forMaya.checkWords).toEqual(['apple', 'bridge', 'candle']);
    expect(forMaya.text.endsWith('My check words are apple, bridge, candle.')).toBe(true);
  });

  it('says "my own use" for a twin of yourself, whatever the casing', () => {
    const self = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: ' rosa  quill ',
      spokenDate: 'November 1, 2026',
      random: seq(0.5),
    });
    expect(self.text).toContain('for my own use');
    expect(new Set(self.checkWords).size).toBe(3);
  });

  it('draws different check words each time with real randomness', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const s = buildConsentStatement({ subjectName: 'A', creatorName: 'A', spokenDate: 'today' });
      s.checkWords.forEach((w) => seen.add(w));
      expect(s.checkWords.every((w) => CHECK_WORDS.includes(w))).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('scoreConsentTranscript', () => {
  it('verifies the statement read back the way speech to text writes it', () => {
    const heard =
      "my name is rosa quill i agree that ferni may make an ai copy of my voice for maya quill's " +
      'private use i can take this back at any time today is november first twenty twenty six ' +
      'my check words are apple bridge candle';
    expect(scoreConsentTranscript(forMaya, heard)).toMatchObject({
      verified: true,
      missingCheckWords: [],
    });
  });

  it('still verifies with a misheard name', () => {
    const heard = forMaya.text.replace('Rosa Quill', 'Rosa Quil');
    expect(scoreConsentTranscript(forMaya, heard).verified).toBe(true);
  });

  it('refuses when a check word is missing (an old recording or a replay)', () => {
    const heard = forMaya.text.replace('candle', 'handle');
    expect(scoreConsentTranscript(forMaya, heard)).toMatchObject({
      verified: false,
      missingCheckWords: ['candle'],
    });
  });

  it('refuses the check words alone, without the statement', () => {
    const score = scoreConsentTranscript(forMaya, 'apple bridge candle');
    expect(score.verified).toBe(false);
    expect(score.coverage).toBeLessThan(MIN_COVERAGE);
  });

  it('matches whole words only', () => {
    const score = scoreConsentTranscript(forMaya, `${forMaya.text.replace(/apple/, 'pineapples')}`);
    expect(score.missingCheckWords).toEqual(['apple']);
  });

  it('refuses a reading that skips too much of the statement, check words and all', () => {
    const heard =
      'my name is rosa quill i agree that ferni may make, my check words are apple bridge candle';
    const score = scoreConsentTranscript(forMaya, heard);
    expect(score.missingCheckWords).toEqual([]);
    expect(score.coverage).toBeGreaterThan(0.5);
    expect(score.coverage).toBeLessThan(MIN_COVERAGE);
    expect(score.verified).toBe(false);
  });

  it('still verifies when a couple of words are dropped', () => {
    const heard = forMaya.text.replace('I can take this back', 'I take it back');
    const score = scoreConsentTranscript(forMaya, heard);
    expect(score.coverage).toBeLessThan(1);
    expect(score.coverage).toBeGreaterThanOrEqual(MIN_COVERAGE);
    expect(score.verified).toBe(true);
  });

  it('does not score the date, however speech to text writes it', () => {
    const heard = forMaya.text.replace('November 1, 2026', '11/1/2026');
    expect(scoreConsentTranscript(forMaya, heard)).toMatchObject({ verified: true, coverage: 1 });
  });

  it('scores "may" in the statement even in May', () => {
    const inMay = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: 'Rosa Quill',
      spokenDate: 'May 2, 2026',
      random: seq(0, 0, 0),
    });
    const full = scoreConsentTranscript(inMay, inMay.text).coverage;
    const noMay = scoreConsentTranscript(
      inMay,
      inMay.text.replace('Ferni may make', 'Ferni make').replace('May 2, 2026', '5/2/2026')
    );
    expect(full).toBe(1);
    expect(noMay.coverage).toBeLessThan(1);
  });

  it('refuses a reading that says no, even with every word and check word in it', () => {
    for (const heard of [
      forMaya.text.replace('I agree', 'I do not agree'),
      `${forMaya.text} But I refuse.`,
      forMaya.text.replace('I agree', "I don't agree"),
      `${forMaya.text} I decline.`,
      forMaya.text.replace('I agree', 'I don\u2019t agree'),
      forMaya.text.replace('I agree', "I didn't agree"),
      `${forMaya.text} Nope.`,
    ]) {
      const score = scoreConsentTranscript(forMaya, heard);
      expect(score.coverage).toBe(1);
      expect(score.missingCheckWords).toEqual([]);
      expect(score.refusals.length).toBeGreaterThan(0);
      expect(score.verified).toBe(false);
    }
  });

  it('has no refusal word in the statement itself', () => {
    expect(scoreConsentTranscript(forMaya, forMaya.text)).toMatchObject({
      verified: true,
      refusals: [],
    });
  });

  it('verifies a subject whose name is a refusal word', () => {
    const forNo = buildConsentStatement({
      subjectName: 'No Min-ji',
      creatorName: 'No Min-ji',
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(scoreConsentTranscript(forNo, forNo.text)).toMatchObject({
      verified: true,
      refusals: [],
    });
  });

  it('still hears a refusal when a name holds the same word', () => {
    const cases: Array<[string, string, (text: string) => string]> = [
      ['Rosa Quill', 'Not Sam', (t) => t.replace('I agree', 'I do not agree')],
      ['Maya Not', 'Maya Not', (t) => t.replace('I agree', 'I do not agree')],
      ['Noa Never', 'Noa Never', (t) => t.replace('I agree', 'I never agree')],
      ['No Min-ji', 'No Min-ji', (t) => `${t} No.`],
    ];
    for (const [subjectName, creatorName, refuse] of cases) {
      const statement = buildConsentStatement({
        subjectName,
        creatorName,
        spokenDate: 'November 1, 2026',
        random: seq(0, 0, 0),
      });
      expect(scoreConsentTranscript(statement, statement.text).verified).toBe(true);
      expect(scoreConsentTranscript(statement, refuse(statement.text)).verified).toBe(false);
    }
  });

  it('refuses an empty transcript', () => {
    expect(scoreConsentTranscript(forMaya, '')).toMatchObject({ verified: false, coverage: 0 });
  });
});

describe('consentWords', () => {
  it('lowercases, keeps whole words, drops numbers and possessive s', () => {
    expect(consentWords("Maya's voice, November 1, 2026.")).toEqual(['maya', 'voice', 'november']);
  });
});
