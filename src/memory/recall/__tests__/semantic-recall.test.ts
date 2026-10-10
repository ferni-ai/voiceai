import { describe, expect, it, vi } from 'vitest';
import {
  createSemanticIndex,
  MIN_MARGIN,
  semanticRecallEnabled,
  standouts,
  withinTokens,
  type RetrievalEmbedder,
} from '../semantic-recall.js';

/** Unit vectors on named axes, so a test can say exactly what is similar to what. */
const AXES = ['pet', 'travel', 'food', 'work', 'family', 'misc1', 'misc2', 'misc3'];
const at = (axis: string, weight = 1): number[] => {
  const v = AXES.map((a) => (a === axis ? weight : 0.05));
  return v;
};

describe('standouts', () => {
  it('keeps items well above the median and drops the rest', () => {
    const vectors = new Map([
      ['dog', at('pet')],
      ['flight', at('travel')],
      ['ramen', at('food')],
      ['job', at('work')],
      ['mom', at('family')],
    ]);
    const m = standouts(at('pet'), vectors);
    expect([...m.keys()]).toEqual(['dog']);
    expect(m.get('dog')).toBeGreaterThanOrEqual(MIN_MARGIN);
  });

  it('finds nothing when nothing stands out', () => {
    const flat = new Map([
      ['a', [1, 1, 1]],
      ['b', [1, 1, 1]],
      ['c', [1, 1, 1]],
    ]);
    expect(standouts([1, 1, 1], flat).size).toBe(0);
  });
});

/** An embedder whose answers the test controls, one promise per call. */
function controlledEmbedder(vectorFor: (text: string) => number[]) {
  const pending: Array<() => void> = [];
  const calls: Array<{ texts: string[]; role: string }> = [];
  const embed: RetrievalEmbedder = (texts, role) => {
    calls.push({ texts, role });
    return new Promise((resolve) => {
      pending.push(() => resolve(texts.map(vectorFor)));
    });
  };
  const flush = async () => {
    while (pending.length) pending.shift()?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { embed, calls, flush };
}

const items = [
  { id: 'dog', text: 'Biscuit breed: golden retriever' },
  { id: 'flight', text: 'Sam travel plan: book flights to Lisbon' },
  { id: 'ramen', text: 'Sam favorite food: spicy ramen' },
  { id: 'job', text: 'Sam job: engineer' },
  { id: 'mom', text: 'Mom health: knee surgery' },
];
const meaning = (text: string): number[] =>
  /retriever|pup/i.test(text)
    ? at('pet')
    : /flights|trip/i.test(text)
      ? at('travel')
      : /ramen|hungry/i.test(text)
        ? at('food')
        : /engineer/i.test(text)
          ? at('work')
          : /surgery|mother/i.test(text)
            ? at('family')
            : at('misc1');

describe('createSemanticIndex', () => {
  it('embeds the items as documents and the turn as a query, then matches by meaning', async () => {
    const e = controlledEmbedder(meaning);
    const index = createSemanticIndex(items, e.embed);
    await e.flush();
    await index.ready;
    expect(e.calls[0].role).toBe('document');
    expect(e.calls[0].texts.slice(0, items.length)).toEqual(items.map((i) => i.text));

    index.observe('how is the pup doing');
    expect(index.matches().size).toBe(0); // not embedded yet: never waits
    await e.flush();
    expect(e.calls[1]).toEqual({ texts: ['how is the pup doing'], role: 'query' });
    expect([...index.matches().keys()]).toEqual(['dog']);
  });

  it("drops a turn's embedding when the next turn starts, even one that lands late", async () => {
    const e = controlledEmbedder(meaning);
    const index = createSemanticIndex(items, e.embed);
    await e.flush();
    index.observe('how is the pup doing');
    index.newTurn();
    await e.flush();
    expect(index.matches().size).toBe(0);
  });

  it('keeps one request in flight and embeds only the newest transcript after it', async () => {
    const e = controlledEmbedder(meaning);
    const index = createSemanticIndex(items, e.embed);
    await e.flush();
    index.observe('so I was thinking about');
    index.observe('so I was thinking about that trip');
    index.observe('so I was thinking about that trip we planned');
    expect(e.calls).toHaveLength(2); // documents + the first query
    await e.flush();
    await e.flush();
    expect(e.calls.map((c) => c.texts[0])).toEqual([
      items[0].text,
      'so I was thinking about',
      'so I was thinking about that trip we planned',
    ]);
    expect([...index.matches().keys()]).toEqual(['flight']);
  });

  it('ignores transcripts too short to search with', async () => {
    const e = controlledEmbedder(meaning);
    const index = createSemanticIndex(items, e.embed);
    await e.flush();
    index.observe('yeah');
    index.observe('the pup');
    expect(e.calls).toHaveLength(1);
  });

  it('matches nothing when the items could not be embedded', async () => {
    const embed: RetrievalEmbedder = vi.fn(async (_texts, role) => {
      if (role === 'document') throw new Error('quota');
      return [at('pet')];
    });
    const index = createSemanticIndex(items, embed);
    await index.ready;
    index.observe('how is the pup doing');
    await new Promise((r) => setTimeout(r, 0));
    expect(index.matches().size).toBe(0);
  });
});

describe('withinTokens', () => {
  it('keeps best-first items until the budget runs out', () => {
    const texts = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)]; // 10 tokens each
    expect(withinTokens(texts, (t) => t, 25)).toEqual(texts.slice(0, 2));
    expect(withinTokens(texts, (t) => t, 0)).toEqual([]);
  });
});

describe('semanticRecallEnabled', () => {
  it('is off unless SEMANTIC_RECALL=on', () => {
    expect(semanticRecallEnabled({})).toBe(false);
    expect(semanticRecallEnabled({ SEMANTIC_RECALL: 'true' })).toBe(false);
    expect(semanticRecallEnabled({ SEMANTIC_RECALL: 'on' })).toBe(true);
  });
});
