/**
 * @ferni/intelligence-worker
 *
 * Intelligence worker platform for Ferni - pattern detection, predictive analytics,
 * trust recording, and collective learning.
 *
 * Architecture:
 * ```
 * Voice Agent → Pub/Sub → Intelligence Workers → Firestore → Insights
 *               (async)    (process)             (store)     (apply)
 * ```
 *
 * This package runs as a separate Cloud Run service, processing intelligence
 * events that were previously fire-and-forget in the voice agent.
 */

export * from './types.js';
export * from './logger.js';
export * from './handlers/index.js';

