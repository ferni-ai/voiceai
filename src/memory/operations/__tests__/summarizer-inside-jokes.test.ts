import { describe, expect, it } from 'vitest';
import { parseInsideJokes } from '../inside-jokes.js';
import { summarizeWithLLM, type ConversationTurn } from '../summarizer.js';

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
    expect(prompt).toContain('copied word for word');
    expect(prompt).toContain('Leave out stock jokes');
  });

  it('stores the jokes on the summary when the model reports some', async () => {
    const summary = await summarize({
      ...base,
      insideJokes: [{ bit: 'the mushroom police', quote: 'the mushroom police', speaker: 'user' }],
    });
    expect(summary.insideJokes).toEqual([
      { bit: 'the mushroom police', quote: 'the mushroom police', speaker: 'user' },
    ]);
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
  const ok = (bit: string, quote: string) => ({ bit, quote, speaker: 'user' });

  it('keeps a bit only when its quote is in the conversation, with the speaker who said it', () => {
    expect(
      parseInsideJokes(
        [
          ok('the mushroom police', 'the mushroom police'),
          { bit: 'the authorities', quote: 'Should I alert the authorities', speaker: 'assistant' },
        ],
        turns
      )
    ).toEqual([
      { bit: 'the mushroom police', quote: 'the mushroom police', speaker: 'user' },
      { bit: 'the authorities', quote: 'Should I alert the authorities', speaker: 'assistant' },
    ]);
  });

  it('drops bare strings, invented quotes, short quotes and duplicate bits', () => {
    expect(
      parseInsideJokes(
        [
          'the mushroom police',
          ok('made up', 'Ferni went skydiving last week'),
          ok('too short', 'the mushroom'),
          ok('the Mushroom Police', 'the mushroom police'),
          ok('mushroom police again', 'the mushroom police'),
        ],
        turns
      )
    ).toEqual([
      { bit: 'the Mushroom Police', quote: 'the mushroom police', speaker: 'user' },
    ]);
  });

  it('rejects a line the named speaker did not say, a fragment inside a word, and a bit that names nothing in its line', () => {
    expect(
      parseInsideJokes(
        [
          { bit: 'mushroom police', quote: 'the mushroom police', speaker: 'assistant' },
          { bit: 'mushroom police', quote: 'e mushroom p', speaker: 'user' },
          { bit: 'the vacation', quote: 'the mushroom police', speaker: 'user' },
        ],
        turns
      )
    ).toEqual([]);
  });

  it('caps at three bits and trims each to 140 characters', () => {
    const long = `fungus ${'x'.repeat(300)}`;
    const more = [
      ok(long, 'a fungus incident'),
      ok('mushroom police bit', 'the mushroom police'),
      ok('mushroom police again', 'haha yes, the mushroom police'),
      ok('fungus again', 'a fungus incident'),
    ];
    const kept = parseInsideJokes(more, turns);
    expect(kept).toHaveLength(3);
    expect(kept[0].bit).toHaveLength(140);
  });

  it('treats anything that is not a list as no jokes', () => {
    expect(parseInsideJokes(undefined, turns)).toEqual([]);
    expect(parseInsideJokes('the mushroom thing', turns)).toEqual([]);
  });
});
