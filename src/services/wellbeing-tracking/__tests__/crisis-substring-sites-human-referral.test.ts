/**
 * principal-alignment analyzeReferralNeed (human-referral.ts) tested its
 * trigger regexes, written without \b, against the raw message.
 * SAFETY_WHOLE_WORD_SITES=on moves it onto whole words. Through the real
 * function: off keeps today's result, on drops the in-word false positive
 * ("casino points") and keeps the real phrase.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeReferralNeed } from '../../principal-alignment/human-referral.js';

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
  it.each(CASES.slice(0, 2))('on: %j is not immediate; %j still is', (everyday, real) => {
    flag('on');
    expect(urgency(everyday)).not.toBe('immediate');
    expect(urgency(real)).toBe('immediate');
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
