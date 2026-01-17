/**
 * Knowledge Graph Storage Layer
 *
 * @module memory/knowledge-graph/storage
 */

export {
  createInsight,
  updateInsight,
  getInsight,
  getAllInsights,
  getInsightsReadyToSurface,
  getInsightsForEntities,
  deleteInsight,
  deleteExpiredInsights,
  deleteNegativeInsights,
  createInsightsBatch,
  getInsightStats,
  recordInsightSurfaced,
  recordInsightFeedback,
  DEFAULT_COOLDOWN_HOURS,
  DEFAULT_MAX_SURFACE_ATTEMPTS,
  DEFAULT_RECEPTIVITY_THRESHOLD,
} from './insight-store.js';

export {
  createThread,
  updateThread,
  getThread,
  getActiveThreads,
  getThreadsForEntity,
  getOpenLoopThreads,
  closeThread,
  recordThreadSession,
  addOpenQuestion,
  resolveOpenQuestion,
  getThreadStats,
  findOrCreateThread,
  markDormantThreads,
} from './thread-store.js';

/**
 * Stub for getActiveCorrelations - returns empty array
 * TODO: Implement when correlation tracking is fully built out
 */
export async function getActiveCorrelations(
  _userId: string,
  _options?: { minConfidence?: number; limit?: number }
): Promise<Array<{ id: string; type: string; description: string; confidence: number }>> {
  return [];
}
