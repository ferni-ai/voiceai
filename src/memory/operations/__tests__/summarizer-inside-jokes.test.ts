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
    expect(summary.insideJokes).toMatchObject([
      { bit: 'the mushroom police', quote: 'the mushroom police', speaker: 'user' },
    ]);
    // The sweep finds the summary by its earliest bit's expiry
    const { insideJokesExpireAt } = summary as { insideJokesExpireAt?: string };
    expect(insideJokesExpireAt).toBe(summary.insideJokes![0].expireAt);
    expect(summary.followUpItems).toEqual(['ask how the next risotto goes']);
  });

  it('leaves the field off when there are none or the model omits it (old shape)', async () => {
    const none = await summarize({ ...base, insideJokes: [] });
    expect(none).not.toHaveProperty('insideJokes');
    expect(none).not.toHaveProperty('insideJokesExpireAt');
    const old = await summarize(base);
    expect(old).not.toHaveProperty('insideJokes');
    expect(old.mainTopics).toEqual(['cooking']);
  });
});

describe('parseInsideJokes', () => {
  const ok = (bit: string, quote: string) => ({ bit, quote, speaker: 'user' });
  /** The kept bits without their expiry (shared-moment-retention.test.ts covers that) */
  const parse = (raw: unknown, said: Parameters<typeof parseInsideJokes>[1]) =>
    parseInsideJokes(raw, said).map(({ expireAt: _expireAt, ...ref }) => ref);

  it('keeps a bit only when its quote is in the conversation, with the speaker who said it', () => {
    expect(
      parse(
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
      parse(
        [
          'the mushroom police',
          ok('made up', 'Ferni went skydiving last week'),
          ok('too short', 'the mushroom'),
          ok('the Mushroom Police', 'the mushroom police'),
          ok('mushroom police again', 'the mushroom police'),
        ],
        turns
      )
    ).toEqual([{ bit: 'the Mushroom Police', quote: 'the mushroom police', speaker: 'user' }]);
  });

  it('rejects a line the named speaker did not say, a fragment inside a word, and a bit that names nothing in its line', () => {
    expect(
      parse(
        [
          { bit: 'mushroom police', quote: 'the mushroom police', speaker: 'assistant' },
          { bit: 'mushroom police', quote: 'e mushroom p', speaker: 'user' },
          { bit: 'the vacation', quote: 'the mushroom police', speaker: 'user' },
        ],
        turns
      )
    ).toEqual([]);
  });

  it('dedupes quotes that differ only by case and punctuation', () => {
    const cat = [{ role: 'user' as const, content: 'My cat, Bartholomew judges everyone' }];
    expect(
      parse(
        [
          { bit: 'the cat judges', quote: 'my cat Bartholomew judges', speaker: 'user' },
          { bit: 'the cat again', quote: 'My cat, Bartholomew judges', speaker: 'user' },
        ],
        cat
      )
    ).toHaveLength(1);
  });

  it('caps at three bits and cuts each to 80 characters', () => {
    const long = `fungus ${'x'.repeat(300)}`;
    const more = [
      ok(long, 'a fungus incident'),
      ok('mushroom police bit', 'the mushroom police'),
      ok('mushroom police again', 'haha yes, the mushroom police'),
      ok('fungus again', 'a fungus incident'),
    ];
    const kept = parseInsideJokes(more, turns);
    expect(kept).toHaveLength(3);
    expect(kept[0].bit).toHaveLength(80);
    expect(kept[0].bit.endsWith('…')).toBe(true);
  });

  it('keeps at most 80 characters of the line, whole up to 80, never splitting an emoji', () => {
    const line = (n: number) => `mushroom ${'police bit '.repeat(60)}`.slice(0, n - 1) + 'z';
    const emoji = `mushroom ${'p'.repeat(69)}😂 and the rest`; // the emoji straddles the cut
    for (const [said, kept] of [
      [line(79), line(79)],
      [line(80), line(80)],
      [line(81), undefined],
      [line(500), undefined],
      [emoji, undefined],
    ] as const) {
      const [bit] = parseInsideJokes([ok('mushroom', said)], [{ role: 'user', content: said }]);
      expect(bit.quote.length).toBeLessThanOrEqual(80);
      if (kept) expect(bit.quote).toBe(kept);
      else expect(bit.quote).toMatch(/…$/);
      expect(bit.quote).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    }
  });

  it('gives each bit an expiry a year out', () => {
    const now = Date.parse('2026-10-29T12:00:00.000Z');
    const [bit] = parseInsideJokes([ok('the mushroom police', 'the mushroom police')], turns, now);
    expect(bit.expireAt).toBe('2027-10-29T12:00:00.000Z');
  });

  it('treats anything that is not a list as no jokes', () => {
    expect(parseInsideJokes(undefined, turns)).toEqual([]);
    expect(parseInsideJokes('the mushroom thing', turns)).toEqual([]);
  });
});
