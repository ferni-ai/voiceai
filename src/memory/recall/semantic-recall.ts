/**
 * Semantic recall: find a memory by meaning, not by shared words.
 *
 * Keyword recall (session-recall.ts) can't find "Biscuit | breed = golden
 * retriever" from "how's the pup?". This embeds what a call can recall once,
 * at call start, and each user turn while it is transcribed. The turn path
 * stays synchronous: matches() uses the latest finished embedding of an
 * earlier interim of this turn, so recall adds no reply latency and never
 * makes the SDK restart a preemptive reply.
 *
 * SEMANTIC_RECALL=on turns it on.
 *
 * @module memory/recall/semantic-recall
 */

import type { RetrievalRole } from '../vectors/retrieval-embeddings.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SemanticRecall' });

export function semanticRecallEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SEMANTIC_RECALL === 'on';
}

/** Injected so tests need no network. */
export type RetrievalEmbedder = (texts: string[], role: RetrievalRole) => Promise<number[][]>;

/** The default embedding provider, loaded on first use. */
const defaultEmbedder: RetrievalEmbedder = async (texts, role) =>
  (await import('../vectors/retrieval-embeddings.js')).embedForRetrieval(texts, role);

export interface RecallItem {
  id: string;
  text: string;
}

export interface SemanticIndex {
  /** Resolves once every item is embedded (or embedding failed: then nothing matches). */
  ready: Promise<void>;
  /** Start embedding this transcript of the current turn. Never waits. */
  observe(text: string): void;
  /** Items that stand out for the latest embedded transcript of this turn: id to margin, best first. */
  matches(): Map<string, number>;
  /** The user's next turn begins: earlier embeddings no longer apply. */
  newTurn(): void;
}

/**
 * A match stands MIN_MARGIN above the median similarity and within NEAR_BEST
 * of the best. text-embedding-005, 14 memories, 15 turns (2026-10-10): real
 * references +0.08 to +0.23 ("how is that book going" -> the book +0.082);
 * small talk's best item +0.06 at most; noise trails the best by more than
 * 0.05 ("my knee is acting up": mom's knee +0.193, an oil change +0.099).
 */
export const MIN_MARGIN = 0.07;
const NEAR_BEST = 0.05;
/** A transcript this short says too little to search with. */
const MIN_QUERY_WORDS = 3;
const MAX_MATCHES = 4;

/** What one user turn may recall, in tokens of remembered text (about 4 facts and 2 stories). */
export const RECALL_TOKENS_PER_TURN = 150;

/** Rough tokens: about 4 characters each. */
export function estimateTokens(texts: string[]): number {
  return texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0);
}

/** The best-first items that fit in the budget; an item that doesn't fit ends the list. */
export function withinTokens<T>(items: T[], text: (item: T) => string, budget: number): T[] {
  const out: T[] = [];
  let used = 0;
  for (const item of items) {
    used += estimateTokens([text(item)]);
    if (used > budget) break;
    out.push(item);
  }
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/**
 * Small talk that is about nothing, embedded with the items. A caller with
 * two facts has no "rest" to stand out from; these give every search a
 * baseline of how similar unrelated text is.
 */
const ANCHORS = [
  'Okay.',
  'Sounds good to me.',
  'Thanks for asking.',
  'That makes sense.',
  'Let me think about that.',
  'Alright then.',
];

/**
 * Items whose similarity stands out: margins are over the median similarity
 * of the items and the anchors together.
 */
export function standouts(
  query: number[],
  vectors: ReadonlyMap<string, number[]>,
  anchors: number[][] = []
): Map<string, number> {
  const sims = [...vectors].map(([id, v]) => ({ id, sim: cosine(query, v) }));
  if (sims.length === 0) return new Map();
  const sorted = [...sims.map((s) => s.sim), ...anchors.map((a) => cosine(query, a))].sort(
    (a, b) => a - b
  );
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const ranked = sims
    .map((s) => ({ id: s.id, margin: s.sim - median }))
    .sort((a, b) => b.margin - a.margin);
  const best = ranked[0].margin;
  return new Map(
    ranked
      .filter((s) => s.margin >= MIN_MARGIN && s.margin >= best - NEAR_BEST)
      .slice(0, MAX_MATCHES)
      .map((s) => [s.id, s.margin])
  );
}

export function createSemanticIndex(
  items: RecallItem[],
  embed: RetrievalEmbedder = defaultEmbedder
): SemanticIndex {
  const vectors = new Map<string, number[]>();
  let anchors: number[][] = [];
  let turn = 0;
  let latest: { turn: number; vector: number[] } | undefined;
  let inFlight = false;
  let queued: { turn: number; text: string } | undefined;
  let lastObserved = '';

  const ready =
    items.length === 0
      ? Promise.resolve()
      : embed([...items.map((i) => i.text), ...ANCHORS], 'document').then(
          (vs) => {
            items.forEach((item, i) => {
              if (vs[i]?.length) vectors.set(item.id, vs[i]);
            });
            anchors = vs.slice(items.length).filter((v) => v?.length);
          },
          (error: unknown) =>
            log.warn({ error: String(error), items: items.length }, 'Recall index not built')
        );

  const run = (job: { turn: number; text: string }): void => {
    inFlight = true;
    embed([job.text], 'query')
      .then(
        ([vector]) => {
          if (job.turn === turn && vector?.length) latest = { turn: job.turn, vector };
        },
        (error: unknown) => log.debug({ error: String(error) }, 'Turn not embedded')
      )
      .finally(() => {
        inFlight = false;
        const next = queued;
        queued = undefined;
        if (next && next.turn === turn) run(next);
      });
  };

  return {
    ready,
    observe(text) {
      const t = text.trim();
      if (t === lastObserved || t.split(/\s+/).length < MIN_QUERY_WORDS) return;
      lastObserved = t;
      // One request at a time; while it runs only the newest transcript waits.
      if (inFlight) queued = { turn, text: t };
      else run({ turn, text: t });
    },
    matches() {
      if (!latest || latest.turn !== turn || vectors.size === 0) return new Map();
      return standouts(latest.vector, vectors, anchors);
    },
    newTurn() {
      turn++;
      latest = undefined;
      queued = undefined;
      lastObserved = '';
    },
  };
}
