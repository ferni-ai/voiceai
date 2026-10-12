import { describe, expect, it, vi } from 'vitest';

// No database: the default store must read as unreadable, not as "nothing forgotten".
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
import { foldText, stem } from '../forget-tokens.js';
import { forgetTokens, isForgotten } from '../session-recall.js';
import {
  forgottenTopics,
  forgottenTopicsOrNull,
  parseTopics,
  type ForgetStore,
} from '../forget.js';

describe('a forgotten topic matches its other forms', () => {
  it.each([
    ['Zoë', 'Lunch with Zoe on Friday'],
    ['Zoe', 'Lunch with Zoë on Friday'],
    ['José', 'Called José about the loan'], // decomposed vs composed
    ['divorce', 'She is divorcing him'],
    ['divorcing', 'The divorce papers came'],
    ['babies', 'They want a baby'],
    ['baby', 'Talked about having babies'],
    ['ex-wife', 'His exwife called'],
    ['ex-wife', 'His ex wife called'],
    ['ex wife', 'His ex-wife called'],
    ['exwife', 'His ex wife called'],
    ['my sister’s wedding', "my sister's wedding plans"],
    ['RUNNING', 'he runs every day and ran a race'.replace('runs', 'running')],
  ])('forgetting "%s" covers "%s"', (topic, memory) => {
    expect(isForgotten(memory, [topic])).toBe(true);
  });

  it('never over-matches part of another word', () => {
    expect(isForgotten('Planning a party on Saturday', ['art'])).toBe(false);
    expect(isForgotten('Planning a party on Saturday', ['parties'])).toBe(true);
    expect(isForgotten('A jobless week', ['job'])).toBe(false);
    expect(isForgotten('Moving to Austin', ['exhausting'])).toBe(false);
    expect(isForgotten('Planning his wedding', ['ex wife'])).toBe(false);
  });

  it('stems to a fixed point, so a stored stem reads back the same', () => {
    for (const w of ['divorce', 'divorcing', 'babies', 'houses', 'running', 'parties', 'zoe']) {
      expect(stem(stem(w))).toBe(stem(w));
      const stored = forgetTokens(w).join(' ');
      expect(forgetTokens(stored)).toEqual(forgetTokens(w));
    }
  });

  it('folds accents, curly apostrophes and hyphens inside words', () => {
    expect(foldText('Zoë’s Ex-Wife')).toBe("zoe's exwife");
    expect(forgetTokens('555-123-4567')).toEqual(['5551234567']);
  });
});

describe('reading the forgotten topics', () => {
  const store = (topics: () => Promise<string[] | null>): ForgetStore => ({
    facts: async () => [],
    markForgotten: async () => undefined,
    addTopic: async () => undefined,
    topics,
  });

  it('is [] only when none were recorded; malformed is unreadable', () => {
    expect(parseTopics(undefined)).toEqual([]);
    expect(parseTopics([])).toEqual([]);
    expect(parseTopics(['divorc'])).toEqual(['divorc']);
    expect(parseTopics('divorce')).toBeNull();
    expect(parseTopics([42])).toBeNull();
    expect(parseTopics({ 0: 'divorce' })).toBeNull();
  });

  it('gives raw-word readers null when unreadable, so they fail closed', async () => {
    expect(
      await forgottenTopicsOrNull(
        'u',
        store(async () => null)
      )
    ).toBeNull();
    expect(
      await forgottenTopicsOrNull(
        'u',
        store(async () => Promise.reject(new Error('down')))
      )
    ).toBeNull();
    expect(
      await forgottenTopicsOrNull(
        'u',
        store(async () => ['divorc'])
      )
    ).toEqual(['divorc']);
    // Fact readers (their records carry forgottenAt) keep reading [].
    expect(
      await forgottenTopics(
        'u',
        store(async () => null)
      )
    ).toEqual([]);
  });

  it('the default store fails closed with no database', async () => {
    expect(await forgottenTopicsOrNull('u')).toBeNull();
  });
});
