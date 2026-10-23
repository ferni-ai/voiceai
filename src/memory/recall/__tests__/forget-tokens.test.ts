import { describe, expect, it, vi } from 'vitest';

// No database: the default store must read as unreadable, not as "nothing forgotten".
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
import { foldText, stem } from '../forget-tokens.js';
import { forgetTokens, isForgotten, loadRecallSnapshot, storedTopic } from '../session-recall.js';
import {
  forgottenTopics,
  forgetTopic,
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
    ['Жан-Поль', 'Жанполь звонил'], // any script: a hyphen inside a word is joined
    ['my sister’s wedding', "my sister's wedding plans"],
    ['RUNNING', 'he runs every day and ran a race'.replace('runs', 'running')],
  ])('forgetting "%s" covers "%s"', (topic, memory) => {
    expect(isForgotten(memory, [topic])).toBe(true);
  });

  it.each([
    ['cookies', 'She baked a cookie'],
    ['cookie', 'A tin of cookies'],
    ['movies', 'We watched a movie'],
    ['movie', 'Talked about movies'],
    ['studied', 'He studies law'],
    ['studies', 'She studied abroad'],
  ])('stems -ies/-ied/-ie forms alike: "%s" covers "%s"', (topic, memory) => {
    expect(isForgotten(memory, [topic])).toBe(true);
  });

  it('never stems a name or a short word in a topic', () => {
    expect(isForgotten('Got a new job', ['news'])).toBe(false);
    expect(isForgotten('Watching the news', ['news'])).toBe(true);
    expect(isForgotten('Making strawberry jam', ['James'])).toBe(false);
    expect(isForgotten('James called', ['James'])).toBe(true);
    // A memory's capitalized first word still matches a topic's stem.
    expect(isForgotten('Divorce papers came', ['divorcing'])).toBe(true);
  });

  it('treats a hyphenated word the same in every script', () => {
    expect(isForgotten('Jean-Paul called', ['Paul'])).toBe(true);
    expect(isForgotten('Жан-Поль звонил', ['Поль'])).toBe(true);
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

describe('topics stored by the earlier tokenizer still hide what they hid', () => {
  // Exactly as the code before 2026-10-11 stored them (forgetTokens(topic).join(' ')).
  it.each([
    ['zo', 'Lunch with Zoë'], // from "Zoë"
    ['babie', 'Talked about babies'], // from "babies"
    ['babie', 'They want a baby'],
    ['divorce', 'She is divorcing him'],
    ['sister wedding', "My sister's wedding is in May"],
    ['4355550188', 'His number is 435-555-0188'],
    ['ex', 'Ran into my ex at the store'],
  ])('stored "%s" hides "%s"', (stored, memory) => {
    expect(isForgotten(memory, [stored])).toBe(true);
  });

  it('a new forget stores the words with their case, and what was asked', async () => {
    expect(storedTopic("my sister's wedding")).toBe("sister's wedding");
    expect(storedTopic('James')).toBe('James');
    const recorded: Array<[string, string | undefined]> = [];
    const store: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async (_u, topic, asked) => {
        recorded.push([topic, asked]);
      },
      topics: async () => [],
    };
    await forgetTopic('u', 'forget about James', store);
    expect(recorded).toEqual([['James', 'forget about James']]);
  });
});

describe('recall fails closed when the topics are unreadable', () => {
  it('recalls no facts, threads or jokes', async () => {
    const snapshot = await loadRecallSnapshot(
      {
        facts: async () => [{ entityName: 'User', key: 'job', value: 'nurse', confidence: 0.9 }],
        summaries: async () => [
          {
            followUpItems: ['Ask about the move'],
            insideJokes: [
              { bit: 'the fungus incident', quote: 'the fungus incident', speaker: 'user' },
            ],
          },
        ],
        forgotten: async () => null,
      },
      'u'
    );
    expect(snapshot).toEqual({ facts: [], followUps: [], insideJokes: [] });
  });

  it('leaves out an inside joke whose line is about a forgotten topic', async () => {
    const snapshot = await loadRecallSnapshot(
      {
        facts: async () => [],
        summaries: async () => [
          {
            insideJokes: [
              { bit: 'the cat bit', quote: 'she guards the treat cabinet', speaker: 'user' },
            ],
          },
        ],
        forgotten: async () => ['cabinet'],
      },
      'u'
    );
    expect(snapshot.insideJokes).toEqual([]);
  });

  it('leaves out an inside joke about a forgotten topic', async () => {
    const snapshot = await loadRecallSnapshot(
      {
        facts: async () => [],
        summaries: async () => [
          {
            insideJokes: [
              { bit: 'the divorce lawyer bit', quote: 'the divorce lawyer bit', speaker: 'user' },
              { bit: 'the fungus incident', quote: 'the fungus incident', speaker: 'user' },
            ],
          },
        ],
        forgotten: async () => ['divorce'],
      },
      'u'
    );
    expect(snapshot.insideJokes?.map((j) => j.bit)).toEqual(['the fungus incident']);
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
