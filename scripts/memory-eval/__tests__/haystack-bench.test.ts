/**
 * The haystack bench's run (haystack-bench.ts embeds, then runs this with
 * HAYSTACK_BENCH_VECTORS set; skipped otherwise), and haystack-lib's tests.
 * The real runHybridSearchWithTimeout, hybridSearch, fusion, scaleTurnMemories,
 * capTurnMemories and retrieveForTurn run over each caller's store padded to
 * 15, 100, 300 and 1,000 memories; the vector store is replaced by cosine over
 * the embedded memories, with its contract (best first, >= minScore, topK).
 * The TURN_MEMORY_RERANK rows run retrieveForTurn with the judge's replies
 * replayed: tests cannot reach Google Cloud (src/tests/gcp-test-guard.ts), so
 * a first run with HAYSTACK_JUDGE_PROMPTS_OUT records the prompts the real
 * path builds, haystack-bench.ts asks the model outside vitest and records
 * each reply and its latency, and this run replays them after that latency.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHaystack,
  expandTemplate,
  haystackTurns,
  savedAt,
  scoreHaystack,
  turnHalf,
  type FollowUps,
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
  stores: new Map<string, Array<{ id: string; text: string; vector: number[]; savedAt: string }>>(),
  turns: new Map<string, number[]>(),
}));

vi.mock('../../../src/memory/retrieval/semantic-memory-search.js', () => ({
  searchMemories: async (
    query: string,
    userId: string,
    o: { topK: number; minScore: number; includeTimestamp?: boolean }
  ) => {
    // prettier-ignore
    const store = fixture.stores.get(userId);
    const q = fixture.turns.get(query);
    if (!store || !q) throw new Error(`no fixture: ${userId} "${query}"`);
    const results = store
      .map((m) => ({
        documentId: m.id,
        text: m.text,
        score: cosine(q, m.vector),
        ...(o.includeTimestamp && { timestamp: m.savedAt }),
      })) // prettier-ignore
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
const judge = vi.hoisted(() => ({ replies: new Map<string, { text: string; ms: number }>(), unanswered: new Set<string>(), calls: 0 })); // prettier-ignore
vi.mock('../../../src/config/generative-model.js', () => ({
  getGenerativeModel: async () => ({
    generateContent: async (prompt: string) => {
      judge.calls++;
      const reply = judge.replies.get(prompt);
      if (!reply) {
        judge.unanswered.add(prompt);
        throw new Error('no recorded judge reply');
      }
      await new Promise((resolve) => setTimeout(resolve, reply.ms));
      return { response: { text: () => reply.text } };
    },
  }),
}));
// Prod's rerank is an LLM call against a 50 ms budget; order passes through.
vi.mock('../../../src/memory/retrieval/cross-encoder.js', () => ({
  rerankHybridResults: async (_q: string, results: unknown[]) => results,
}));

import type { HybridSearchResult } from '../../../src/memory/retrieval/hybrid-search.js';
import { runHybridSearchWithTimeout } from '../../../src/memory/retrieval/hybrid-search-timeout-stats.js';
import { retrieveForTurn } from '../../../src/memory/retrieval/turn-memory-retrieval.js';
import { settleTurnMemoryJudges } from '../../../src/memory/retrieval/turn-memory-pending.js';
import { gateTurnMemories } from '../../../src/memory/retrieval/turn-memory-rerank.js';
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

type Run = { userId: string; turn: HaystackTurn; results: HybridSearchResult[]; real: string[] };

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
      store.map((m) => ({ ...m, vector: vectorOf(m.text), savedAt: savedAt(caller.name, m).toISOString() })) // prettier-ignore
    );
    for (const turn of haystackTurns(caller, cases)) {
      // retrieveForTurn skips a transcript under 10 characters before searching.
      const results = turn.text.length < 10 ? [] : (await runHybridSearchWithTimeout(userId, turn.text, TOTAL_TIMEOUT_MS, true)).results; // prettier-ignore
      const context = await retrieveForTurn({ userId, sessionId: `haystack-${++session}`, transcript: turn.text, turnNumber: 2 }); // prettier-ignore
      runs.push({ userId, turn, results, real: context.memories.map((m) => m.id) });
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

const JUDGE_BUDGET_MS = 150;
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))] ?? 0; // prettier-ignore

/** retrieveForTurn over each run's turn with the env given, a few turns at a time. */
async function realPath(runs: Run[], env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const out: Array<{ ids: string[]; ms: number; judged: boolean }> = [];
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < runs.length; i = next++) {
      const { turn, userId } = runs[i] as Run;
      const context = await retrieveForTurn({ userId, sessionId: `haystack-${++session}`, transcript: turn.text, turnNumber: 2 }); // prettier-ignore
      out[i] = { ids: context.memories.map((m) => m.id), ms: context.metrics.rerankMs, judged: context.metrics.rerankingApplied }; // prettier-ignore
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const k of Object.keys(env)) vi.stubEnv(k, '');
  return out;
}

