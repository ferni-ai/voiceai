/**
 * The safety phrase readers (utils/safety-whole-word.ts) under
 * SAFETY_WHOLE_WORD_SITES. Each rule has a test a mutation of it turns red:
 * off and shadow equal the substring check; on never reads less than it
 * (elongated and suffixed forms, every match it finds survives STT spelling);
 * on adds STT spellings; a match inside a listed everyday word is 'soft', never
 * dropped; every match is tried; no risk subject is keyed as everyday ("she").
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const shadow = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (actual) => {
  const real = await actual<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (b: Record<string, unknown>) =>
      b.module === 'SafetyPhraseShadow'
        ? { info: shadow, warn: shadow, debug: shadow, error: shadow }
        : real.createLogger(b),
  };
});

import {
  EVERYDAY_WORDS,
  type Hit,
  patternHit,
  phraseHit,
  saysPhrase,
  testWholeWords,
} from '../../../utils/safety-whole-word.js';

afterEach(() => {
  vi.unstubAllEnvs();
  shadow.mockClear();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);
const IRS = /(?:tax|irs|audit)/i;

// [everyday word, a line whose only match lies inside it, its reading]
const SOFT: Array<[string, string, () => Hit]> = [
  [
    'send',
    "i'll send it all to my sister before i go",
    () => phraseHit("i'll send it all to my sister before i go", 'end it all'),
  ],
  ['spend', 'just spend it all', () => phraseHit('just spend it all', 'end it all')],
  [
    'lend',
    "lend it all out, i won't be here",
    () => phraseHit("lend it all out, i won't be here", 'end it all'),
  ],
  [
    'pretend',
    "i'll pretend it all is fine",
    () => phraseHit("i'll pretend it all is fine", 'end it all'),
  ],
  ['recommend', "I'd recommend it", () => phraseHit("I'd recommend it", 'end it')],
  ['skill', 'I want to skill them up', () => phraseHit('I want to skill them up', 'kill them')],
  [
    'casino',
    'I won all the casino points',
    () => phraseHit('I won all the casino points', 'no point'),
  ],
  ['pointers', 'no pointers on this one', () => phraseHit('no pointers on this one', 'no point')],
  ['points', 'no points scored', () => phraseHit('no points scored', 'no point')],
  ['numbers', 'the numbers are in', () => phraseHit('the numbers are in', 'numb')],
  ['emptyhanded', 'i came home emptyhanded', () => phraseHit('i came home emptyhanded', 'empty')],
  [
    'pharmacy',
    'i went to the pharmacy for pills to overdose',
    () => phraseHit('i went to the pharmacy for pills to overdose', 'harm'),
  ],
  [
    'harmony',
    'the self-harmony workshop',
    () => phraseHit('the self-harmony workshop', 'self-harm'),
  ],
  ['studied', 'I studied all night', () => phraseHit('I studied all night', 'die')],
  ['audience', 'the audience loved it', () => phraseHit('the audience loved it', 'die')],
  ['diet', 'I want to diet', () => phraseHit('I want to diet', 'want to die')],
  ['deadline', 'the deadline is friday', () => phraseHit('the deadline is friday', 'dead')],
  ['insurgent', 'an insurgent group', () => phraseHit('an insurgent group', 'urgent')],
  [
    'number',
    'I already tried that number.',
    () => phraseHit('I already tried that number.', 'numb'),
  ],
  ['updates', "I'll give updates later", () => phraseHit("I'll give updates later", 'give up')],
  [
    'online',
    "I can't go online at work",
    () => phraseHit("I can't go online at work", "can't go on"),
  ],
  [
    'username',
    "what's the username again",
    () => phraseHit("what's the username again", "what's the use"),
  ],
  ['stairs', 'I fell on the stairs', () => patternHit(IRS, 'I fell on the stairs')],
  ['first', 'the first time', () => patternHit(IRS, 'the first time')],
  ['syntax', 'a syntax error', () => patternHit(IRS, 'a syntax error')],
  ['taxi', 'I took a taxi home', () => patternHit(IRS, 'I took a taxi home')],
];

describe('off and shadow equal the substring check', () => {
  it.each(SOFT)('%s: off and shadow read "hit", as the substring check does', (_w, _l, read) => {
    flag('off');
    expect(read()).toBe('hit');
    flag('shadow');
    expect(read()).toBe('hit');
  });
  it('off: an STT spelling the substring check misses stays missed', () => {
    flag('off');
    expect(phraseHit('i cant go on', "can't go on")).toBeNull();
    expect(saysPhrase('self harm', 'self-harm')).toBe(false);
  });
  it('shadow: logs where on would differ and decides as off', () => {
    flag('shadow');
    expect(phraseHit('just spend it all', 'end it all')).toBe('hit');
    expect(phraseHit('selfharm', 'self-harm')).toBeNull();
    expect(shadow).toHaveBeenCalledWith(
      expect.objectContaining({ flag: 'SAFETY_WHOLE_WORD_SITES', would: 'soft' }),
      expect.any(String)
    );
    expect(shadow).toHaveBeenCalledWith(
      expect.objectContaining({ flag: 'SAFETY_WHOLE_WORD_SITES', would: 'hit' }),
      expect.any(String)
    );
  });
});

describe('on never reads less than the substring check', () => {
  const KEPT: Array<[string, string]> = [
    ["i can't go onnn", "can't go on"],
    ['i cant go onnnn anymore', 'cant go on'],
    ['i want to end ittt', 'end it'],
    ['i just want to end itttt all', 'end it'],
    ['I am a self-harmer', 'self-harm'],
    ['it was self-harmful', 'self-harm'],
    ['i keep having harmful thoughts about myself', 'harm'],
    ['i want to give uppp', 'give up'],
    ['i just want to give upppp on everything', 'give up'],
    ['suicidalll', 'suicidal'],
    ["I'm not suicidal or anything, but I did write out my final wishes", 'suicidal'],
    ['the hits me', 'he hits me'],
    // A missing space after the phrase (#2641).
    ['i feel hopelessand alone', 'hopeless'],
    ['im trappedhere', 'trapped'],
    ["i'm numbinside", 'numb'],
    ["I don't want to be hereanymore", "don't want to be here"],
    ["there's no pointin living", 'no point'],
    ['i give upon life', 'give up'],
  ];
  it.each(KEPT)('on: %j holds %j as a hit', (line, phrase) => {
    flag('on');
    expect(phraseHit(line, phrase)).toBe('hit');
    expect(saysPhrase(line, phrase)).toBe(true);
  });
  it.each<[string, RegExp]>([
    [
      'i was sexually assaultedlast year',
      /(?:sexually|physically|emotionally) (?:assaulted|abused|attacked)/i,
    ],
    ['i relapsedagain', /(?:relapsed|using again|started using)/i],
    ['my dad just diedyesterday', /(?:just|recently) (?:lost|died|passed away)/i],
  ])('on: %j still matches its trigger (a missing space after it)', (line, re) => {
    flag('on');
    expect(patternHit(re, line)).toBe('hit');
    expect(testWholeWords(re, line)).toBe(true);
  });
  it('on: a match STT spelling would erase still counts ("can not" becomes "cant")', () => {
    flag('on');
    expect(phraseHit('i can not worth living', 'not worth living')).toBe('hit');
  });
  it.each(SOFT)('on: %s is soft, not dropped', (_w, _line, read) => {
    flag('on');
    expect(read()).toBe('soft');
  });
  it('on: the boolean readers count a soft match', () => {
    flag('on');
    expect(saysPhrase('just spend it all', 'end it all')).toBe(true);
    expect(saysPhrase('i went to the pharmacy for pills to overdose', 'harm')).toBe(true);
    expect(testWholeWords(IRS, 'I fell on the stairs')).toBe(true);
  });
});

describe('on adds STT spellings', () => {
  const GAINED: Array<[string, string]> = [
    ['i cant go on', "can't go on"],
    ['self harm again', 'self-harm'],
    ['I have been thinking about selfharm', 'self-harm'],
    ['I don’t want to be here', "don't want to be here"],
  ];
  it.each(GAINED)('on: %j holds %j; off does not', (line, phrase) => {
    flag('off');
    expect(phraseHit(line, phrase)).toBeNull();
    flag('on');
    expect(phraseHit(line, phrase)).toBe('hit');
  });
  it('on: curly apostrophes count for a regex', () => {
    flag('on');
    expect(patternHit(/don't want to live/i, 'I don’t want to live')).toBe('hit');
  });
});

describe('the everyday list', () => {
  it('every listed word has a soft case above, and every case is listed', () => {
    const listed = Object.values(EVERYDAY_WORDS).flat().sort();
    expect(SOFT.map(([w]) => w).sort()).toEqual(listed);
  });
  it('every match is tried: a later match outside the list is a hit', () => {
    flag('on');
    expect(phraseHit('i spend it all and i want to end it all', 'end it all')).toBe('hit');
    expect(patternHit(/no point/i, 'casino points, honestly no point anymore')).toBe('hit');
  });
  it('a listed word counts only as the whole word: a longer word around it is a hit', () => {
    flag('on');
    expect(phraseHit('sendit all', 'end it all')).toBe('hit');
    expect(phraseHit('pharmacyto overdose', 'harm')).toBe('hit');
    expect(patternHit(/no point/i, 'casinono point')).toBe('hit');
  });
  it('no risk subject is keyed as everyday: "she hits me" is a hit', () => {
    flag('on');
    expect(phraseHit('she hits me', 'he hits me')).toBe('hit');
    expect(patternHit(/he hits me/i, 'she hits me again')).toBe('hit');
    expect(Object.keys(EVERYDAY_WORDS)).not.toContain('he');
  });
  it('the four risk lines main catches only through a listed word stay caught', () => {
    flag('on');
    expect(phraseHit("i'll send it all to my sister before i go", 'end it all')).toBe('soft');
    expect(phraseHit("lend it all out, i won't be here", 'end it all')).toBe('soft');
    expect(phraseHit("i'll pretend it all is fine until i end it", 'end it')).toBe('hit');
    expect(phraseHit('i went to the pharmacy for pills to overdose', 'harm')).toBe('soft');
  });
});

describe('non-string input reads as pattern.test reads it', () => {
  const CASES: Array<[RegExp, unknown]> = [
    [/undefined/, undefined],
    [/null/, null],
    [/42/, 42],
    [/no point/i, undefined],
  ];
  it.each(['off', 'shadow', 'on'] as const)('%s: patternHit coerces like pattern.test', (mode) => {
    flag(mode);
    for (const [re, value] of CASES) {
      const main = re.test(value as string);
      expect(patternHit(re, value as string), String(value)).toBe(main ? 'hit' : null);
      expect(testWholeWords(re, value as string)).toBe(main);
    }
    // Read by coercion, not by falling back after an error.
    expect(shadow).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.anything() }),
      expect.anything()
    );
  });
});
