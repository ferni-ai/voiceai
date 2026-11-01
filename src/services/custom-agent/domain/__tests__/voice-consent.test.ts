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

  it('says "my own use" only when the caller says it is your own twin, not when names match', () => {
    const self = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: null,
      spokenDate: 'November 1, 2026',
      random: seq(0.5),
    });
    expect(self.text).toContain('for my own use');
    expect(new Set(self.checkWords).size).toBe(3);
    const namesake = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: 'ROSA QUILL',
      spokenDate: 'November 1, 2026',
      random: seq(0.5),
    });
    expect(namesake.text).toContain("for ROSA QUILL's private use");
  });

  it('refuses a random source outside [0, 1), so no check word is ever blank', () => {
    for (const bad of [1, 1.5, -0.1, Number.NaN]) {
      expect(() =>
        buildConsentStatement({
          subjectName: 'Rosa Quill',
          creatorName: null,
          spokenDate: 'today',
          random: () => bad,
        })
      ).toThrow(RangeError);
    }
  });

  it('draws different check words each time with real randomness', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const s = buildConsentStatement({ subjectName: 'A', creatorName: null, spokenDate: 'today' });
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

  it('verifies a name joined or split, and refuses one even a letter off', () => {
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'Rosaquill'))).toBe(true);
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'ROSA QUILL'))).toBe(true);
    // A near miss is read again: no tolerance a foreign "no" could slip through
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'Rosa Quil'))).toBe(false);
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'Rosa Quinn'))).toBe(false);
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'Rosalind Quill'))).toBe(false);
    const minji = buildConsentStatement({
      subjectName: 'Kim Min-ji',
      creatorName: null,
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
    ['"uh-uh" after', (t: string) => `${t} Uh-uh.`],
    ['"mm-mm" after', (t: string) => `${t} Mm-mm.`],
    ['"hmm-mm" after', (t: string) => `${t} Hmm-mm.`],
    ['"hmm, mm" before the agreement', (t: string) => t.replace('I agree', 'Hmm, mm, I agree')],
    ['"uh-uh" before the agreement', (t: string) => t.replace('I agree', 'Uh-uh, I agree')],
    ['"no" inside the name', (t: string) => t.replace('Rosa Quill', 'Rosa, no, Quill')],
    ['"or" inside the name', (t: string) => t.replace('Rosa Quill', 'Rosa or Quill')],
    ['"no" before the name', (t: string) => t.replace("Maya Quill's", "no Maya Quill's")],
    ["a relative's name", (t: string) => t.replace('Rosa Quill', 'Mona Quill')],
    ['a statement word two letters off', (t: string) => t.replace('private use', 'pirate use')],
    ['a short statement word misheard', (t: string) => t.replace('withdraw this', 'withdraw his')],
    ['"what" for "that"', (t: string) => t.replace('agree that', 'agree what')],
    ['no date', (t: string) => t.replace(' November 1, 2026', '')],
  ])('refuses %s', (_label, change) => {
    const heard = change(forMaya.text);
    expect(heard).not.toBe(forMaya.text);
    expect(verifies(forMaya, heard)).toBe(false);
  });

  it('refuses "no" for a short name, and verifies a split name spelled exactly', () => {
    const forJo = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: 'Jo',
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(forJo, forJo.text)).toBe(true);
    expect(verifies(forJo, forJo.text.replace("Jo's", 'no'))).toBe(false);
    // A short name word must be exact: "Don" is someone else, not a mishearing of "Dan"
    const forDan = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: 'Dan',
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(forDan, forDan.text)).toBe(true);
    expect(verifies(forDan, forDan.text.replace("Dan's", "Don's"))).toBe(false);
    // Four letters are exact too: "Dina" is someone else, not a mishearing of "Dana"
    const forDana = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: 'Dana',
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(forDana, forDana.text.replace("Dana's", "Dina's"))).toBe(false);
    const forNona = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: 'Nona',
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(forNona, forNona.text.replace("Nona's", 'none'))).toBe(false);
    const forNadia = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: 'Nadia',
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(forNadia, forNadia.text.replace("Nadia's", "Nadja's"))).toBe(false);
    expect(verifies(forNadia, forNadia.text.replace("Nadia's", 'nada'))).toBe(false);
    const obrien = buildConsentStatement({
      subjectName: "Sean O'Brien",
      creatorName: null,
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(obrien, obrien.text.replace("O'Brien", 'OBrien'))).toBe(true);
    expect(verifies(obrien, obrien.text.replace("O'Brien", 'O Brien'))).toBe(true);
    // A join or split must spell the name exactly, or an extra word could hide in it
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'Rosaquil'))).toBe(false);
    expect(verifies(forMaya, forMaya.text.replace('Rosa Quill', 'Rosa a Quill'))).toBe(false);
  });

  it('verifies an ISO date and a hesitant "um um"', () => {
    expect(verifies(forMaya, forMaya.text.replace('November 1, 2026', '2026-11-01'))).toBe(true);
    expect(verifies(forMaya, forMaya.text.replace('I agree', 'Um, um, I agree'))).toBe(true);
  });

  it.each(['nay', 'naw', 'nix', 'nyet', 'nae', 'nuh'])(
    'refuses "%s" read in place of a name one letter away',
    (no) => {
      const statement = buildConsentStatement({
        subjectName: 'Rosa Quill',
        creatorName: `${no[0].toUpperCase()}${no.slice(1)}a`,
        spokenDate: 'November 1, 2026',
        random: seq(0, 0, 0),
      });
      expect(verifies(statement, statement.text)).toBe(true);
      expect(
        verifies(statement, statement.text.replace(/for \S+ private/, `for ${no} private`))
      ).toBe(false);
    }
  );

  it.each([
    ['Nahid', 'nahi'],
    ['Kaine', 'keine'],
    ['Khang', 'khong'],
    ['Nevaeh', 'nevah'],
    ['Nienke', 'niente'],
    ['Nikky', 'nikdy'],
    ['Notting', 'nothing'],
    ['Margaret', 'margret'],
  ])('refuses %s heard as "%s", a near miss that may mean no', (name, heard) => {
    const statement = buildConsentStatement({
      subjectName: 'Rosa Quill',
      creatorName: name,
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(statement, statement.text)).toBe(true);
    expect(verifies(statement, statement.text.replace(`${name}'s`, heard))).toBe(false);
  });

  it('verifies a name that ends in an initial before "I agree"', () => {
    const statement = buildConsentStatement({
      subjectName: 'Rosa A.',
      creatorName: null,
      spokenDate: 'November 1, 2026',
      random: seq(0, 0, 0),
    });
    expect(verifies(statement, statement.text)).toBe(true);
  });

  it('verifies names that hold refusal words, read correctly', () => {
    for (const [subjectName, creatorName] of [
      ['No Min-ji', null],
      ['Noa Never', null],
      ['Rosa Quill', 'Do Not'],
      ['Never', null],
    ] as const) {
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
      'Mehr\u200cnoush',
      'María de los Ángeles García de la Cruz',
    ]) {
      expect(build(real)).not.toThrow();
      const statement = buildConsentStatement({
        subjectName: real,
        creatorName: null,
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
  it('lowercases, keeps whole words and numbers, drops possessive s', () => {
    expect(consentWords("Maya's voice, November 1, 2026.")).toEqual([
      'maya',
      'voice',
      'november',
      '1',
      '2026',
    ]);
  });
});
