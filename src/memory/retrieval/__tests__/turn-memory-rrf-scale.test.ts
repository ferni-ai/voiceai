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
  rerankReverses: false,
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
// rerankReverses stands in for a reranker that reorders: the cap must still keep the best cosines.
vi.mock('../cross-encoder.js', () => ({
  rerankHybridResults: async (_q: string, results: unknown[]) =>
    store.rerankReverses ? [...results].reverse() : results,
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
import {
  MIN_TURN_MEMORY_COSINE,
  capTurnMemories,
  scaleTurnMemories,
  turnMemoryMaxInject,
} from '../turn-memory-scale.js';

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
    store.rerankReverses = false;
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

describe('per-turn memory cap (TURN_MEMORY_MAX_INJECT)', () => {
  // Six memories over the 0.55 floor, stored out of cosine order.
  const SIX = [0.61, 0.93, 0.58, 0.77, 0.86, 0.69].map((score, i) => ({
    documentId: `m${i}-${score}`,
    score,
    text: `memory ${i}`,
  }));
  const pup = () => turn("how's the pup doing, he was limping");
  beforeEach(() => {
    store.memories = [...SIX].sort((a, b) => b.score - a.score); // the store's contract: best first
    store.entities = [];
    store.rerankReverses = true; // the reranker hands them back worst first
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('flag on, default: six memories over the floor, exactly the three with the highest cosine reach the turn', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    vi.stubEnv('TURN_MEMORY_MAX_INJECT', '5');
    expect((await pup()).memories).toHaveLength(5); // precondition: the cap, not the floor, is what binds
    vi.stubEnv('TURN_MEMORY_MAX_INJECT', '');
    const context = await pup();
    expect(context.memories.map((m) => [m.id, m.relevance])).toEqual([
      ['m1-0.93', 0.93],
      ['m4-0.86', 0.86],
      ['m3-0.77', 0.77],
    ]);
  });

  it('flag on: TURN_MEMORY_MAX_INJECT=1 sends only the best memory', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    vi.stubEnv('TURN_MEMORY_MAX_INJECT', '1');
    expect((await pup()).memories.map((m) => m.id)).toEqual(['m1-0.93']);
  });

  it('reads TURN_MEMORY_MAX_INJECT as 1-5, default 3', () => {
    const max = (v?: string) => turnMemoryMaxInject({ TURN_MEMORY_MAX_INJECT: v });
    expect([max(), max(''), max('abc'), max('2'), max('0'), max('-4'), max('9'), max('4.7')]).toEqual([3, 3, 3, 2, 1, 1, 5, 4]); // prettier-ignore
  });

  it('flag off: results pass through untouched, the caller keeps its own limit', () => {
    const results = SIX.map((m) => ({ ...m, id: m.documentId }));
    expect(capTurnMemories(results, false, 1)).toBe(results);
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
