import { describe, expect, it } from 'vitest';
import { cosine, displayText, rankFacts, type RankableFact } from '../recall-ranking.js';
import { loadRecallSnapshot, recallForTurn } from '../session-recall.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-02T00:00:00Z');

const f = (
  entity: string,
  key: string,
  value: string,
  extra: Partial<RankableFact> = {}
): RankableFact => ({
  entity,
  key,
  value,
  confidence: 0.8,
  ...extra,
});

describe('rankFacts', () => {
  it('prefers named entities, then overlap, then confidence and recency', () => {
    const facts = [
      f('Biscuit', 'breed', 'golden retriever', { updatedAtMs: NOW - 200 * DAY }),
      f('Biscuit', 'favorite_toy', 'squeaky duck', { updatedAtMs: NOW - DAY }),
      f('Dana', 'job', 'accountant'),
    ];
    const ranked = rankFacts(facts, 'Biscuit lost his duck', {
      maxItems: 5,
      maxChars: 1000,
      now: NOW,
    });
    expect(ranked.map((r) => r.fact.key)).toEqual(['favorite_toy', 'breed']);
  });

  it('caps by item count and by character budget', () => {
    const facts = Array.from({ length: 10 }, (_, i) => f('Biscuit', `k${i}`, 'x'.repeat(40)));
    expect(rankFacts(facts, 'Biscuit', { maxItems: 3, maxChars: 10_000 })).toHaveLength(3);
    // Each fact displays as ~50 chars; 120 chars fits two.
    expect(rankFacts(facts, 'Biscuit', { maxItems: 10, maxChars: 120 })).toHaveLength(2);
    // The best fact always fits unless told otherwise.
    expect(rankFacts(facts, 'Biscuit', { maxItems: 10, maxChars: 5 })).toHaveLength(1);
    expect(
      rankFacts(facts, 'Biscuit', { maxItems: 10, maxChars: 5, firstAlwaysFits: false })
    ).toHaveLength(0);
  });

  it('always includes matching user-edited facts, beyond the item cap', () => {
    const facts = [
      f('Biscuit', 'a', 'one', { confidence: 1 }),
      f('Biscuit', 'b', 'two', { confidence: 1 }),
      f('Biscuit', 'breed', 'goldendoodle', {
        userEdited: true,
        confidence: 0.1,
        text: 'Biscuit is a goldendoodle',
      }),
    ];
    const ranked = rankFacts(facts, 'Biscuit', { maxItems: 1, maxChars: 1000 });
    expect(ranked.map((r) => r.fact.key).sort()).toEqual(['a', 'breed']);
    expect(displayText(ranked.find((r) => r.fact.userEdited)!.fact)).toBe(
      'Biscuit is a goldendoodle'
    );
  });

  it('adds facts that are close in meaning, and falls back to keywords without vectors', () => {
    const dog = f('Biscuit', 'species', 'dog');
    const job = f('Dana', 'job', 'accountant');
    const vectors = new Map<RankableFact, number[]>([
      [dog, [1, 0, 0]],
      [job, [0, 1, 0]],
    ]);
    const query = 'my pup has been so naughty';
    expect(rankFacts([dog, job], query, { maxItems: 5, maxChars: 1000 })).toEqual([]);
    const ranked = rankFacts([dog, job], query, {
      maxItems: 5,
      maxChars: 1000,
      queryEmbedding: [0.9, 0.1, 0],
      factEmbedding: (x) => vectors.get(x),
    });
    expect(ranked.map((r) => r.fact)).toEqual([dog]);
    expect(ranked[0].similarity).toBeGreaterThan(0.9);
  });

  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });
});

describe('loadRecallSnapshot ordering and caps', () => {
  it('keeps the most recently updated facts and every user-edited one', async () => {
    const docs = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `old${i}`,
        entityName: 'Biscuit',
        key: `old_${i}`,
        value: 'v',
        confidence: 0.9,
        updatedAt: new Date(NOW - (100 + i) * DAY),
      })),
      {
        id: 'new',
        entityName: 'Biscuit',
        key: 'new',
        value: 'v',
        confidence: 0.5,
        updatedAt: new Date(NOW),
      },
      {
        id: 'edited',
        entityName: 'Biscuit',
        key: 'breed',
        value: 'golden retriever',
        text: 'Biscuit is a goldendoodle',
        userEdited: true,
        confidence: 1,
        updatedAt: new Date(NOW - 400 * DAY),
      },
    ];
    const snap = await loadRecallSnapshot(
      { facts: async () => docs, summaries: async () => [] },
      'u1',
      3
    );
    expect(snap.facts.map((x) => x.id)).toEqual(['edited', 'new', 'old0']);
    const edited = snap.facts[0];
    expect(edited.text).toBe('Biscuit is a goldendoodle');
    expect(recallForTurn(snap, 'how is Biscuit')[0].id).toBe('edited');
  });

  it('reads contract-only facts that carry just text', async () => {
    const snap = await loadRecallSnapshot(
      {
        facts: async () => [
          { id: 'f1', text: 'Allergic to peanuts', userEdited: true, confidence: 1 },
        ],
        summaries: async () => [],
      },
      'u1'
    );
    expect(recallForTurn(snap, 'can I eat peanuts?').map((x) => x.id)).toEqual(['f1']);
  });
});

describe('recall weight (graceful decay)', () => {
  it('ranks a faded fact below an equally relevant fresh one, but keeps it', async () => {
    const { rankFacts: rank } = await import('../recall-ranking.js');
    const faded = {
      entity: 'user',
      key: 'likes',
      value: 'jazz music',
      confidence: 0.9,
      recallWeight: 0.05,
    };
    const fresh = { entity: 'user', key: 'enjoys', value: 'jazz music', confidence: 0.9 };
    const out = rank([faded, fresh], 'jazz music', { maxItems: 5, maxChars: 1000 });
    expect(out.map((r) => r.fact)).toEqual([fresh, faded]);
  });

  it('never fades a fact the user corrected', async () => {
    const { recallWeightFactor } = await import('../recall-ranking.js');
    expect(
      recallWeightFactor({
        entity: 'u',
        key: 'k',
        value: 'v',
        confidence: 1,
        recallWeight: 0.05,
        userEdited: true,
      })
    ).toBe(1);
    expect(
      recallWeightFactor({ entity: 'u', key: 'k', value: 'v', confidence: 1, recallWeight: 0.05 })
    ).toBeCloseTo(0.525);
  });
});