/**
 * The TURN_MEMORY_RERANK arms at one store size, each through the real
 * retrieveForTurn: the runner-up gate alone (timeout 0), the judge with no
 * deadline, and the judge at JUDGE_BUDGET_MS. Against them, 0.55 / cap 3 and
 * 0.65 / cap 1 on the floor alone.
 */
async function rerankRows(label: string, runs: Run[], kindOf: (id: string) => MemoryKind) {
  const arm = (timeoutMs: number) => realPath(runs, { TURN_MEMORY_RERANK: 'on', TURN_MEMORY_RERANK_TIMEOUT_MS: String(timeoutMs) }); // prettier-ignore
  const gate = await arm(0);
  const judged = await arm(5000);
  const budget = await arm(JUDGE_BUDGET_MS);
  // The gate's own cost: gateTurnMemories minus scaleTurnMemories over the same results.
  const env = { TURN_MEMORY_RRF_SCALE: 'on', TURN_MEMORY_RERANK: 'on' };
  const gateMs = runs.map((r) => {
    const t0 = performance.now();
    for (let k = 0; k < 100; k++) void gateTurnMemories(r.results, { transcript: r.turn.text }, true, { rerankMs: 0, rerankingApplied: false }, env); // prettier-ignore
    const t1 = performance.now();
    for (let k = 0; k < 100; k++) scaleTurnMemories(r.results);
    return Math.max(0, t1 - t0 - (performance.now() - t1)) / 100;
  });
  const asked = judged.filter((j) => j.ms > 0);
  const score = (out: Array<{ ids: string[] }>) => scoreHaystack(runs.map((r, i) => ({ turn: r.turn, found: (out[i] as { ids: string[] }).ids })), kindOf); // prettier-ignore
  const floorOnly = (floor: number, cap: number) => scoreHaystack(runs.map((r) => ({ turn: r.turn, found: sent(r.results, floor, cap) })), kindOf); // prettier-ignore
  const ms = (xs: number[], digits: number) => `${quantile(xs, 0.5).toFixed(digits)} / ${quantile(xs, 0.95).toFixed(digits)}`; // prettier-ignore
  const inTime = budget.filter((b) => b.judged).length;
  const arms: Array<[string, HaystackScore, string]> = [
    ['floor 0.55 / cap 3 (RRF_SCALE today)', floorOnly(MIN_TURN_MEMORY_COSINE, 3), '0 / 0'],
    ['floor 0.65 / cap 1', floorOnly(0.65, 1), '0 / 0'],
    ['RERANK: runner-up gate (timeout 0)', score(gate), ms(gateMs, 3)],
    [
      'RERANK: judge, timeout 5000',
      score(judged),
      ms(
        asked.map((j) => j.ms),
        0
      ),
    ],
    [`RERANK: judge, timeout ${JUDGE_BUDGET_MS} (judge in time ${inTime}/${asked.length})`, score(budget), ms(budget.filter((b) => b.ms > 0).map((b) => b.ms), 0)], // prettier-ignore
  ];
  const rows = arms.map(([name, s, added]) => {
    const smallTalk = withCi(s.negativesSent - s.backchannelsSent, s.negatives - s.backchannels);
    return `| ${label} | ${name} | ${s.sent} | ${withCi(s.right, s.sent)} | ${withCi(s.found, s.labelled)} | ${smallTalk} | ${withCi(s.backchannelsSent, s.backchannels)} | ${s.staleSent}/${s.updates} | ${added} |`; // prettier-ignore
  });
  const late = judged.filter((j) => !j.judged && j.ms >= 5000).length; // over the timeout: the gate's answer, as in prod
  return { rows, answered: judged.filter((j) => j.judged).length, late, asked: asked.length };
}

/** A held-out first turn, the follow-up on the same subject, and a turn that changes the subject. */
type Pair = { userId: string; first: HaystackTurn; next: string; other: HaystackTurn };

