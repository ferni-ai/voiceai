/**
 * Hybrid-search-with-timeout wrapper + observability for per-turn memory
 * retrieval. `totalTimeoutMs` (turn-memory-retrieval.ts DEFAULT_CONFIG) was
 * raised 100ms -> 350ms on 2026-10-03 (see PR #175): the old 70ms slice
 * (100 * 0.7) was smaller than this module's own documented sub-component
 * latencies (../CLAUDE.md "Performance": vector search alone 50-150ms, plus
 * an embed() network round trip before Firestore/BM25/entity store even
 * run), so every turn in a live dev call hit "Hybrid search timeout" and
 * fell back to zero memories. That bump was reasoned from docs, not
 * measured end-to-end in prod - track actual attempts/timeouts here so the
 * budget can be tuned from real data instead of re-guessed later.
 * 2026-10-05: measured on dev, 61 of 61 searches missed 245 ms (p50 705, p90
 * 1316 ms); raised to 1900 ms (a 1330 ms race). It runs beside the
 * background turn's processing (~1.2 s), not on the reply's path.
 *
 * Split out of turn-memory-retrieval.ts to keep that file under the quality
 * ratchet's line-count limit. No external caller imports these names from
 * turn-memory-retrieval.ts today (checked via grep), so nothing re-exports
 * them from there; import directly from this module instead.
 *
 * @module memory/retrieval/hybrid-search-timeout-stats
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  hybridSearch,
  type HybridSearchMetrics,
  type HybridSearchResult,
} from './hybrid-search.js';

const log = createLogger({ module: 'HybridSearchTimeout' });

let hybridSearchAttempts = 0;
let hybridSearchTimeouts = 0;

/** Record one hybrid-search attempt (call before starting the search). */
export function recordHybridSearchAttempt(): void {
  hybridSearchAttempts++;
}

/**
 * Run `hybridSearch()` racing against `totalTimeoutMs * 0.7`, recording the
 * attempt for {@link getHybridSearchTimeoutStats}. Extracted from
 * `retrieveForTurn()` so the timeout plumbing lives with its observability.
 */
export async function runHybridSearchWithTimeout(
  userId: string,
  transcript: string,
  totalTimeoutMs: number
): Promise<{ results: HybridSearchResult[]; metrics: HybridSearchMetrics }> {
  recordHybridSearchAttempt();
  const budgetMs = totalTimeoutMs * 0.7;
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const search = hybridSearch(userId, transcript, {
    topK: 10,
    minScore: 0.3, // Lower threshold, we'll filter later
    bm25Weight: 0.4,
    vectorWeight: 0.6,
    includeEntities: true,
  });
  // A search that loses the race still finishes. Log how late, per leg, so the
  // budget is set from what the search actually takes (dev 2026-10-05: 20 of
  // 20 per-turn searches missed 245 ms, and nothing recorded by how much).
  search
    .then(({ metrics }) => {
      if (!timedOut) return;
      log.info(
        {
          totalMs: Date.now() - startedAt,
          budgetMs,
          bm25Ms: metrics.bm25LatencyMs,
          vectorMs: metrics.vectorLatencyMs,
          entityMs: metrics.entityLatencyMs,
          fusionMs: metrics.fusionLatencyMs,
        },
        'HYBRID_SEARCH_LATE'
      );
    })
    .catch(() => undefined);
  try {
    return await Promise.race([
      search,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error('Hybrid search timeout'));
        }, budgetMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record the outcome of a failed `retrieveForTurn` call against the
 * timeout stats. Returns whether `error` was specifically a hybrid-search
 * timeout, so the caller's log line can decide whether to attach stats.
 */
export function recordHybridSearchOutcome(error: unknown): boolean {
  const isTimeout = error instanceof Error && error.message === 'Hybrid search timeout';
  if (isTimeout) {
    hybridSearchTimeouts++;
  }
  return isTimeout;
}

/**
 * Observability stats for the hybrid-search timeout budget. Call this from
 * a health/metrics endpoint to see whether `totalTimeoutMs` is well-tuned:
 * a near-zero `timeoutRate` means there's room to lower it back down for
 * latency; a high rate means the budget (or the underlying search latency)
 * still needs work.
 */
export function getHybridSearchTimeoutStats(): {
  attempts: number;
  timeouts: number;
  timeoutRate: number;
} {
  return {
    attempts: hybridSearchAttempts,
    timeouts: hybridSearchTimeouts,
    timeoutRate: hybridSearchAttempts > 0 ? hybridSearchTimeouts / hybridSearchAttempts : 0,
  };
}

/**
 * Reset hybrid-search timeout counters (for tests).
 */
export function resetHybridSearchTimeoutStats(): void {
  hybridSearchAttempts = 0;
  hybridSearchTimeouts = 0;
}
