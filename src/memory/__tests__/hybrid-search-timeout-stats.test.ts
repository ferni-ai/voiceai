/**
 * Per-turn hybrid search races a budget. A search that loses still finishes,
 * and how late it was is logged per leg, so the budget can be set from data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logInfo = vi.hoisted(() => vi.fn());
const hybridSearch = vi.hoisted(() => vi.fn());
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: logInfo, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../retrieval/hybrid-search.js', () => ({ hybridSearch }));

import {
  getHybridSearchTimeoutStats,
  recordHybridSearchOutcome,
  resetHybridSearchTimeoutStats,
  runHybridSearchWithTimeout,
} from '../retrieval/hybrid-search-timeout-stats.js';

const metrics = {
  bm25LatencyMs: 40,
  vectorLatencyMs: 310,
  entityLatencyMs: 120,
  fusionLatencyMs: 2,
  totalLatencyMs: 312,
  sourceCounts: { bm25: 1, vector: 2, entity: 0 },
};
const finishingAfter = (ms: number) =>
  new Promise((resolve) => setTimeout(() => resolve({ results: [], metrics }), ms));

describe('runHybridSearchWithTimeout', () => {
  beforeEach(() => {
    logInfo.mockClear();
    resetHybridSearchTimeoutStats();
  });

  it('returns the search when it beats the budget, and logs nothing', async () => {
    hybridSearch.mockReturnValueOnce(finishingAfter(5));
    await expect(runHybridSearchWithTimeout('u', 'hello there', 1000)).resolves.toMatchObject({
      metrics,
    });
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('times out at 70% of the budget, then logs how late the search finished, per leg', async () => {
    hybridSearch.mockReturnValueOnce(finishingAfter(60));
    const error = await runHybridSearchWithTimeout('u', 'hello there', 40).catch((e: unknown) => e);
    expect(recordHybridSearchOutcome(error)).toBe(true);
    expect(getHybridSearchTimeoutStats()).toEqual({ attempts: 1, timeouts: 1, timeoutRate: 1 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const call = logInfo.mock.calls.find((c) => c[1] === 'HYBRID_SEARCH_LATE');
    expect(call?.[0]).toMatchObject({ budgetMs: 28, bm25Ms: 40, vectorMs: 310, entityMs: 120 });
    expect((call?.[0] as { totalMs: number }).totalMs).toBeGreaterThanOrEqual(55);
  });
});
