/**
 * Knowledge Graph Storage Layer
 *
 * @module memory/knowledge-graph/storage
 */

import { getCorrelationEngine } from '../../entity-store/correlation-engine.js';

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
 * Get active correlations for a user.
 *
 * Delegates to the CorrelationEngine for "Better Than Human" pattern recognition.
 * This enables insights like: "I've noticed that when you talk about your mom,
 * it's usually after stressful work days."
 */
export async function getActiveCorrelations(
  userId: string,
  options?: { minConfidence?: number; limit?: number }
): Promise<Array<{ id: string; type: string; description: string; confidence: number }>> {
  try {
    const engine = getCorrelationEngine();
    const correlations = await engine.getCorrelations(userId, {
      minStrength: options?.minConfidence ?? 0.5,
      limit: options?.limit ?? 20,
    });

    return correlations.map((c) => ({
      id: c.id,
      type: c.type,
      description: c.description,
      confidence: c.confidence,
    }));
  } catch {
    // Graceful degradation - return empty if engine fails
    return [];
  }
}
