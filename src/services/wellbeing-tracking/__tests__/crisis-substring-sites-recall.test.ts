/**
 * Recall-first reading for crisis-severity phrases (saysRiskPhrase,
 * testRiskWords in utils/safety-whole-word.ts). With SAFETY_WHOLE_WORD_SITES=on
 * a crisis check must never read less risk than the substring check, except
 * where the phrase starts inside a word. The whole-word ending and the negation
 * guard broke that: "kill themselves", "suicidality", "self-harmer",
 * "self-harmful" and "I'm not suicidal or anything, but ... my final wishes"
 * all dropped. Each site's own corpus check runs its real function.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  saysPhrase,
  saysRiskPhrase,
  testRiskWords,
  testWholeWords,
} from '../../../utils/safety-whole-word.js';
import { JOINED_EVERYDAY, joinedWordCorpus, riskCorpus } from './crisis-corpus.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);

// Crisis-severity phrases from the sites that use saysRiskPhrase
// (safety-guards.ts CRISIS_INDICATORS, shared-vocabulary.ts crisis terms).
const CRISIS_PHRASES = [
  'want to die',
  'kill myself',
  'end it all',
  "can't go on",
  'cant go on',
  'no reason to live',
  'better off without me',
  'suicide',
  'suicidal',
  'not worth living',
  'hurt myself',
  'cutting',
  'self-harm',
  'punish myself',
  'kill them',
  'hurt them',
  'want to hurt',
  'end it',
];

// Concern phrases and crisis keywords read strictly (saysPhrase): predictive-context.ts
// concern signals, safety-guards.ts CONCERNING_INDICATORS, the router's crisis_support keywords.
const CONCERN_PHRASES = [
  'no point',
  "what's the use",
  'give up',
  'hopeless',
  "don't want to be here",
  "can't see a way out",
  'trapped',
  'exhausted with life',
  "don't care anymore",
  'empty',
  'worthless',
  "can't cope",
  'breaking down',
  'crisis',
  'die',
  'dead',
  'emergency',
  'urgent',
  'harm',
];

const SUICIDAL = /(?:suicide|suicidal|don't want to (?:live|be alive|exist))/i;
const CUT = /(?:cutting|cut) (?:myself|my arms|my legs)/i;
const HITS =
  /(?:he|she|they|partner|spouse) (?:hit|hits|beat|beats|hurt|hurts|chokes?|choked?) me/i;
// human-referral.ts immediate and high triggers (read by testRiskWords).
const SEVERE_TRIGGERS = [
  /(?:want to|going to|thinking about|considered?) (?:kill|end) (?:myself|my life|it all)/i,
  SUICIDAL,
  /(?:no point|nothing to live for|better off dead)/i,
  CUT,
  /(?:hurt|harm|injure) myself/i,
  /(?:burning|starving|punishing) myself/i,
  HITS,
  /(?:afraid of|scared of) (?:my|going home|him|her|them)/i,
];

describe('saysRiskPhrase: on reads at least what the substring check reads', () => {
  const RECALLED: Array<[string, string]> = [
    ['kill themselves', 'kill them'],
    ['they want to kill themselves', 'kill them'],
    ['hurt themselves', 'hurt them'],
    ['suicidality', 'suicidal'],
    ['my suicidality is back', 'suicidal'],
    ['suicidal', 'suicidal'],
    ['self-harmer', 'self-harm'],
    ['self-harmful', 'self-harm'],
    ['self-harm', 'self-harm'],
    ['self harm', 'self-harm'],
    ['selfharm', 'self-harm'],
    ["I'm not suicidal or anything, but I wrote out my final wishes", 'suicidal'],
  ];
  it.each(RECALLED)('on: %j holds %j', (line, phrase) => {
    flag('on');
    expect(saysRiskPhrase(line, phrase)).toBe(true);
  });
  it('the whole-word reading misses them, which is the regression this fixes', () => {
    flag('on');
    const missed = RECALLED.filter(([line, phrase]) => !saysPhrase(line, phrase));
    expect(missed.map(([line]) => line)).toEqual(
      expect.arrayContaining(['kill themselves', 'suicidality', 'self-harmer', 'self-harmful'])
    );
  });
  it('on: a phrase starting inside a word still does not count', () => {
    flag('on');
    expect(saysRiskPhrase('I want to skill them up', 'kill them')).toBe(false);
    expect(saysRiskPhrase('just spend it all on yourself', 'end it all')).toBe(false);
    expect(saysRiskPhrase('I actually did send it', 'end it')).toBe(false);
  });
  it('off: exactly the substring check', () => {
    flag('off');
    expect(saysRiskPhrase('I want to skill them up', 'kill them')).toBe(true);
    expect(saysRiskPhrase('self harm', 'self-harm')).toBe(false);
  });
  it('corpus: no real-risk line the substring check catches is dropped on', () => {
    const drops: string[] = [];
    for (const line of riskCorpus()) {
      for (const phrase of CRISIS_PHRASES) {
        flag('off');
        const off = saysRiskPhrase(line, phrase);
        flag('on');
        if (off && !saysRiskPhrase(line, phrase)) drops.push(`${phrase}: ${line}`);
      }
    }
    expect(drops).toEqual([]);
  });
});

describe('testRiskWords: on reads at least what pattern.test reads', () => {
  it.each(['suicidality', 'my suicidality is back', "I'm not suicidal, but my final wishes"])(
    'on: %j matches',
    (line) => {
      flag('on');
      expect(testRiskWords(SUICIDAL, line)).toBe(true);
    }
  );
  it('on: a match starting inside a word still does not count', () => {
    flag('on');
    expect(testRiskWords(/no point/i, 'I won all the casino points')).toBe(false);
    expect(testRiskWords(/no point/i, 'no point anymore')).toBe(true);
  });
  it('on: curly apostrophes count', () => {
    flag('on');
    expect(testRiskWords(SUICIDAL, 'I don’t want to live')).toBe(true);
  });
});

describe('a missing space keeps the risk (only listed everyday words block a mid-word start)', () => {
  const RISK: Array<[string, () => boolean]> = [
    ['imsuicidal', () => saysRiskPhrase('imsuicidal', 'suicidal')],
    ['my friend issuicidal', () => saysRiskPhrase('my friend issuicidal', 'suicidal')],
    ['iwant to die', () => saysRiskPhrase('iwant to die', 'want to die')],
    ['i want tokill myself', () => saysRiskPhrase('i want tokill myself', 'kill myself')],
    ['I want toend it all', () => saysRiskPhrase('I want toend it all', 'end it all')],
    [
      'Everyone would bebetter off without me',
      () => saysRiskPhrase('Everyone would bebetter off without me', 'better off without me'),
    ],
    ['everything ishopeless (strict)', () => saysPhrase('everything ishopeless', 'hopeless')],
    [
      "Idon't want to be here anymore (strict)",
      () => saysPhrase("Idon't want to be here anymore.", "don't want to be here"),
    ],
    ['aboutsuicide (regex)', () => testRiskWords(SUICIDAL, "I've been thinking aboutsuicide")],
    ['Icut myself (regex)', () => testRiskWords(CUT, 'Fern... Icut myself again tonight')],
  ];
  it.each(RISK)('on: %s counts', (_name, read) => {
    flag('on');
    expect(read()).toBe(true);
  });
  const EVERYDAY: Array<[string, () => boolean]> = [
    ['spend it all', () => saysRiskPhrase('just spend it all', 'end it all')],
    ['send it', () => saysPhrase('I actually did send it', 'end it')],
    ['recommend it', () => saysRiskPhrase("I'd recommend it", 'end it')],
    ['skill them', () => saysRiskPhrase('I want to skill them up', 'kill them')],
    ['casino points', () => testRiskWords(/no point/i, 'I won all the casino points')],
    ['the hits me', () => testRiskWords(HITS, 'the hits me')],
    ['pharmacy', () => saysPhrase('deadline at the pharmacy', 'harm')],
    ['the audience', () => saysPhrase('the audience loved it', 'die')],
    ['on the stairs', () => testWholeWords(/(?:tax|irs|audit)/i, 'I fell on the stairs')],
  ];
  it.each(EVERYDAY)('on: %s does not count', (_name, read) => {
    flag('on');
    expect(read()).toBe(false);
  });
  it('the joined set holds 202 risk lines and the 3 pinned everyday ones', () => {
    expect(joinedWordCorpus()).toHaveLength(202);
    flag('on');
    expect(saysRiskPhrase(JOINED_EVERYDAY[0], 'kill them')).toBe(false);
    expect(saysPhrase(JOINED_EVERYDAY[1], 'die')).toBe(false);
    expect(saysPhrase(JOINED_EVERYDAY[2], 'harm')).toBe(false);
  });
  it('corpus: no joined-word line the substring check catches is dropped, at any phrase', () => {
    const drops: string[] = [];
    for (const line of joinedWordCorpus()) {
      for (const phrase of [...CRISIS_PHRASES, ...CONCERN_PHRASES]) {
        const reads = CRISIS_PHRASES.includes(phrase) ? saysRiskPhrase : saysPhrase;
        flag('off');
        const off = reads(line, phrase);
        flag('on');
        if (off && !reads(line, phrase)) drops.push(`${phrase}: ${line}`);
      }
      for (const pattern of SEVERE_TRIGGERS) {
        flag('off');
        const off = testRiskWords(pattern, line);
        flag('on');
        if (off && !testRiskWords(pattern, line)) drops.push(`${pattern.source}: ${line}`);
      }
    }
    expect(drops).toEqual([]);
  });
});
