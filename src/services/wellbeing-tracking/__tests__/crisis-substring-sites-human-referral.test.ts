/**
 * principal-alignment analyzeReferralNeed (human-referral.ts) tested its
 * trigger regexes, written without \b, against the raw message.
 * SAFETY_WHOLE_WORD_SITES=on moves it onto whole words. Through the real
 * function: off keeps today's result, on drops the in-word false positive
 * ("casino points") and keeps the real phrase.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeReferralNeed } from '../../principal-alignment/human-referral.js';
import { riskCorpus } from './crisis-corpus.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);

// [everyday line that held a phrase inside a word, real line]
type Case = [string, string];

describe('principal-alignment analyzeReferralNeed (immediate = crisis line)', () => {
  const urgency = (m: string) => analyzeReferralNeed(m, { userId: 'u' }).urgency;
  const CASES: Case[] = [
    ['I won all the casino points', "there's no point anymore"],
    ['no pointers on this one', 'honestly no point in trying'],
    ['the suicide squad sequel', 'I feel suicidal'],
  ];
  it('off: casino points is immediate, as today', () => {
    flag('off');
    expect(urgency('I won all the casino points')).toBe('immediate');
  });
  it.each(CASES.slice(0, 1))('on: %j is not immediate; %j still is', (everyday, real) => {
    flag('on');
    expect(urgency(everyday)).not.toBe('immediate');
    expect(urgency(real)).toBe('immediate');
  });
  // Immediate and high triggers read recall-first: a match that starts at a word
  // edge counts however the word ends, so this stays immediate (accepted false positive).
  it('on: "no pointers on this one" stays immediate, as with the flag off', () => {
    flag('on');
    expect(urgency(CASES[1][0])).toBe('immediate');
    expect(urgency(CASES[1][1])).toBe('immediate');
  });
  it('on: a whole-word everyday use still fires (an accepted false positive)', () => {
    flag('on');
    expect(urgency(CASES[2][0])).toBe('immediate');
    expect(urgency(CASES[2][1])).toBe('immediate');
  });
  it('on: curly apostrophes count', () => {
    flag('off');
    expect(urgency('I don’t want to live')).toBe('low');
    flag('on');
    expect(urgency('I don’t want to live')).toBe('immediate');
  });
});

describe('recall: immediate and high triggers never read less than pattern.test', () => {
  const urgency = (m: string) => analyzeReferralNeed(m, { userId: 'u' }).urgency;
  it.each([
    'my suicidality is back',
    "I'm not suicidal or anything, but I did write out my final wishes and passwords",
  ])('on: %j is immediate', (line) => {
    flag('on');
    expect(urgency(line)).toBe('immediate');
  });
  it('on: medium triggers keep whole words ("taxi" is not "tax")', () => {
    flag('on');
    expect(urgency('I took a taxi home')).toBe('low');
  });
  it('corpus: no real-risk fixture line drops from immediate or high', () => {
    const severe = (m: string) => ['immediate', 'high'].includes(urgency(m));
    const drops: string[] = [];
    for (const line of riskCorpus()) {
      flag('off');
      const off = severe(line);
      flag('on');
      if (off && !severe(line)) drops.push(line);
    }
    expect(drops).toEqual([]);
  });
});
