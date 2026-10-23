/**
 * predictive-context detectPatternSignals matched concern phrases as bare
 * substrings. SAFETY_WHOLE_WORD_SITES=on moves it onto whole words in STT
 * spelling. Through the real function: off keeps today's result, on drops the
 * in-word false positive ("give updates") and keeps (or gains) the real
 * phrase, inflected forms included ("hopelessness").
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContextBuilderInput } from '../../../intelligence/context-builders/index.js';
import { detectPatternSignals } from '../../../intelligence/context-builders/intelligence/predictive-context.js';

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
