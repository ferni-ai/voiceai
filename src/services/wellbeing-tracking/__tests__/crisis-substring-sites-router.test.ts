/**
 * semantic-router detectEmotionalState (shared-vocabulary.ts) matched crisis
 * terms as bare substrings. SAFETY_WHOLE_WORD_SITES=on moves it onto whole
 * words in STT spelling. Through the real function: off keeps today's result,
 * on drops the in-word false positive and keeps (or gains) the real phrase,
 * inflected forms included ("self-harming", "suicidally"). The router's
 * context boost (matcher.ts) is tested in crisis-context-boost-whole-word.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectEmotionalState } from '../../../tools/semantic-router/shared-vocabulary.js';
import { riskCorpus } from './crisis-corpus.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);

// [everyday line that held a phrase inside a word, real line]
type Case = [string, string];

describe('semantic-router detectEmotionalState (crisis valence, critical)', () => {
  const type = (m: string) => detectEmotionalState(m)?.type;
  const CASES: Case[] = [
    ['I actually did send it Wednesday', 'I just want to end it'],
  ];
  // Crisis terms read recall-first: a phrase that starts at a word edge counts
  // however the word ends, so these stay crisis (accepted false positives).
  const REOPENED = ['I want to diet before summer', 'I cant go online right now'];
  it.each(REOPENED)('on: %j stays crisis, as with the flag off', (line) => {
    flag('on');
    expect(type(line)).toBe('crisis');
  });
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

describe('inflected real-risk forms stay matched (whole-word mode is a superset on them)', () => {
  it.each(["I've been self-harming", 'I self-harmed last night', 'I feel suicidally low'])(
    'detectEmotionalState: %j stays crisis',
    (line) => {
      flag('on');
      expect(detectEmotionalState(line)?.type).toBe('crisis');
    }
  );
});

describe('shadow and the flag split', () => {
  it('the STT forms flag alone leaves every site as it is', () => {
    vi.stubEnv('EARLY_WARNING_STT_FORMS', 'on');
    expect(detectEmotionalState('I actually did send it')?.type).toBe('crisis');
  });
});

describe('recall: crisis terms never read less risk than the substring check', () => {
  it.each([
    'my suicidality is back',
    'I am a self-harmer',
    'it was self-harmful',
    'I have been thinking about selfharm',
    "I'm not suicidal or anything, but I did write out my final wishes and passwords",
  ])('on: %j is crisis', (line) => {
    flag('on');
    expect(detectEmotionalState(line)?.type).toBe('crisis');
  });
  it('corpus: no real-risk fixture line that is crisis off drops below crisis on', () => {
    const drops: string[] = [];
    for (const line of riskCorpus()) {
      flag('off');
      const off = detectEmotionalState(line)?.type === 'crisis';
      flag('on');
      if (off && detectEmotionalState(line)?.type !== 'crisis') drops.push(line);
    }
    expect(drops).toEqual([]);
  });
});
