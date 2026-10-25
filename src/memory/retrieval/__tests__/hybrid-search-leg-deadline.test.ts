/**
 * Prod 2026-10-18..21: every per-turn "Hybrid search timeout" had the vector
 * leg (query embed + KNN) late and BM25 already answered, yet the turn got no
 * memories. A query embed that meets a 429 waits out a backoff; the turn now
 * keeps the legs that made it, and the next turn reuses the late query vector.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VertexAIEmbeddings } from '../../vectors/embeddings.js';

const embedder = vi.hoisted(() => ({
  current: undefined as undefined | { embed: (t: string) => Promise<number[]> },
}));
vi.mock('../bm25-search.js', () => ({
  searchEntitiesBM25: async () => [{ id: 'e1', score: 2, text: 'Biscuit the dog', metadata: {} }],
}));
vi.mock('../../entity-store/storage.js', () => ({
  findEntityByAlias: async () => null,
  searchEntities: async () => [],
}));
vi.mock('../semantic-memory-search.js', () => ({
  searchMemories: async (query: string) => {
    await embedder.current?.embed(query); // the vector leg's query embed
    return {
      results: [
        { documentId: 'm1', score: 0.8, text: 'walked Biscuit', source: 's', sourceId: 'x' },
      ],
    };
  },
}));

/** Vertex answers 429 once, then vectors. */
function vertexThat429sOnce() {
  let calls = 0;
  const fetch = vi.fn(async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 429, text: async () => 'Resource exhausted' };
    return {
      ok: true,
      status: 200,
      json: async () => ({ predictions: [{ embeddings: { values: [1, 0] } }] }),
    };
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('per-turn hybrid search when the query embed meets a 429', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers with the BM25 leg this turn, and has the vector leg next turn without a new request', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1); // first 429 backoff: the full 400 ms
    const fetch = vertexThat429sOnce();
    embedder.current = new VertexAIEmbeddings({
      projectId: 'p',
      accessToken: 't',
      model: 'text-embedding-005',
    });
    const { runHybridSearchWithTimeout } = await import('../hybrid-search-timeout-stats.js');

    // Budget 300 ms: the search races 210 ms, legs are cut at 160 ms. (Its
    // minScore 0.3 is above any RRF score, so `results` is empty either way:
    // what changes is that the search answers instead of throwing.)
    const thisTurn = await runHybridSearchWithTimeout('u1', 'how is Biscuit doing', 300);
    expect(thisTurn.metrics.sourceCounts).toEqual({ bm25: 1, vector: 0, entity: 0 });

    await new Promise((resolve) => {
      setTimeout(resolve, 450);
    }); // the late embed lands
    const nextTurn = await runHybridSearchWithTimeout('u1', 'how is Biscuit doing', 300);
    expect(nextTurn.metrics.sourceCounts).toEqual({ bm25: 1, vector: 1, entity: 0 });
    expect(fetch).toHaveBeenCalledTimes(2); // the 429 and its retry; next turn hit the memo
  });
});
