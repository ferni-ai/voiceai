/**
 * Haystack stores for the per-turn memory bench (haystack-bench.ts): each
 * labelled caller from recall-cases.json, padded with seeded distractors
 * from fixtures/haystack-cases.json to a given store size, plus the scoring.
 * Pure, so its tests need no model.
 *
 * The 0.55 cosine floor (turn-memory-scale.ts) was set on 12-18 memories per
 * caller. A fixed floor admits more near misses as the store grows, so this
 * builds the same callers at hundreds of memories and scores floor and cap
 * there.
 */
import { ANCHORS } from '../../src/memory/recall/semantic-recall.js';
import { storedFactText } from '../../src/memory/recall/stored-fact-vectors.js';
import type { BenchCaller } from './recall-bench-lib.js';

type Template = { t: string } & Record<string, string | string[]>;

export interface HaystackCases {
  seed: number;
  /** Share of the padding drawn from same-subject near misses (the rest is generic). */
  nearShare: number;
  backchannels: string[];
  generic: Template[];
  callers: Record<
    string,
    { updates: { items: Array<[string, string]>; turns: BenchCaller['turns'] }; near: Template[] }
  >;
}

/** What a memory in the haystack is: a labelled one, one side of an update pair, or padding. */
export type MemoryKind = 'labelled' | 'stale' | 'fresh' | 'near' | 'generic';

export interface HaystackMemory {
  id: string;
  text: string;
  kind: MemoryKind;
}

export interface HaystackTurn {
  text: string;
  expect: string[];
  kind: 'about' | 'update' | 'small-talk' | 'backchannel';
}

/** mulberry32: a small seeded PRNG, so every run builds the same stores. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Every filling of a template's {slots}, each slot over its list of values. */
export function expandTemplate(template: Template, fixed: Record<string, string> = {}): string[] {
  let texts = [template.t];
  for (const [slot, values] of Object.entries(template)) {
    if (slot === 't' || !Array.isArray(values)) continue;
    texts = texts.flatMap((text) => values.map((v) => text.split(`{${slot}}`).join(v)));
  }
  return texts.map((text) =>
    Object.entries(fixed).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), text)
  );
}

/**
 * The caller's store at `size` memories: the labelled memories and both sides
 * of each update pair, then padding drawn near/generic at `nearShare`, seeded
 * per caller. A bigger store holds every memory of a smaller one, so sizes
 * differ only by what was added. A size below the base gives the base.
 */
export function buildHaystack(
  caller: BenchCaller,
  cases: HaystackCases,
  size: number
): HaystackMemory[] {
  const own = cases.callers[caller.name];
  if (!own) throw new Error(`no haystack cases for ${caller.name}`);
  const base: HaystackMemory[] = [
    ...caller.items.map(([id, text]) => ({ id, text, kind: 'labelled' as const })),
    ...own.updates.items.map(([id, text]) => ({ id, text, kind: id.endsWith('-old') ? ('stale' as const) : ('fresh' as const) })), // prettier-ignore
  ];
  const seen = new Set(base.map((m) => m.text.toLowerCase()));
  const pool = (templates: Template[], fixed?: Record<string, string>) =>
    [...new Set(templates.flatMap((t) => expandTemplate(t, fixed)))].filter((t) => !seen.has(t.toLowerCase())); // prettier-ignore
  const random = seededRandom(cases.seed + [...caller.name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0)); // prettier-ignore
  const near = shuffle(pool(own.near), random);
  const generic = shuffle(pool(cases.generic, { name: caller.name }), random);
  const out = [...base];
  let n = 0;
  let g = 0;
  while (out.length < size && (n < near.length || g < generic.length)) {
    const takeNear = g >= generic.length || (n < near.length && random() < cases.nearShare);
    const text = takeNear ? near[n++] : generic[g++];
    out.push({ id: `${takeNear ? 'near' : 'generic'}-${out.length}`, text: text ?? '', kind: takeNear ? 'near' : 'generic' }); // prettier-ignore
  }
  if (out.length < size) throw new Error(`${caller.name}: only ${out.length} memories for size ${size}`); // prettier-ignore
  return out;
}

/** The labelled turns, the update turns and the backchannels, each tagged by kind. */
export function haystackTurns(caller: BenchCaller, cases: HaystackCases): HaystackTurn[] {
  const own = cases.callers[caller.name];
  return [
    ...caller.turns.map(([text, expect]) => ({ text, expect, kind: expect.length ? ('about' as const) : ('small-talk' as const) })), // prettier-ignore
    ...(own?.updates.turns ?? []).map(([text, expect]) => ({ text, expect, kind: 'update' as const })), // prettier-ignore
    ...cases.backchannels.map((text) => ({ text, expect: [], kind: 'backchannel' as const })),
  ];
}

/** 95% Wilson score interval for k of n. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export interface HaystackScore {
  sent: number;
  /** Of the memories sent to turns about something, how many were labelled for the turn. */
  right: number;
  labelled: number;
  found: number;
  negatives: number;
  /** Turns about nothing (small talk and backchannels) that got any memory. */
  negativesSent: number;
  backchannels: number;
  backchannelsSent: number;
  /** Update turns that got the superseded memory. */
  updates: number;
  staleSent: number;
  /** Wrong memories sent, by what they were. */
  wrong: Record<MemoryKind, number>;
}

