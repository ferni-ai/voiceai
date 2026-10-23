/**
 * Which per-turn memories are relevant enough to reach the prompt, on a scale
 * that means something.
 *
 * Per-turn retrieval gated hybrid-search results on `score >= 0.3`, then
 * `>= 0.45`. That score is the reciprocal-rank-fusion score, weight / (60 +
 * rank): a memory comes only from the vector leg (weight 0.6), so its best
 * possible score is 0.6 / 61 = 0.0098. Both thresholds were written in the
 * same commit as the fusion (0fe8cc374, 2026-01-15) on a 0-1 scale it never
 * had, so per-turn search has returned no memories since.
 *
 * Normalising the fused score to 0-1 would not fix it: rank scores say how a
 * result placed, not whether it is relevant, so the best match on a turn about
 * nothing would score as high as a real one. The vector leg's cosine
 * similarity is a relevance, so TURN_MEMORY_RRF_SCALE gates on that and keeps
 * fusion for ordering only. Entity and keyword results carry no calibrated
 * score (BM25 is unbounded, salience is not about the turn), and an entity's
 * text is only its name, so with the flag on they do not reach this path.
 * Nor does associative recall: never reached before (nothing passed the
 * search), and an activation strength is not a cosine either.
 *
 * MIN_TURN_MEMORY_COSINE comes from scripts/memory-eval/turn-memory-bench.ts
 * (recall-cases.json, text-embedding-005, 2026-10-21): at 0.55, 95% of the
 * memories returned were about the turn and 72% of the relevant ones were
 * found; at 0.50 precision fell to 87%. A wrong memory reads as invented or
 * creepy recall, so the floor favours precision.
 *
 * That bench had 12-18 memories per caller. A fixed floor admits more near
 * misses as a caller's store grows into the hundreds, so with the flag on a
 * turn also gets at most TURN_MEMORY_MAX_INJECT memories (default 3, 1-5), the
 * highest cosine first. scripts/memory-eval/haystack-bench.ts measures floor
 * and cap against stores padded to 1,000 memories.
 *
 * @module memory/retrieval/turn-memory-scale
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { HybridSearchResult } from './hybrid-search.js';

/** Lowest cosine similarity between a turn and a memory that reaches the prompt. */
export const MIN_TURN_MEMORY_COSINE = 0.55;

/** Most memories one turn gets with TURN_MEMORY_RRF_SCALE on, unless TURN_MEMORY_MAX_INJECT says. */
export const DEFAULT_TURN_MEMORY_MAX_INJECT = 3;

/** TURN_MEMORY_MAX_INJECT as a whole number from 1 to 5; unset or not a number gives the default. */
export function turnMemoryMaxInject(env: Env = process.env): number {
  const raw = env.TURN_MEMORY_MAX_INJECT?.trim();
  const n = raw ? Math.floor(Number(raw)) : NaN;
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : DEFAULT_TURN_MEMORY_MAX_INJECT;
}

/** TURN_MEMORY_RRF_SCALE: gate per-turn memories on cosine, not the fused rank score. */
export function turnMemoryRrfScaleOn(env: Env = process.env): boolean {
  return flagOn('TURN_MEMORY_RRF_SCALE', env);
}

/**
 * The memories relevant to the turn, best first, each scored by its cosine
 * similarity to the turn. Results without a vector score are dropped.
 */
export function scaleTurnMemories(
  results: HybridSearchResult[],
  minCosine: number = MIN_TURN_MEMORY_COSINE
): HybridSearchResult[] {
  return results
    .map((r) => ({ ...r, score: r.legScores?.vector ?? 0 }))
    .filter((r) => r.score >= minCosine)
    .sort((a, b) => b.score - a.score);
}

/**
 * With the flag on, the `max` memories with the highest score (the cosine, after
 * scaleTurnMemories), whatever order a reranker left them in. Off: `results`
 * unchanged, so the caller's own limit applies as before.
 */
export function capTurnMemories<T extends { score: number }>(
  results: T[],
  rrfScale: boolean,
  max: number = turnMemoryMaxInject()
): T[] {
  if (!rrfScale) return results;
  return [...results].sort((a, b) => b.score - a.score).slice(0, max);
}
