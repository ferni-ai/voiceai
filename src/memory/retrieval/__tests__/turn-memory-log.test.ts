/**
 * TURN_MEMORY: one info line per caller turn, so a flag A/B can read what
 * per-turn retrieval did from the logs. Runs the real retrieveForTurn, hybrid
 * search, fusion, gate and cap; only the stores and the logger are fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Hit {
  documentId: string;
  score: number;
  text: string;
}
const fake = vi.hoisted(() => ({
  memories: [] as Hit[],
  info: [] as Array<{ fields: Record<string, unknown>; msg: unknown }>,
}));

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const logger = {
    debug: () => {},
    info: (fields: Record<string, unknown>, msg?: unknown) => fake.info.push({ fields, msg }),
    warn: () => {},
    error: () => {},
    child: () => logger,
  };
  return { ...real, createLogger: () => logger };
});
// The TURN_MEMORY_RERANK judge: keeps candidate 1 when a test turns it on.
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async () => ({
    generateContent: async () => ({ response: { text: () => '{"keep":[[1,0.9]],"old":[]}' } }),
  }),
}));
vi.mock('../semantic-memory-search.js', () => ({
  // The vector store's contract: cosine similarity, best first, >= minScore.
  searchMemories: async (_q: string, _u: string, opts: { topK: number; minScore: number }) => ({
    results: fake.memories
      .filter((m) => m.score >= opts.minScore)
      .slice(0, opts.topK)
      .map((m) => ({ ...m, source: 'conversation', sourceId: 's1' })),
  }),
}));
vi.mock('../bm25-search.js', () => ({ searchEntitiesBM25: async () => [] }));
vi.mock('../../entity-store/storage.js', () => ({
  findEntityByAlias: async () => null,
  searchEntities: async () => [],
}));
vi.mock('../cross-encoder.js', () => ({
  rerankHybridResults: async (_q: string, results: unknown[]) => results,
}));
vi.mock('../../associative-memory.js', () => ({
  getAssociativeMemory: () => ({ getTriggeredMemories: async () => [] }),
}));

import { retrieveForTurn } from '../turn-memory-retrieval.js';
import { TURN_MEMORY_LOG_MESSAGE } from '../turn-memory-log.js';

const DANA = {
  documentId: 'dana',
  score: 0.81234,
  text: 'my sister Dana is visiting this weekend',
};
const DOG = { documentId: 'dog', score: 0.5, text: 'Dana walks the dog on Sundays' };

let session = 0;
const turn = (transcript: string) =>
  retrieveForTurn({ userId: 'u1', sessionId: `s${++session}`, transcript, turnNumber: 4 });
const lines = () => fake.info.filter((l) => l.msg === TURN_MEMORY_LOG_MESSAGE).map((l) => l.fields);

describe('TURN_MEMORY per-turn info line', () => {
  beforeEach(() => {
    fake.memories = [DANA, DOG];
    fake.info = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs one line with the candidate and injected counts and the flags (RRF scale on)', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    vi.stubEnv('TURN_MEMORY_RERANK', 'off');
    const context = await turn('my sister is coming over this weekend');
    expect(context.memories.map((m) => m.id)).toEqual(['dana']); // DOG is under the 0.55 floor
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toEqual({
      turn: 4,
      candidates: 2,
      injected: 1,
      gate: false,
      rrfScale: true,
      rerank: false,
      topScore: 0.812,
      latencyMs: expect.any(Number),
    });
  });

  it('with TURN_MEMORY_RERANK on and no judge, gate is true', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    vi.stubEnv('TURN_MEMORY_RERANK', 'on');
    vi.stubEnv('TURN_MEMORY_RERANK_TIMEOUT_MS', '0');
    await turn('my sister is coming over this weekend');
    expect(lines()).toEqual([expect.objectContaining({ candidates: 2, injected: 1, gate: true, rerank: true })]); // prettier-ignore
  });

  it('when the judge answers, gate is false: the judge, not the runner-up gate, chose', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    vi.stubEnv('TURN_MEMORY_RERANK', 'on');
    vi.stubEnv('TURN_MEMORY_RERANK_TIMEOUT_MS', '500');
    const context = await turn('my sister is coming over this weekend');
    expect(context.metrics.rerankingApplied).toBe(true); // precondition: the judge answered
    expect(lines()).toEqual([expect.objectContaining({ injected: 1, gate: false, rerank: true })]);
  });

  it('a turn whose candidates all miss the floor still logs, with injected 0', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    fake.memories = [DOG];
    const context = await turn('the weather has been fine I guess');
    expect(context.memories).toEqual([]);
    expect(lines()).toEqual([expect.objectContaining({ candidates: 1, injected: 0, topScore: 0.5 })]); // prettier-ignore
  });

  it('carries no memory text: every field is a number or a boolean, and "Dana" appears nowhere', async () => {
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    await turn('my sister is coming over this weekend');
    const [fields] = lines();
    expect(fields).toBeDefined();
    for (const value of Object.values(fields)) {
      expect(['number', 'boolean']).toContain(typeof value);
    }
    expect(JSON.stringify(fields)).not.toContain('Dana');
    expect(JSON.stringify(fake.info)).not.toContain('Dana');
  });
});
