import { describe, expect, it } from 'vitest';
import { parseInsideJokes, summarizeWithLLM, type ConversationTurn } from '../summarizer.js';

const turns: ConversationTurn[] = [
  { role: 'user', content: 'I made risotto and it turned into a fungus incident' },
  { role: 'assistant', content: 'A fungus incident! Should I alert the authorities?' },
  { role: 'user', content: 'haha yes, the mushroom police' },
];

const base = {
  mainTopics: ['cooking'],
  keyPoints: ['made risotto'],
  emotionalArc: 'light',
  openThreads: [],
  followUps: ['ask how the next risotto goes'],
  userConcerns: [],
  relationshipProgress: 'joked around',
};

const summarize = (json: object) =>
  summarizeWithLLM('s1', turns, async () => JSON.stringify(json), { generateEmbedding: false });

describe('summarizeWithLLM inside jokes', () => {
  it('asks the model for real shared bits only, never invented or stock jokes', async () => {
    let prompt = '';
    await summarizeWithLLM(
      's1',
      turns,
      async (p) => {
        prompt = p;
        return JSON.stringify(base);
      },
      { generateEmbedding: false }
    );
    expect(prompt).toContain('"insideJokes"');
    expect(prompt).toContain('Use [] if nothing was');
    expect(prompt).toContain('Never invent one');
    expect(prompt).toContain('Leave out stock jokes');
  });

  it('stores the jokes on the summary when the model reports some', async () => {
    const summary = await summarize({ ...base, insideJokes: ['the mushroom police'] });
    expect(summary.insideJokes).toEqual(['the mushroom police']);
    expect(summary.followUpItems).toEqual(['ask how the next risotto goes']);
  });

  it('leaves the field off when there are none or the model omits it (old shape)', async () => {
    expect(await summarize({ ...base, insideJokes: [] })).not.toHaveProperty('insideJokes');
    const old = await summarize(base);
    expect(old).not.toHaveProperty('insideJokes');
    expect(old.mainTopics).toEqual(['cooking']);
  });
});

describe('parseInsideJokes', () => {
  it('keeps trimmed, deduped strings, at most 3, each short', () => {
    const long = 'x'.repeat(300);
    expect(parseInsideJokes(['  a  ', 'A', 7, { joke: 'b' }, '', 'c', long, 'd'])).toEqual([
      'a',
      'c',
      'x'.repeat(140),
    ]);
  });

  it('treats anything that is not a list as no jokes', () => {
    expect(parseInsideJokes(undefined)).toEqual([]);
    expect(parseInsideJokes('the mushroom thing')).toEqual([]);
  });
});