function followUpPairs(callers: BenchCaller[], cases: HaystackCases, size: number): Pair[] {
  const followUps = JSON.parse(readFileSync(new URL('../fixtures/haystack-followups.json', import.meta.url), 'utf8')) as FollowUps; // prettier-ignore
  const pairs: Pair[] = [];
  for (const caller of callers) {
    const turns = haystackTurns(caller, cases);
    const smallTalk = turns.filter((t) => t.kind === 'small-talk');
    (followUps.callers[caller.name] ?? []).forEach(([text, next], i) => {
      const first = turns.find((t) => t.text === text);
      if (!first || turnHalf(text) !== 'held-out') return;
      // The subject changes to another labelled subject or to small talk, alternately.
      const elsewhere = turns.filter((t) => t.expect.length > 0 && !t.expect.some((e) => first.expect.includes(e))); // prettier-ignore
      const pool = i % 2 === 0 ? elsewhere : smallTalk;
      pairs.push({ userId: `${caller.name}@${size}`, first, next, other: pool[i % pool.length] as HaystackTurn }); // prettier-ignore
    });
  }
  return pairs;
}

const ASYNC_ENV = [
  'TURN_MEMORY_RERANK',
  'TURN_MEMORY_RERANK_TIMEOUT_MS',
  'TURN_MEMORY_JUDGE_ASYNC',
];

/** Turn 2 then turn 3 of one session per pair, through retrieveForTurn; the judge is back before turn 3. */
async function twoTurns(pairs: Pair[], judgeAsync: boolean, second: (p: Pair) => string) {
  ASYNC_ENV.forEach((k, i) => vi.stubEnv(k, ['on', '0', judgeAsync ? 'on' : 'off'][i] as string));
  const out: Array<[string[], string[]]> = [];
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < pairs.length; i = next++) {
      const p = pairs[i] as Pair;
      const sessionId = `haystack-${++session}`;
      const ask = async (transcript: string, turnNumber: number) => (await retrieveForTurn({ userId: p.userId, sessionId, transcript, turnNumber })).memories.map((m) => m.id); // prettier-ignore
      const first = await ask(p.first.text, 2);
      await settleTurnMemoryJudges(sessionId);
      out[i] = [first, await ask(second(p), 3)];
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const k of ASYNC_ENV) vi.stubEnv(k, '');
  return out;
}

/**
 * Gate alone against gate + async judge over a 2-turn window of held-out
 * pairs: precision and recall over both turns' memories against the first
 * turn's labels, the superseded fact on update pairs, and what the carried
 * picks put into a turn that changed the subject.
 */
async function asyncRows(
  label: string,
  pairs: Pair[],
  runs: Run[],
  kindOf: (id: string) => MemoryKind
) {
  const gate = await twoTurns(pairs, false, (p) => p.next);
  const carried = await twoTurns(pairs, true, (p) => p.next);
  const gateShift = await twoTurns(pairs, false, (p) => p.other.text);
  const carriedShift = await twoTurns(pairs, true, (p) => p.other.text);
  const callsBefore = judge.calls;
  await realPath(runs, { TURN_MEMORY_RERANK: 'on', TURN_MEMORY_JUDGE_ASYNC: 'on' });
  await settleTurnMemoryJudges();
  const perTurn = (judge.calls - callsBefore) / runs.length;
  // Turn t is the gate's answer whether or not the judge runs behind it.
  expect(carried.map(([first]) => first)).toEqual(gate.map(([first]) => first));
  let wrong = 0;
  let extra = 0;
  carriedShift.forEach(([, ids], i) => {
    const added = ids.filter((id) => !(gateShift[i] as [string[], string[]])[1].includes(id));
    extra += added.length;
    wrong += added.filter((id) => !(pairs[i] as Pair).other.expect.includes(id)).length;
  });
  const row = (name: string, out: Array<[string[], string[]]>) => {
    let sent = 0, right = 0, labelled = 0, found = 0, updates = 0, stale = 0; // prettier-ignore
    out.forEach(([a, b], i) => {
      const expected = (pairs[i] as Pair).first.expect;
      const window = [...new Set([...a, ...b])];
      sent += window.length;
      right += window.filter((id) => expected.includes(id)).length;
      labelled += expected.length;
      found += expected.filter((id) => window.includes(id)).length;
      if ((pairs[i] as Pair).first.kind !== 'update') return;
      updates++;
      if (window.some((id) => kindOf(id) === 'stale')) stale++;
    });
    const shift = name.startsWith('gate +') ? `${wrong} wrong of ${extra} carried, ${pairs.length} pairs` : '-'; // prettier-ignore
    const calls = name.startsWith('gate +') ? perTurn.toFixed(2) : '0';
    return `| ${label} | ${name} | ${pairs.length} | ${sent} | ${withCi(right, sent)} | ${withCi(found, labelled)} | ${stale}/${updates} | ${shift} | ${calls} |`; // prettier-ignore
  };
  return [row('gate alone', gate), row('gate + async judge', carried)];
}

