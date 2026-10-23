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

import { saysPhrase, saysRiskPhrase, testRiskWords } from '../../../utils/safety-whole-word.js';
import { riskCorpus } from './crisis-corpus.js';

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
  const SUICIDAL = /(?:suicide|suicidal|don't want to (?:live|be alive|exist))/i;
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
