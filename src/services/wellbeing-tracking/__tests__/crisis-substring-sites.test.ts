/**
 * Four live crisis checks outside early-warning.ts matched risk phrases as
 * bare substrings. EARLY_WARNING_STT_FORMS=on moves each onto whole words in
 * STT spelling. Through each real function: off keeps today's result, on
 * drops the in-word false positive and keeps (or gains) the real phrase.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextBuilderInput } from '../../../intelligence/context-builders/index.js';
import { detectPatternSignals } from '../../../intelligence/context-builders/intelligence/predictive-context.js';
import { analyzeReferralNeed } from '../../principal-alignment/human-referral.js';
import { assessSafety } from '../../../tools/domains/life-coaching-shared/safety-guards.js';
import { detectEmotionalState } from '../../../tools/semantic-router/shared-vocabulary.js';
import { testWholeWords } from '../phrase-match.js';

afterEach(() => vi.unstubAllEnvs());
const flag = (v: 'on' | 'off') => vi.stubEnv('EARLY_WARNING_STT_FORMS', v);

// [everyday line that held a phrase inside a word, real line]
type Case = [string, string];

describe('life-coaching assessSafety (crisis = immediate referral + 988)', () => {
  const CASES: Case[] = [
    ['just spend it all on yourself', 'I want to end it all'],
    ["I can't go online at work", "I can't go on"],
    ['I want to skill them up', 'I want to kill them'],
    ['the self-harmony workshop', 'I keep thinking about self-harm'],
  ];
  it.each(CASES)('off: %j is crisis, as today', (everyday) => {
    flag('off');
    expect(assessSafety(everyday).level).toBe('crisis');
  });
  it.each(CASES)('on: %j is not crisis; %j still is', (everyday, real) => {
    flag('on');
    expect(assessSafety(everyday).level).not.toBe('crisis');
    expect(assessSafety(real).level).toBe('crisis');
  });
  it('on: the STT spelling "i cant go on" becomes crisis', () => {
    flag('off');
    expect(assessSafety('i cant go on').level).not.toBe('crisis');
    flag('on');
    expect(assessSafety('i cant go on').level).toBe('crisis');
  });
  it('on: "number" no longer counts as "numb"', () => {
    flag('off');
    expect(assessSafety('my phone number changed').level).toBe('concerning');
    flag('on');
    expect(assessSafety('my phone number changed').level).toBe('safe');
    expect(assessSafety('I feel numb').level).toBe('concerning');
  });
});

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
  it('on: a match inside a word does not hide a later whole-word one', () => {
    flag('on');
    expect(testWholeWords(/(?:he|she) hits me/i, 'the hits me, she hits me')).toBe(true);
    expect(testWholeWords(/(?:he|she) hits me/i, 'the hits me')).toBe(false);
  });
});

describe('semantic-router detectEmotionalState (crisis valence, critical)', () => {
  const type = (m: string) => detectEmotionalState(m)?.type;
  const CASES: Case[] = [
    ['I actually did send it Wednesday', 'I just want to end it'],
    ['I want to diet before summer', 'I want to die'],
    ['I cant go online right now', 'i cant go on'],
  ];
  it.each(CASES)('off: %j is crisis, as today', (everyday) => {
    flag('off');
    expect(type(everyday)).toBe('crisis');
  });
  it.each(CASES)('on: %j is not crisis; %j still is', (everyday, real) => {
    flag('on');
    expect(type(everyday)).not.toBe('crisis');
    expect(type(real)).toBe('crisis');
  });
});

describe('predictive-context detectPatternSignals (URGENT check-in)', () => {
  const signal = (userText: string) =>
    detectPatternSignals({ userText } as unknown as ContextBuilderInput);
  const CASES: Case[] = [
    ["I'll give updates later", 'I just want to give up'],
    ['I got casino points', "there's no point"],
  ];
  it.each(CASES)('off: %j is concern, as today', (everyday) => {
    flag('off');
    expect(signal(everyday)).toBe('concern');
  });
  it.each(CASES)('on: %j is not concern; %j still is', (everyday, real) => {
    flag('on');
    expect(signal(everyday)).not.toBe('concern');
    expect(signal(real)).toBe('concern');
  });
  it('on: the STT spelling "i dont want to be here" becomes concern', () => {
    flag('off');
    expect(signal('i dont want to be here')).not.toBe('concern');
    flag('on');
    expect(signal('i dont want to be here')).toBe('concern');
  });
});