describe.skipIf(!vectorsFile)('haystack bench', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('scores floor x cap at each store size, and the real path matches at 0.55 / cap 3', async () => {
    vectors = (JSON.parse(readFileSync(vectorsFile ?? '', 'utf8')) as { vectors: Record<string, number[]> }).vectors; // prettier-ignore
    const replies = process.env.HAYSTACK_JUDGE_REPLIES;
    if (replies) for (const [prompt, reply] of Object.entries(JSON.parse(readFileSync(replies, 'utf8')) as Record<string, { text: string; ms: number }>)) judge.replies.set(prompt, reply); // prettier-ignore
    for (const [text, v] of Object.entries(vectors)) fixture.turns.set(text, v);
    const { callers, cases } = loadCases();
    vi.stubEnv('TURN_MEMORY_RRF_SCALE', 'on');
    vi.stubEnv('TURN_MEMORY_MAX_INJECT', '');
    const rows: Parameters<typeof tables>[0] = [];
    const checks: string[] = [];
    const rerank: string[] = [];
    const asyncTable: string[] = [];
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
      const carry = await asyncRows(label, followUpPairs(callers, cases, size), runs, kindOf);
      if (process.env.HAYSTACK_JUDGE_PROMPTS_OUT) {
        await realPath(runs, { TURN_MEMORY_RERANK: 'on', TURN_MEMORY_RERANK_TIMEOUT_MS: '5000' });
        continue; // recording prompts only: haystack-bench.ts asks the model, then runs again
      }
      asyncTable.push(...carry);
      const r = await rerankRows(label, runs, kindOf);
      checks.push(`${label}: judge (real retrieveForTurn, replayed replies) answered ${r.answered}/${r.asked} turns it was asked about, ${r.late} over 5000 ms`); // prettier-ignore
      // A judge with no reply falls back to the gate, which would pass for the judge here.
      expect([r.answered + r.late, judge.unanswered.size]).toEqual([r.asked, 0]);
      rerank.push(...r.rows);
    }
    if (process.env.HAYSTACK_JUDGE_PROMPTS_OUT) {
      writeFileSync(process.env.HAYSTACK_JUDGE_PROMPTS_OUT, JSON.stringify([...judge.unanswered]));
      return;
    }
    const turns = haystackTurns(callers[0] as BenchCaller, cases).length;
    const rerankTable = `### TURN_MEMORY_RERANK (cap 3 after the stage)\n\nsmall talk / backchannel = share of those turns that got any memory; stale = update turns that got the superseded fact; added = ms the stage adds to retrieveForTurn, p50 / p95 (the gate: measured in-process; the judge: wall time of the model call from this machine).\n\n| store | arm | sent | precision | recall | small talk | backchannel | stale on update | added ms p50 / p95 |\n|---|---|---|---|---|---|---|---|---|\n${rerank.join('\n')}\n`; // prettier-ignore
    const carryTable = `### TURN_MEMORY_JUDGE_ASYNC: 2-turn window, held-out pairs\n\nTurn t gets the gate's pick, the judge runs behind it, turn t+1 (a follow-up on the same subject, fixtures/haystack-followups.json) gets the gate's pick plus the carried picks. Precision and recall are over both turns' memories against turn t's labels; held-out = turnHalf(turn t). topic change = pending picks that reached a turn on another subject or small talk instead of the follow-up. judge calls = background judge calls per caller turn over every bench turn (labelled, small talk, updates, backchannels).\n\n| store | arm | pairs | sent | precision | recall | stale on update | topic change | judge calls / turn |\n|---|---|---|---|---|---|---|---|---|\n${asyncTable.join('\n')}\n`; // prettier-ignore
    const report = `${tables(rows)}\n\n${rerankTable}\n${carryTable}\n### Production-path check\n\n${checks.map((c) => `- ${c}`).join('\n')}\n`; // prettier-ignore
    console.log(`\n${callers.length} callers, ${turns}+ turns each\n${report}`);
    if (process.env.HAYSTACK_RESULTS_OUT) writeFileSync(process.env.HAYSTACK_RESULTS_OUT, report);
  }, 3_600_000);
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
