import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FORGOTTEN_WAIT_MS,
  createSummaryRecall,
  formatSummarySnippets,
  summaryRecallEnabled,
  summarySnippets,
  wordMatches,
} from '../call-summaries.js';
import { forgetTopic, type ForgetStore } from '../forget.js';
import type { RetrievalEmbedder } from '../semantic-recall.js';

// What the summarizer keeps that the line-by-line extractor dropped.
const summaries = [
  {
    timestamp: '2026-01-09T18:00:00.000Z',
    keyPoints: [
      'User is moving his Vanguard account into a Roth IRA before the deadline',
      'User felt tired after a long week at work',
    ],
  },
  {
    timestamp: { toDate: () => new Date('2026-01-05T18:00:00.000Z') },
    keyPoints: ['User talked about work stress and a new manager', 'Biscuit had knee surgery'],
    followUpItems: ['Ask how the new manager is working out'],
  },
  {
    timestamp: '2026-01-02T18:00:00.000Z',
    forgottenAt: '2026-01-10T00:00:00.000Z',
    keyPoints: ['User told Ferni about the divorce lawyer'],
  },
];

const texts = (topics: string[]) => summarySnippets(summaries, topics).map((s) => s.text);

afterEach(() => vi.useRealTimers());

describe('summarySnippets', () => {
  it('dates each key point by its call and leaves out a summary marked forgotten', () => {
    const snippets = summarySnippets(summaries, []);
    expect(snippets.map((s) => [s.at.slice(0, 10), s.text])).toEqual([
      ['2026-01-09', 'User is moving his Vanguard account into a Roth IRA before the deadline'],
      ['2026-01-09', 'User felt tired after a long week at work'],
      ['2026-01-05', 'User talked about work stress and a new manager'],
      ['2026-01-05', 'Biscuit had knee surgery'],
    ]);
    expect(texts([]).join(' ')).not.toContain('divorce');
  });

  it('drops the WHOLE summary for a forgotten topic, however the topic is written', () => {
    // Case, plurals, apostrophes, punctuation, multi-word, and a topic named in
    // another field (a thread) than the key point it would come back through.
    for (const topic of [
      'BISCUIT',
      "biscuit's knees",
      'Biscuit!!',
      'the knee surgery',
      'my new manager',
      'managers',
    ]) {
      const left = texts([topic]);
      const gone = /manager/i.test(topic) ? ['work stress', 'Biscuit'] : ['Biscuit', 'work stress'];
      for (const g of gone) expect(left.join(' '), `${topic}: ${g}`).not.toContain(g);
      expect(left.join(' ')).toContain('Roth IRA'); // the other summary stays
    }
  });

  it('treats any forgottenAt value as forgotten, and skips a summary with no date', () => {
    const odd = [
      {
        timestamp: '2026-01-09T18:00:00Z',
        forgottenAt: { seconds: 1 },
        keyPoints: ['a secret thing'],
      },
      { keyPoints: ['undated thing'] },
    ];
    expect(summarySnippets(odd, [])).toEqual([]);
  });
});

describe('wordMatches', () => {
  const snippets = summarySnippets(summaries, []);
  it('matches on a rare word alone, not a common one', () => {
    expect(wordMatches(snippets, 'what was I doing with my Roth again')).toEqual(['summary:0:0']);
    expect(wordMatches(snippets, 'ugh, work')).toEqual([]);
  });

  it('matches on two shared words, rarest first', () => {
    expect(wordMatches(snippets, 'work stress with the new manager')[0]).toBe('summary:1:0');
  });
});

describe('formatSummarySnippets', () => {
  it('names the call by its date', () => {
    const note = formatSummarySnippets(summarySnippets(summaries, []).slice(0, 1))!;
    expect(note).toContain('- From our call on Jan 9: User is moving his Vanguard account');
    expect(note).toContain('it may have changed since');
    expect(formatSummarySnippets([])).toBeNull();
  });
});

describe('createSummaryRecall', () => {
  const store = { summaries: async () => summaries };
  const none = async () => [] as string[];

  it('offers what the turn is about once a call, within the turn budget', async () => {
    const recall = createSummaryRecall({ userId: 'u1', store, forgotten: none });
    await recall.ready;
    expect(recall.take('did I ever finish that Roth thing')).toContain('Roth IRA');
    recall.newTurn();
    expect(recall.take('the Roth again')).toBeNull(); // already offered this call
    expect(recall.take('how are you')).toBeNull();
  });

  it('finds a snippet by meaning with semantic recall', async () => {
    const embed: RetrievalEmbedder = async (texts) =>
      texts.map((t) => (/vanguard|retirement/i.test(t) ? [1, 0.05, 0.05] : [0.05, 1, 0.05]));
    const recall = createSummaryRecall({ userId: 'u2', store, embed, forgotten: none });
    await recall.ready;
    recall.observe('how is my retirement savings plan coming along');
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    expect(recall.take('how is my retirement savings plan coming along')).toContain('Vanguard');
  });

  it('offers nothing when the forgotten topics cannot be read (fails closed)', async () => {
    const unreadable: Array<() => Promise<string[] | null>> = [
      async () => Promise.reject(new Error('down')),
      async () => null,
      async () => undefined as unknown as string[],
      async () => [42] as unknown as string[],
    ];
    for (const forgotten of unreadable) {
      const recall = createSummaryRecall({ userId: 'u3', store, forgotten });
      await recall.ready;
      expect(recall.take('the Roth and the Vanguard account')).toBeNull();
    }
  });

  it('offers nothing when the forgotten topics are too slow to read', async () => {
    vi.useFakeTimers();
    const recall = createSummaryRecall({
      userId: 'u4',
      store,
      forgotten: async () => new Promise<string[]>(() => undefined), // never answers
    });
    await vi.advanceTimersByTimeAsync(FORGOTTEN_WAIT_MS + 1);
    await recall.ready;
    expect(recall.take('the Roth and the Vanguard account')).toBeNull();
  });

  it('honours a topic forgotten during the call from the next turn on', async () => {
    const recall = createSummaryRecall({ userId: 'u-mid', store, forgotten: none });
    await recall.ready;
    const forgetStore: ForgetStore = {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async () => undefined,
      topics: async () => [],
    };
    await forgetTopic('u-mid', 'my Roth IRA', forgetStore);
    recall.newTurn();
    expect(recall.take('what did I do with the Roth and the Vanguard account')).toBeNull();
    // Another summary is still there.
    expect(recall.take('work stress with the new manager')).toContain('new manager');
  });

  it('is off unless RECALL_SUMMARIES=on', () => {
    expect(summaryRecallEnabled({})).toBe(false);
    expect(summaryRecallEnabled({ RECALL_SUMMARIES: 'on' })).toBe(true);
  });
});
