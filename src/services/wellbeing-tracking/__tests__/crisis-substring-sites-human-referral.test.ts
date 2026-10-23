/**
 * principal-alignment analyzeReferralNeed (human-referral.ts) tested its
 * trigger regexes, written without \b, against the raw message.
 * SAFETY_WHOLE_WORD_SITES=on moves it onto the whole-word matcher. A match that
 * lies only inside an everyday word ("casino points") is 'soft', and soft
 * counts as a match here: the urgency drives the IMMEDIATE professional-help
 * injection, so on may raise it (curly apostrophes, missing spaces) but never
 * lowers it below today's.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { patternHit } from '../../../utils/safety-whole-word.js';
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
  // Severe path: main refers this line, and with the flag on the matcher reads it
  // only as 'soft' ('no' inside "casino", 'point' inside "points"). A severe
  // trigger must still refer on a soft match (recall-first), never on 'hit' alone.
  it('on: a severe trigger matched only softly still refers to a human (immediate)', () => {
    flag('on');
    expect(patternHit(/(?:no point|nothing to live for|better off dead)/i, CASES[0][0])).toBe('soft');
    const r = analyzeReferralNeed(CASES[0][0], { userId: 'u' });
    expect(r.urgency).toBe('immediate');
    expect(r.shouldRefer).toBe(true);
    expect(r.suggestedTarget).toBe('crisis_line');
  });
  it('off: casino points is immediate, as today', () => {
    flag('off');
    expect(urgency('I won all the casino points')).toBe('immediate');
  });
  it.each(CASES.slice(0, 1))('on: %j stays immediate (a soft match never lowers); %j still is', (everyday, real) => {
    flag('on');
    expect(urgency(everyday)).toBe('immediate');
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
  it('shadow: decides as off where on differs', () => {
    flag('shadow');
    expect(urgency('I don’t want to live')).toBe('low');
    const r = analyzeReferralNeed('I don’t want to live', { userId: 'u' });
    expect(r.shouldRefer).toBe(false);
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
  it('on: a medium trigger inside an everyday word keeps its urgency ("taxi" holds "tax")', () => {
    flag('off');
    const off = urgency('I took a taxi home');
    flag('on');
    expect(urgency('I took a taxi home')).toBe(off);
  });
  it('corpus: no fixture line reads a lower urgency with the flag on', () => {
    const rank = { low: 1, medium: 2, high: 3, immediate: 4 } as const;
    const drops: string[] = [];
    for (const line of riskCorpus()) {
      flag('off');
      const off = rank[urgency(line)];
      flag('on');
      if (rank[urgency(line)] < off) drops.push(line);
    }
    expect(drops).toEqual([]);
  });
});
