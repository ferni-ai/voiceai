/**
 * The per-turn memory bench's run (turn-memory-bench.ts embeds, then runs
 * this with TURN_MEMORY_BENCH_VECTORS set; skipped otherwise). The real
 * retrieveForTurn, hybridSearch and fusion run over each labelled caller's
 * memories; the vector store is replaced by cosine over the embedded fixture,
 * with its contract (best first, >= minScore), and there are no entities.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BenchCaller } from '../recall-bench-lib.js';
import {
  TABLE_HEADER,
  cosine,
  formatRow,
  scoreTurns,
  type TurnOutcome,
} from '../turn-memory-bench-lib.js';

const fixture = vi.hoisted(() => ({
  callers: new Map<string, { caller: BenchCaller; items: number[][]; turns: number[][] }>(),
}));

vi.mock('../../../src/memory/retrieval/semantic-memory-search.js', () => ({
  searchMemories: async (query: string, userId: string, o: { topK: number; minScore: number }) => {
    const c = fixture.callers.get(userId);
    const t = c?.caller.turns.findIndex(([text]) => text === query) ?? -1;
    if (!c || t < 0) throw new Error(`no fixture turn: ${userId} "${query}"`);
    const results = c.caller.items
      .map(([id, text], i) => ({
        documentId: id,
        text,
        score: cosine(c.turns[t] ?? [], c.items[i] ?? []),
      })) // prettier-ignore
      .filter((r) => r.score >= o.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, o.topK)
      .map((r) => ({ ...r, source: 'conversation', sourceId: 'bench' }));
    return { results };
  },
}));
vi.mock('../../../src/memory/retrieval/bm25-search.js', () => ({ searchEntitiesBM25: async () => [] })); // prettier-ignore
vi.mock('../../../src/memory/entity-store/storage.js', () => ({
  findEntityByAlias: async () => null,
  searchEntities: async () => [],
}));
// Prod's rerank is an LLM call against a 50 ms budget; order passes through.
vi.mock('../../../src/memory/retrieval/cross-encoder.js', () => ({
  rerankHybridResults: async (_q: string, results: unknown[]) => results,
}));

import { hybridSearch } from '../../../src/memory/retrieval/hybrid-search.js';
import { retrieveForTurn } from '../../../src/memory/retrieval/turn-memory-retrieval.js';
import { scaleTurnMemories } from '../../../src/memory/retrieval/turn-memory-scale.js';

const vectorsFile = process.env.TURN_MEMORY_BENCH_VECTORS;
const PER_TURN = { topK: 10, bm25Weight: 0.4, vectorWeight: 0.6, includeEntities: true };
const MAX_MEMORIES = 5;
const TURN_THRESHOLD = 0.45; // retrieveForTurn's minRelevanceScore

function load(): Array<{ caller: BenchCaller; text: string; expect: string[] }> {
  const cases = new URL('../recall-cases.json', import.meta.url);
  const { callers } = JSON.parse(readFileSync(cases, 'utf8')) as { callers: BenchCaller[] };
  const { vectors } = JSON.parse(readFileSync(vectorsFile ?? '', 'utf8')) as {
    vectors: Record<string, { items: number[][]; turns: number[][] }>;
  };
  for (const caller of callers) {
    const v = vectors[caller.name];
    if (!v) throw new Error(`no vectors for ${caller.name}`);
    fixture.callers.set(caller.name, { caller, ...v });
  }
  return callers.flatMap((caller) => caller.turns.map(([text, expect]) => ({ caller, text, expect }))); // prettier-ignore
}

let session = 0;
async function viaRetrieveForTurn(caller: BenchCaller, text: string): Promise<string[]> {
  const context = await retrieveForTurn({ userId: caller.name, sessionId: `bench-${++session}`, transcript: text, turnNumber: 2 }); // prettier-ignore
  return context.memories.map((m) => m.id);
}

describe.skipIf(!vectorsFile)('per-turn memory bench', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('scores each gate on the labelled turns', async () => {
    const turns = load();
    const rows: Array<[string, TurnOutcome[]]> = [];
    const run = async (name: string, found: (t: (typeof turns)[number]) => Promise<string[]>) => {
      const outcomes: TurnOutcome[] = [];
      for (const t of turns) outcomes.push({ expect: t.expect, found: await found(t) });
      rows.push([name, outcomes]);
      return scoreTurns(outcomes);
    };

    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'off');
    const off = await run('main: fused >= 0.3, then >= 0.45 (flag off)', (t) => viaRetrieveForTurn(t.caller, t.text)); // prettier-ignore
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    const on = await run('cosine >= 0.55 (flag on)', (t) => viaRetrieveForTurn(t.caller, t.text)); // prettier-ignore

    // Rejected: normalise the fused score to 0-1, keep >= 0.45.
    for (const [name, norm] of [
      ['fused / (3 sources x 1/61) >= 0.45', 3 / 61],
      ["fused / (0.6/61, a memory's best) >= 0.45", 0.6 / 61],
    ] as const) {
      // prettier-ignore
      await run(name, async (t) => {
        const { results } = await hybridSearch(t.caller.name, t.text, { ...PER_TURN, minScore: 0 });
        return results.filter((r) => r.score / norm >= TURN_THRESHOLD).slice(0, MAX_MEMORIES).map((r) => r.id); // prettier-ignore
      });
    }
    // The cosine floor's trade-off.
    for (const floor of [0.45, 0.5, 0.52, 0.55, 0.57, 0.6, 0.65]) {
      await run(`cosine >= ${floor.toFixed(2)}`, async (t) => {
        const { results } = await hybridSearch(t.caller.name, t.text, { ...PER_TURN, minScore: 0, skipBM25: true }); // prettier-ignore
        return scaleTurnMemories(results, floor)
          .slice(0, MAX_MEMORIES)
          .map((r) => r.id);
      });
    }

    console.log(`\n${turns.length} labelled turns, ${turns.filter((t) => !t.expect.length).length} about nothing\n${TABLE_HEADER}`); // prettier-ignore
    for (const [name, outcomes] of rows) console.log(formatRow(name, scoreTurns(outcomes)));

    expect(off.returned).toBe(0); // today: no turn gets a memory
    expect(on.precision).toBeGreaterThanOrEqual(0.9);
    expect(on.recall).toBeGreaterThan(0.5);
  }, 120_000);
});

describe('scoreTurns', () => {
  it('scores precision per memory sent, recall per labelled memory, and false recall per empty turn', () => {
    const s = scoreTurns([
      { expect: ['a', 'b'], found: ['a', 'x'] },
      { expect: ['c'], found: [] },
      { expect: [], found: ['y'] },
      { expect: [], found: [] },
    ]);
    expect(s).toEqual({ returned: 3, precision: 1 / 3, recall: 1 / 3, hitRate: 1 / 2, falseRecallRate: 1 / 2 }); // prettier-ignore
  });
});
