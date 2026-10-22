/**
 * Per-turn memory search returned nothing even when it found the memory: it
 * kept results scoring >= 0.3 then >= 0.45, but the score is a reciprocal-rank
 * fusion score, at most 0.6 / 61 = 0.0098 for a memory. TURN_MEMORY_RRF_SCALE
 * gates on the vector leg's cosine instead. Runs the real retrieveForTurn,
 * runHybridSearchWithTimeout, hybridSearch and fusion; only the stores are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Hit = { documentId: string; score: number; text: string };
const store = vi.hoisted(() => ({
  memories: [] as Hit[],
  entities: [] as Array<{ id: string; score: number; text: string }>,
  bm25Calls: 0,
  associativeCalls: 0,
}));

vi.mock('../semantic-memory-search.js', () => ({
  // The vector store's contract: cosine similarity, best first, >= minScore.
  searchMemories: async (_q: string, _u: string, opts: { topK: number; minScore: number }) => ({
    results: store.memories
      .filter((m) => m.score >= opts.minScore)
      .slice(0, opts.topK)
      .map((m) => ({ ...m, source: 'conversation', sourceId: 's1' })),
  }),
}));
vi.mock('../bm25-search.js', () => ({
  searchEntitiesBM25: async () => {
    store.bm25Calls++;
    return store.entities.map((e) => ({ ...e, metadata: {} }));
  },
}));
vi.mock('../../entity-store/storage.js', () => ({
  findEntityByAlias: async () => null,
  searchEntities: async () => [],
}));
// Prod's rerank is an LLM call against a 50 ms budget; it passes order through here.
vi.mock('../cross-encoder.js', () => ({
  rerankHybridResults: async (_q: string, results: unknown[]) => results,
}));
vi.mock('../../associative-memory.js', () => ({
  getAssociativeMemory: () => ({
    getTriggeredMemories: async () => {
      store.associativeCalls++;
      return [{ activationStrength: 0.9, naturalReference: 'that trip to the lake', memory: { source: { documentId: 'assoc-1' } } }]; // prettier-ignore
    },
  }),
}));

import type { HybridSearchResult } from '../hybrid-search.js';
import { retrieveForTurn } from '../turn-memory-retrieval.js';
import { MIN_TURN_MEMORY_COSINE, scaleTurnMemories } from '../turn-memory-scale.js';

let session = 0;
const turn = (transcript: string) =>
  retrieveForTurn({ userId: 'u1', sessionId: `s${++session}`, transcript, turnNumber: 2 });

const VET = { documentId: 'biscuit-vet', score: 0.71, text: 'Biscuit is limping, vet on Monday' };
const BREED = { documentId: 'biscuit', score: 0.58, text: 'Biscuit is a golden retriever' };
const MOM = { documentId: 'mom', score: 0.47, text: 'mom is recovering from knee surgery' };

describe('per-turn memory search scale', () => {
  beforeEach(() => {
    store.memories = [VET, BREED, MOM];
    store.entities = [{ id: 'e-biscuit', score: 3.2, text: 'Biscuit' }];
    store.bm25Calls = 0;
    store.associativeCalls = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('flag off (today): finds three memories and returns none, the fused score is never 0.3', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'off');
    const context = await turn("how's the pup doing, he was limping");
    expect(context.memories).toEqual([]);
    expect(context.metrics.rawResultCount).toBe(0);
    expect(store.bm25Calls).toBe(1); // all three legs still run
    expect(store.associativeCalls).toBe(0);
  });

  it('flag on: the relevant memories reach the turn, best first, scored by cosine', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    const context = await turn("how's the pup doing, he was limping");
    expect(context.memories.map((m) => [m.id, m.relevance])).toEqual([
      ['biscuit-vet', 0.71],
      ['biscuit', 0.58],
    ]);
  });

  it('flag on: a memory under the cosine floor, keyword entities and associative recall stay out', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    const context = await turn("how's the pup doing, he was limping");
    const ids = context.memories.map((m) => m.id);
    expect(ids).not.toContain('mom'); // 0.47: past the store's 0.3, not about the turn
    expect(ids).not.toContain('e-biscuit');
    expect(ids).not.toContain('assoc-1');
    expect(store.bm25Calls).toBe(0);
    expect(store.associativeCalls).toBe(0);
  });

  it('flag on: a turn about nothing gets nothing', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    store.memories = [{ documentId: 'car', score: 0.47, text: 'needs an oil change' }];
    expect((await turn('yeah the weather has been fine I guess')).memories).toEqual([]);
  });
});

describe('scaleTurnMemories', () => {
  const result = (id: string, vector?: number): HybridSearchResult => ({
    id,
    score: 0.0098,
    text: id,
    type: 'memory',
    sources: ['vector'],
    scoreBreakdown: {},
    legScores: vector === undefined ? { bm25: 7 } : { vector },
  });

  it('keeps cosine >= the floor, best first, and drops results with no vector score', () => {
    const kept = scaleTurnMemories([
      result('low', MIN_TURN_MEMORY_COSINE - 0.001),
      result('edge', MIN_TURN_MEMORY_COSINE),
      result('keyword-only'),
      result('high', 0.8),
    ]);
    expect(kept.map((r) => [r.id, r.score])).toEqual([
      ['high', 0.8],
      ['edge', MIN_TURN_MEMORY_COSINE],
    ]);
  });
});
