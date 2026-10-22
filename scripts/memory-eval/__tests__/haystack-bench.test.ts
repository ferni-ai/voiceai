/**
 * The haystack bench's run (haystack-bench.ts embeds, then runs this with
 * HAYSTACK_BENCH_VECTORS set; skipped otherwise), and haystack-lib's tests.
 * The real runHybridSearchWithTimeout, hybridSearch, fusion, scaleTurnMemories,
 * capTurnMemories and retrieveForTurn run over each caller's store padded to
 * 15, 100, 300 and 1,000 memories; the vector store is replaced by cosine over
 * the embedded memories, with its contract (best first, >= minScore, topK).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHaystack,
  expandTemplate,
  haystackTurns,
  scoreHaystack,
  seededRandom,
  wilson,
  withCi,
  type HaystackCases,
  type HaystackMemory,
  type HaystackScore,
  type HaystackTurn,
  type MemoryKind,
} from '../haystack-lib.js';
import type { BenchCaller } from '../recall-bench-lib.js';
import { cosine } from '../turn-memory-bench-lib.js';

const fixture = vi.hoisted(() => ({
  stores: new Map<string, Array<{ id: string; text: string; vector: number[] }>>(),
  turns: new Map<string, number[]>(),
}));

vi.mock('../../../src/memory/retrieval/semantic-memory-search.js', () => ({
  searchMemories: async (query: string, userId: string, o: { topK: number; minScore: number }) => {
    const store = fixture.stores.get(userId);
    const q = fixture.turns.get(query);
    if (!store || !q) throw new Error(`no fixture: ${userId} "${query}"`);
    const results = store
      .map((m) => ({ documentId: m.id, text: m.text, score: cosine(q, m.vector) }))
      .filter((r) => r.score >= o.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, o.topK)
      .map((r) => ({ ...r, source: 'conversation', sourceId: 'haystack' }));
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

import type { HybridSearchResult } from '../../../src/memory/retrieval/hybrid-search.js';
import { runHybridSearchWithTimeout } from '../../../src/memory/retrieval/hybrid-search-timeout-stats.js';
import { retrieveForTurn } from '../../../src/memory/retrieval/turn-memory-retrieval.js';
import {
  MIN_TURN_MEMORY_COSINE,
  capTurnMemories,
  scaleTurnMemories,
} from '../../../src/memory/retrieval/turn-memory-scale.js';

const vectorsFile = process.env.HAYSTACK_BENCH_VECTORS;
const SIZES = [15, 100, 300, 1000];
const FLOORS = [0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
const CAPS = [5, 3, 2, 1]; // 5 = no cap: retrieveForTurn's maxMemories
const MAX_MEMORIES = 5;
const TOTAL_TIMEOUT_MS = 1900; // retrieveForTurn's totalTimeoutMs

function loadCases(): { callers: BenchCaller[]; cases: HaystackCases } {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')); // prettier-ignore
  return { callers: (read('recall-cases.json') as { callers: BenchCaller[] }).callers, cases: read('fixtures/haystack-cases.json') as HaystackCases }; // prettier-ignore
}

type Run = { turn: HaystackTurn; results: HybridSearchResult[]; real: string[] };

let session = 0;
async function runSize(callers: BenchCaller[], cases: HaystackCases, size: number) {
  const runs: Run[] = [];
  const kinds = new Map<string, MemoryKind>();
  const sizes: number[] = [];
  for (const caller of callers) {
    const userId = `${caller.name}@${size}`;
    const store: HaystackMemory[] = buildHaystack(caller, cases, size);
    sizes.push(store.length);
    for (const m of store) kinds.set(m.id, m.kind);
    fixture.stores.set(
      userId,
      store.map((m) => ({ ...m, vector: vectorOf(m.text) }))
    );
    for (const turn of haystackTurns(caller, cases)) {
      // retrieveForTurn skips a transcript under 10 characters before searching.
      const results = turn.text.length < 10 ? [] : (await runHybridSearchWithTimeout(userId, turn.text, TOTAL_TIMEOUT_MS, true)).results; // prettier-ignore
      const context = await retrieveForTurn({ userId, sessionId: `haystack-${++session}`, transcript: turn.text, turnNumber: 2 }); // prettier-ignore
      runs.push({ turn, results, real: context.memories.map((m) => m.id) });
    }
  }
  return { runs, kinds, sizes };
}

const sent = (results: HybridSearchResult[], floor: number, cap: number) =>
  capTurnMemories(scaleTurnMemories(results, floor), true, cap).slice(0, MAX_MEMORIES).map((r) => r.id); // prettier-ignore

let vectors: Record<string, number[]> = {};
function vectorOf(text: string): number[] {
  const v = vectors[text];
  if (!v) throw new Error(`no vector for "${text}"`);
  return v;
}

function tables(
  rows: Array<{ size: number; label: string; floor: number; byCap: Map<number, HaystackScore> }>
): string {
  const pr = (s: HaystackScore) =>
    `${s.sent} | ${withCi(s.right, s.sent)} | ${withCi(s.found, s.labelled)}`;
  const out: string[] = [];
  out.push('### Floor and cap by store size\n');
  out.push('Precision = labelled-for-the-turn share of memories sent; recall = labelled memories sent; neg = turns about nothing (small talk + backchannels) that got any memory. 95% Wilson intervals in brackets. Negative-turn rates do not depend on the cap.\n'); // prettier-ignore
  out.push('| store | floor | neg sent | backchannel sent | no cap (5): sent | precision | recall | cap 3: sent | precision | recall |'); // prettier-ignore
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const s5 = r.byCap.get(5) as HaystackScore;
    out.push(`| ${r.label} | ${r.floor.toFixed(2)} | ${withCi(s5.negativesSent, s5.negatives)} | ${withCi(s5.backchannelsSent, s5.backchannels)} | ${pr(s5)} | ${pr(r.byCap.get(3) as HaystackScore)} |`); // prettier-ignore
  }
  out.push('\n### Tighter caps\n');
  out.push(
    '| store | floor | cap 2: sent | precision | recall | cap 1: sent | precision | recall |'
  );
  out.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.label} | ${r.floor.toFixed(2)} | ${pr(r.byCap.get(2) as HaystackScore)} | ${pr(r.byCap.get(1) as HaystackScore)} |`); // prettier-ignore
  out.push('\n### What the wrong memories were (cap 3)\n');
  out.push('near = same person/pet/place, different fact; generic = everyday padding; labelled = a real memory about something else; stale = the superseded side of an update pair. stale on update = update turns that got the superseded fact.\n'); // prettier-ignore
  out.push('| store | floor | wrong | near | generic | labelled | stale | stale on update |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const s = r.byCap.get(3) as HaystackScore;
    const w = s.wrong;
    out.push(`| ${r.label} | ${r.floor.toFixed(2)} | ${s.sent - s.right} | ${w.near} | ${w.generic} | ${w.labelled + w.fresh} | ${w.stale} | ${s.staleSent}/${s.updates} |`); // prettier-ignore
  }
  return out.join('\n');
}

describe.skipIf(!vectorsFile)('haystack bench', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('scores floor x cap at each store size, and the real path matches at 0.55 / cap 3', async () => {
    vectors = (JSON.parse(readFileSync(vectorsFile ?? '', 'utf8')) as { vectors: Record<string, number[]> }).vectors; // prettier-ignore
    for (const [text, v] of Object.entries(vectors)) fixture.turns.set(text, v);
    const { callers, cases } = loadCases();
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    vi.stubEnv('TURN_MEMORY_MAX_INJECT', '');
    const rows: Parameters<typeof tables>[0] = [];
    const checks: string[] = [];
    for (const size of SIZES) {
      const { runs, kinds, sizes } = await runSize(callers, cases, size);
      const kindOf = (id: string) => kinds.get(id) ?? 'generic';
      const label = `${size} (${Math.min(...sizes)}-${Math.max(...sizes)})`;
      // The bench's own gate must be the production one: retrieveForTurn, flag on, defaults.
      const mismatched = runs.filter((r) => sent(r.results, MIN_TURN_MEMORY_COSINE, 3).join() !== r.real.join()); // prettier-ignore
      checks.push(`${label}: retrieveForTurn (flag on, defaults) = bench gate at 0.55 / cap 3 on ${runs.length - mismatched.length}/${runs.length} turns`); // prettier-ignore
      expect(mismatched.map((r) => r.turn.text)).toEqual([]);
      for (const floor of FLOORS) {
        const byCap = new Map(CAPS.map((cap) => [cap, scoreHaystack(runs.map((r) => ({ turn: r.turn, found: sent(r.results, floor, cap) })), kindOf)] as const)); // prettier-ignore
        rows.push({ size, label, floor, byCap });
      }
    }
    const turns = haystackTurns(callers[0] as BenchCaller, cases).length;
    const report = `${tables(rows)}\n\n### Production-path check\n\n${checks.map((c) => `- ${c}`).join('\n')}\n`; // prettier-ignore
    console.log(`\n${callers.length} callers, ${turns}+ turns each\n${report}`);
    if (process.env.HAYSTACK_RESULTS_OUT) writeFileSync(process.env.HAYSTACK_RESULTS_OUT, report);
  }, 600_000);
});

describe('haystack-lib', () => {
  const { callers, cases } = loadCases();
  const sam = callers.find((c) => c.name === 'Sam') as BenchCaller;

  it('builds the same store every run, and a bigger store holds every memory of a smaller one', () => {
    const a = buildHaystack(sam, cases, 300);
    expect(buildHaystack(sam, cases, 300)).toEqual(a);
    expect(buildHaystack(sam, cases, 1000).slice(0, 300)).toEqual(a);
    expect(new Set(buildHaystack(sam, cases, 1000).map((m) => m.text)).size).toBe(1000);
  });

  it('keeps every labelled memory and both sides of each update, and pads with near misses and generic memories', () => {
    const store = buildHaystack(sam, cases, 1000);
    const count = (k: MemoryKind) => store.filter((m) => m.kind === k).length;
    expect([count('labelled'), count('stale'), count('fresh')]).toEqual([18, 3, 3]);
    expect(count('near') / (count('near') + count('generic'))).toBeGreaterThan(0.3);
    expect(buildHaystack(sam, cases, 15)).toHaveLength(24); // smaller than the base: the base
  });

  it('never pads with a labelled memory', () => {
    for (const caller of callers) {
      const own = new Set(caller.items.map(([, t]) => t.toLowerCase()));
      expect(buildHaystack(caller, cases, 1000).filter((m) => m.kind !== 'labelled' && own.has(m.text.toLowerCase()))).toEqual([]); // prettier-ignore
    }
  });

  it('fills every slot of a template', () => {
    expect(expandTemplate({ t: '{name}: {a} on {b}', a: ['x', 'y'], b: ['1', '2'] }, { name: 'N' })).toEqual(['N: x on 1', 'N: x on 2', 'N: y on 1', 'N: y on 2']); // prettier-ignore
  });

  it('seededRandom repeats for a seed and differs across seeds', () => {
    const run = (seed: number) => Array.from({ length: 3 }, seededRandom(seed));
    expect(run(1)).toEqual(run(1));
    expect(run(1)).not.toEqual(run(2));
  });

  it('wilson: known interval for 8 of 10, and [0, 1] for nothing', () => {
    const [lo, hi] = wilson(8, 10);
    expect(lo).toBeCloseTo(0.4902, 3);
    expect(hi).toBeCloseTo(0.9433, 3);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });

  it('scores right and wrong memories, negatives, backchannels and stale facts', () => {
    const kinds: Record<string, MemoryKind> = { a: 'labelled', old: 'stale', new: 'fresh', n: 'near', g: 'generic' }; // prettier-ignore
    const t = (kind: HaystackTurn['kind'], expect: string[]): HaystackTurn => ({ text: kind, expect, kind }); // prettier-ignore
    const s = scoreHaystack(
      [
        { turn: t('about', ['a']), found: ['a', 'n'] },
        { turn: t('update', ['new']), found: ['old', 'new'] },
        { turn: t('backchannel', []), found: ['g'] },
        { turn: t('small-talk', []), found: [] },
      ],
      (id) => kinds[id] ?? 'generic'
    );
    expect([s.sent, s.right, s.labelled, s.found]).toEqual([5, 2, 2, 2]);
    expect([s.negatives, s.negativesSent, s.backchannels, s.backchannelsSent]).toEqual([
      2, 1, 1, 1,
    ]);
    expect([s.updates, s.staleSent]).toEqual([1, 1]);
    expect(s.wrong).toEqual({ labelled: 0, stale: 1, fresh: 0, near: 1, generic: 1 });
  });
});
