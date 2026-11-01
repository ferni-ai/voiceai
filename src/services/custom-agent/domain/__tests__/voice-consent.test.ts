/**
 * A voice is cloned only after its owner reads the consent statement aloud, check
 * words included. Names are fictional.
 */
import { describe, expect, it } from 'vitest';
import { buildConsentStatement, CHECK_WORDS, scoreConsentTranscript } from '../voice-consent.js';
import { consentWords } from '../heard-words.js';

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
    expect(forMaya.text).toContain('I can withdraw this consent at any time.');
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
  const verifies = (statement: typeof forMaya, heard: string) =>
    scoreConsentTranscript(statement, heard).verified;

  it('verifies the statement read exactly', () => {
    expect(scoreConsentTranscript(forMaya, forMaya.text)).toEqual({
      verified: true,
      mismatch: null,
      missingCheckWords: [],
    });
  });

  it('verifies the statement read back the way speech to text writes it', () => {
    const heard =
      'my name is um rosa quill i agree that ferni may make an a i copy of my voice for maya quill’s ' +
      'private use i can withdraw this consent at anytime today is sunday november first twenty twenty six ' +
      'my check words are apple bridge candle';
    expect(verifies(forMaya, heard)).toBe(true);
  });

  it('verifies whatever form the date comes back in', () => {
    expect(verifies(forMaya, forMaya.text.replace('November 1, 2026', '11/1/2026'))).toBe(true);
    expect(
      verifies(forMaya, forMaya.text.replace('November 1, 2026', 'the first of November'))
    ).toBe(true);
  });

  it('verifies a name heard a little wrong, joined or split', () => {
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'Rosa Quil'))).toBe(true);
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'Rosaquill'))).toBe(true);
    const minji = buildConsentStatement({
      subjectName: 'Kim Min-ji',
      creatorName: 'Kim Min-ji',
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(minji, minji.text.replace('Min-ji', 'Minji'))).toBe(true);
    expect(verifies(minji, minji.text.replace('Min-ji', 'Min ji'))).toBe(true);
  });

  it('refuses when a check word is missing or misheard (an old recording or a replay)', () => {
    expect(scoreConsentTranscript(forMaya, forMaya.text.replace('candle', 'handle'))).toMatchObject(
      { verified: false, mismatch: 'the check words', missingCheckWords: ['candle'] }
    );
    expect(
      scoreConsentTranscript(forMaya, forMaya.text.replace('apple', 'pineapples'))
    ).toMatchObject({ verified: false, missingCheckWords: ['apple'] });
  });

  it('refuses the check words alone, or an empty reading', () => {
    expect(scoreConsentTranscript(forMaya, 'apple bridge candle')).toMatchObject({
      verified: false,
      mismatch: 'your name',
    });
    expect(verifies(forMaya, '')).toBe(false);
  });

  // The verifier's adversarial readings: each holds every check word, and none is consent
  it.each([
    ['a skipped "I agree"', (t: string) => t.replace('I agree that ', '')],
    ['the agreement skipped', (t: string) => t.replace(/I agree.*any time\. /, '')],
    ['"she agrees"', (t: string) => t.replace('I agree', 'She agrees')],
    ['"I do not agree"', (t: string) => t.replace('I agree', 'I do not agree')],
    ['"I don’t agree"', (t: string) => t.replace('I agree', 'I don’t agree')],
    ['"I never agree"', (t: string) => t.replace('I agree', 'I never agree')],
    ['"I can\'t withdraw"', (t: string) => t.replace('I can withdraw', "I can't withdraw")],
    ['"I cannot withdraw"', (t: string) => t.replace('I can withdraw', 'I cannot withdraw')],
    [
      'on behalf of someone',
      (t: string) => t.replace('My name is', 'On behalf of my mom, my name is'),
    ],
    ['a condition', (t: string) => t.replace('private use.', 'private use, unless she asks.')],
    ['"I take this back" after', (t: string) => `${t} I take this back.`],
    ['"I changed my mind" after', (t: string) => `${t} Actually, I changed my mind.`],
    ['a withdrawal in another language', (t: string) => `${t} Je retire mon consentement.`],
    ['"stop" in the middle', (t: string) => t.replace('Today is', 'Stop. Today is')],
    [
      'someone else may use it',
      (t: string) => t.replace('private use.', 'private use, and anyone else may use it.'),
    ],
    ['"just kidding" after', (t: string) => `${t} Just kidding.`],
    ['"No." after', (t: string) => `${t} No.`],
    ['"No." before', (t: string) => `No. ${t}`],
    ['words between the check words', (t: string) => t.replace('bridge,', 'bridge, not')],
    ['the sentences reordered', (t: string) => t.split('. ').reverse().join('. ')],
    ['word salad', (t: string) => consentWordsSorted(t)],
    [
      'subject and creator swapped',
      (t: string) => t.replace('Rosa', 'X').replace('Maya', 'Rosa').replace('X', 'Maya'),
    ],
    ["someone else's name", (t: string) => t.replace('Rosa Quill', 'Jane Doe')],
    [
      '"for my own use" when it is for Maya',
      (t: string) => t.replace("Maya Quill's private use", 'my own use'),
    ],
    [
      'a refusal hidden in the date',
      (t: string) => t.replace('November 1, 2026', 'November first, I do not agree'),
    ],
    [
      'a date that is a sentence',
      (t: string) => t.replace('November 1, 2026', 'the first of may and of the may of the may'),
    ],
  ])('refuses %s', (_label, change) => {
    const heard = change(forMaya.text);
    expect(heard).not.toBe(forMaya.text);
    expect(verifies(forMaya, heard)).toBe(false);
  });

  it('verifies names that hold refusal words, read correctly', () => {
    for (const [subjectName, creatorName] of [
      ['No Min-ji', 'No Min-ji'],
      ['Noa Never', 'Noa Never'],
      ['Rosa Quill', 'Do Not'],
      ['Never', 'Never'],
    ]) {
      const statement = buildConsentStatement({
        subjectName,
        creatorName,
        spokenDate: 'November 1, 2026',
        random: seq(0, 0, 0),
      });
      expect(verifies(statement, statement.text)).toBe(true);
      expect(verifies(statement, `${statement.text} No.`)).toBe(false);
      expect(verifies(statement, statement.text.replace('I agree', 'I do not agree'))).toBe(false);
    }
  });

  it('refuses names that are sentences, and verifies real names', () => {
    const build = (subjectName: string) => () =>
      buildConsentStatement({ subjectName, creatorName: 'Maya Quill', spokenDate: 'today' });
    expect(build('Alex. I do not agree')).toThrow(RangeError);
    expect(build('Louis 14')).toThrow(RangeError);
    expect(build('one two three four five six seven eight nine ten eleven')).toThrow(RangeError);
    for (const real of [
      "Rosa O'Neill-Quill",
      'प्रिया शर्मा',
      'கார்த்திக்',
      'José Müller',
      'J. Smith',
      'Martin Luther King Jr.',
      'Mary–Jane',
      'María de los Ángeles García de la Cruz',
    ]) {
      expect(build(real)).not.toThrow();
      const statement = buildConsentStatement({
        subjectName: real,
        creatorName: real,
        spokenDate: 'today',
        random: seq(0, 0, 0),
      });
      expect(verifies(statement, statement.text)).toBe(true);
    }
  });
});

/** Every word of the text, sorted: all the words, none of the order. */
function consentWordsSorted(text: string): string {
  return text.split(/\s+/).sort().join(' ');
}

describe('consentWords', () => {
  it('lowercases, keeps whole words, drops numbers and possessive s', () => {
    expect(consentWords("Maya's voice, November 1, 2026.")).toEqual(['maya', 'voice', 'november']);
  });
});
