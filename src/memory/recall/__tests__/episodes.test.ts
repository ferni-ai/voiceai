import { describe, expect, it } from 'vitest';
import {
  createEpisodeRecall,
  episodesOf,
  formatEpisodes,
  isForgottenPassage,
  recallEpisodesEnabled,
  type EpisodeCall,
} from '../episodes.js';
import type { RetrievalEmbedder } from '../semantic-recall.js';

// Seth's real call (2026-01-05), as stored: the number is three lines from the name.
const pete: EpisodeCall = {
  id: 'c1',
  at: '2026-01-05T18:00:00.000Z',
  lines: [
    'Hey, could you call my brother?',
    'This name is Pete.',
    "Uh, yes. It's uh 435 339 7687.",
    'Thanks so much.',
  ],
};
const music: EpisodeCall = {
  id: 'c2',
  at: '2026-01-07T18:00:00.000Z',
  lines: ['Could you play some music?', 'Maybe some blue grass?', 'Turn it up a bit.'],
};

/** Texts about the same thing share an axis, whatever words they use. */
const TOPICS: RegExp[] = [/brother|pete|phone|number/i, /music|blue grass|bluegrass/i];
const embed: RetrievalEmbedder = async (texts) =>
  texts.map((t) => {
    const hit = TOPICS.findIndex((re) => re.test(t));
    return [...TOPICS.map((_, i) => (i === hit ? 1 : 0.05)), 0.05, 0.05, 0.05, 0.05];
  });
const settle = () => new Promise((r) => setTimeout(r, 0));
const store = { calls: async () => [music, pete] };
const now = () => Date.parse('2026-01-12T18:00:00Z');

describe('episodesOf', () => {
  it('keeps lines that belong together in overlapping passages', () => {
    const texts = episodesOf([pete]).map((e) => e.text);
    expect(texts[0]).toBe(
      "Hey, could you call my brother? This name is Pete. Uh, yes. It's uh 435 339 7687."
    );
    // The next passage starts one line before the last ended, so nothing falls between.
    expect(texts[1]).toBe("Uh, yes. It's uh 435 339 7687. Thanks so much.");
  });
});

describe('createEpisodeRecall', () => {
  it("quotes the caller's own words when a turn is about them, once a call", async () => {
    const recall = createEpisodeRecall({
      userId: 'u',
      before: new Date(),
      store,
      embed,
      now,
      forgotten: async () => [],
    });
    await recall.ready;
    recall.observe("what's my brother's phone number again?");
    await settle();
    const note = recall.take();
    expect(note).toContain('(7 days ago) "Hey, could you call my brother? This name is Pete.');
    expect(note).toContain('435 339 7687');
    expect(note).not.toMatch(/blue grass/);
    recall.newTurn();
    recall.observe('and his number, one more time?');
    await settle();
    expect(recall.take()).toBeNull(); // already quoted this call
  });

  it('quotes nothing before the turn is embedded, or when the calls fail to load', async () => {
    const recall = createEpisodeRecall({
      userId: 'u',
      before: new Date(),
      store,
      embed,
      now,
      forgotten: async () => [],
    });
    await recall.ready;
    recall.observe("what's my brother's phone number?");
    expect(recall.take()).toBeNull(); // the turn's embedding hasn't landed

    const broken = createEpisodeRecall({
      userId: 'u',
      before: new Date(),
      store: { calls: async () => Promise.reject(new Error('firestore down')) },
      embed,
      forgotten: async () => [],
    });
    await broken.ready;
    broken.observe("what's my brother's phone number?");
    await settle();
    expect(broken.take()).toBeNull();
  });
});

describe('forgotten topics', () => {
  it('never quotes a passage about something they asked to forget', async () => {
    const recall = createEpisodeRecall({
      userId: 'u',
      before: new Date(),
      store,
      embed,
      now,
      forgotten: async () => ['brother number'],
    });
    await recall.ready;
    recall.observe("what's my brother's phone number again?");
    await settle();
    expect(recall.take() ?? '').not.toContain('435 339 7687');
  });
});

describe('isForgottenPassage', () => {
  it('leaves out raw speech about a forgotten topic, erring toward privacy', () => {
    const said =
      "Hey, could you call my brother? This name is Pete. Uh, yes. It's uh 435 339 7687.";
    // Topics are stored as forgetTokens (forget.ts), lower case.
    expect(isForgottenPassage(said, ['brother number'])).toBe(true); // "brother" is distinctive
    expect(isForgottenPassage(said, ['4353397687'])).toBe(true); // the number, however it was spoken
    expect(isForgottenPassage('My ex called again', ['ex'])).toBe(true); // short words still count
    expect(isForgottenPassage('I told my old boss about it', ['old job'])).toBe(false); // no distinctive word: all needed
    expect(isForgottenPassage('my old job at the bakery', ['old job'])).toBe(true);
    expect(isForgottenPassage(said, [])).toBe(false);
  });
});

describe('privacy holds even when things go wrong', () => {
  it('quotes nothing when the forgotten topics cannot be read', async () => {
    const recall = createEpisodeRecall({
      userId: 'u',
      before: new Date(),
      store,
      embed,
      now,
      forgotten: async () => null,
    });
    await recall.ready;
    recall.observe("what's my brother's phone number again?");
    await settle();
    expect(recall.take()).toBeNull();
  });

  it('honours a topic forgotten during the call', async () => {
    const recall = createEpisodeRecall({
      userId: 'u-mid',
      before: new Date(),
      store,
      embed,
      now,
      forgotten: async () => [],
    });
    await recall.ready;
    const { forgetTopic } = await import('../forget.js');
    await forgetTopic('u-mid', "my brother's number", {
      facts: async () => [],
      markForgotten: async () => undefined,
      addTopic: async () => undefined,
      topics: async () => [],
    });
    recall.observe("what's my brother's phone number again?");
    await settle();
    expect(recall.take() ?? '').not.toContain('435 339 7687');
  });
});

describe('formatEpisodes', () => {
  it('marks quotes as of when they were said', () => {
    expect(formatEpisodes([{ id: 'x', at: '2026-01-11T18:00:00Z', text: 'hi there' }], now())).toBe(
      'What they said on earlier calls, in their own words (as of then; it may have changed since; speech-to-text may have garbled them, so if a quote is unclear, ask rather than assert):\n- (yesterday) "hi there"'
    );
    expect(formatEpisodes([], now())).toBeNull();
  });

  it('is off unless RECALL_EPISODES=on', () => {
    expect(recallEpisodesEnabled({})).toBe(false);
    expect(recallEpisodesEnabled({ RECALL_EPISODES: 'on' })).toBe(true);
  });
});
