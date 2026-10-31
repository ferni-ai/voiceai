/**
 * predictive-context detectPatternSignals matched concern phrases as bare
 * substrings. SAFETY_WHOLE_WORD_SITES=on reads them through saysPhrase (#2645),
 * in STT spelling. 'concern' drives the URGENT check-in and a follow-up
 * probability of 1.0, so with the flag on a phrase found only inside an
 * everyday word ("give updates") is 'soft' and still counts as concern, as
 * today. On may gain the real phrase (STT spellings, "hopelessness"), never
 * lose it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContextBuilderInput } from '../../../intelligence/context-builders/index.js';
import { detectPatternSignals } from '../../../intelligence/context-builders/intelligence/predictive-context.js';
import { riskCorpus } from './crisis-corpus.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);

// [everyday line that held a phrase inside a word, real line]
type Case = [string, string];

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
  it.each(CASES)('on: %j stays concern (a soft match never lowers); %j still is', (everyday, real) => {
    flag('on');
    expect(signal(everyday)).toBe('concern');
    expect(signal(real)).toBe('concern');
  });
  it('on: the STT spelling "i dont want to be here" becomes concern', () => {
    flag('off');
    expect(signal('i dont want to be here')).not.toBe('concern');
    flag('on');
    expect(signal('i dont want to be here')).toBe('concern');
  });
  it('shadow: decides as off where on differs', () => {
    flag('off');
    const off = signal('i dont want to be here');
    flag('shadow');
    expect(signal('i dont want to be here')).toBe(off);
    expect(off).not.toBe('concern');
  });
});

describe('inflected real-risk forms stay matched (whole-word mode is a superset on them)', () => {
  it.each(['such hopelessness', 'hopelessly lost'])(
    'predictive-context: %j stays concern',
    (line) => {
      flag('on');
      const input = { userText: line } as unknown as ContextBuilderInput;
      expect(detectPatternSignals(input)).toBe('concern');
    }
  );
});

describe('corpus: no real-risk line that is concern off drops on', () => {
  it('every real-risk fixture line and every joined-word line', () => {
    const signal = (userText: string) =>
      detectPatternSignals({ userText } as unknown as ContextBuilderInput);
    const drops: string[] = [];
    for (const line of riskCorpus()) {
      flag('off');
      const off = signal(line) === 'concern';
      flag('on');
      if (off && signal(line) !== 'concern') drops.push(line);
    }
    expect(drops).toEqual([]);
  });
});