export function scoreHaystack(
  outcomes: Array<{ turn: HaystackTurn; found: string[] }>,
  kindOf: (id: string) => MemoryKind
): HaystackScore {
  const s: HaystackScore = { sent: 0, right: 0, labelled: 0, found: 0, negatives: 0, negativesSent: 0, backchannels: 0, backchannelsSent: 0, updates: 0, staleSent: 0, wrong: { labelled: 0, stale: 0, fresh: 0, near: 0, generic: 0 } }; // prettier-ignore
  for (const { turn, found } of outcomes) {
    s.sent += found.length;
    for (const id of found) {
      if (turn.expect.includes(id)) s.right++;
      else s.wrong[kindOf(id)]++;
    }
    if (turn.expect.length === 0) {
      s.negatives++;
      if (found.length) s.negativesSent++;
      if (turn.kind === 'backchannel') {
        s.backchannels++;
        if (found.length) s.backchannelsSent++;
      }
    } else {
      s.labelled += turn.expect.length;
      s.found += turn.expect.filter((id) => found.includes(id)).length;
    }
    if (turn.kind === 'update') {
      s.updates++;
      if (found.some((id) => kindOf(id) === 'stale')) s.staleSent++;
    }
  }
  return s;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "95% [91-98]" for k of n; "n/a" when nothing was counted. */
export function withCi(k: number, n: number): string {
  if (n === 0) return 'n/a';
  const [lo, hi] = wilson(k, n);
  return `${pct(k / n)} [${Math.round(lo * 100)}-${Math.round(hi * 100)}]`;
}

/**
 * When a memory was saved, seeded per caller and memory: the stale side of an
 * update 300-700 days before 2026-10-01, the fresh side 0-120 days, the rest
 * anywhere in 0-700 days. The per-turn judge reads these dates.
 */
export function savedAt(callerName: string, memory: HaystackMemory): Date {
  let h = 2166136261;
  for (const ch of `${callerName}|${memory.id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; // prettier-ignore
  const u = h / 4294967296;
  const daysAgo = memory.kind === 'stale' ? 300 + u * 400 : memory.kind === 'fresh' ? u * 120 : u * 700; // prettier-ignore
  return new Date(Date.UTC(2026, 9, 1) - Math.round(daysAgo) * 86_400_000);
}

/** Which half a turn is in: "dev" to choose settings on, "held-out" to report. Seeded by the turn text (FNV-1a). */
export function turnHalf(text: string): 'dev' | 'held-out' {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % 2 === 0 ? 'dev' : 'held-out';
}

/** fixtures/haystack-followups.json: per caller, [first turn, the next thing said on the same subject]. */
export type FollowUps = { callers: Record<string, Array<[string, string]>> };

/** Where a caller's own memories sit among their dynamic_facts: older than every distractor, or newer. */
export type Placement = 'targets-oldest' | 'targets-newest';

/**
 * The haystack as dynamic_facts documents, newest first, for the
 * RECALL_VECTOR_INDEX arm (__tests__/vector-index-haystack.test.ts).
 * "Biscuit breed: golden retriever" becomes entity Biscuit, key breed, so the
 * text recall embeds (stored-fact-vectors.ts factText) is the memory's own; a
 * memory not in that form (a thread, Ferni's own line) is a note about the
 * caller. The caller's labelled and update memories (fresh before stale) come
 * first or last. Recall loads only the newest 300 (session-recall.ts), so
 * last puts them past that window once the store is bigger.
 */
export function factDocs(
  callerName: string,
  store: HaystackMemory[],
  placement: Placement
): Array<{ id: string; doc: Record<string, unknown> }> {
  const rank: Record<MemoryKind, number> = { fresh: 0, labelled: 1, stale: 2, near: 3, generic: 3 };
  const own = store.filter((m) => rank[m.kind] < 3).sort((a, b) => rank[a.kind] - rank[b.kind]);
  const padding = store.filter((m) => rank[m.kind] === 3);
  const newestFirst = placement === 'targets-newest' ? [...own, ...padding] : [...padding, ...own];
  return newestFirst.map((m, i) => {
    const parts = /^(\S+) ([^:]+): (.+)$/.exec(m.text);
    const [entityName, key, value] = parts ? [parts[1], (parts[2] as string).replace(/ /g, '_'), parts[3]] : [callerName, 'note', m.text]; // prettier-ignore
    const extractedAt = new Date(Date.UTC(2026, 9, 1) - i * 6 * 3_600_000).toISOString();
    return { id: m.id, doc: { entityName, key, value, confidence: 0.9, extractedAt } };
  });
}

/** Facts per caller in the RECALL_VECTOR_INDEX arm: at 300 every fact is loaded; at 1,000, 700 are not. */
export const VECTOR_INDEX_SIZES = [300, 1000];

/** Every text that arm embeds, by role: the facts and anchors as documents, the turns as queries. */
export function vectorIndexTexts(
  callers: BenchCaller[],
  cases: HaystackCases
): { document: string[]; query: string[] } {
  const document = new Set<string>(ANCHORS);
  const query = new Set<string>();
  for (const caller of callers) {
    const store = buildHaystack(caller, cases, Math.max(...VECTOR_INDEX_SIZES));
    for (const { doc } of factDocs(caller.name, store, 'targets-oldest')) document.add(storedFactText(doc)); // prettier-ignore
    for (const t of haystackTurns(caller, cases)) query.add(t.text);
  }
  return { document: [...document], query: [...query] };
}
