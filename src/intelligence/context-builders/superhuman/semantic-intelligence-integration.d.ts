/**
 * Semantic Intelligence Context Builder
 *
 * This builder integrates the V3.0-V3.7 Semantic Intelligence capabilities
 * into the LLM context injection system.
 *
 * Capabilities injected:
 * - V3.0: Correlation Mining, Emotional Trajectories, Relational Semantics,
 *         Counter-Factual Memory, Growth Fingerprint, Cross-Session Threading
 * - V3.2: Proactive Insights, Open Loops, Ferni Commitments
 * - V3.3: Relationship Graph
 * - V3.4: Temporal Patterns
 * - V3.5: Behavioral Intelligence
 * - V3.6: Coaching Intelligence
 * - V3.7: Self-Awareness Coaching
 *
 * @module intelligence/context-builders/superhuman/semantic-intelligence-integration
 */
import { type ContextBuilder } from '../index.js';
export declare const semanticIntelligenceBuilder: ContextBuilder;
/**
 * Clear cached context for a user (call when session ends or data changes).
 */
export declare function clearSemanticIntelligenceCache(userId?: string): void;
/**
 * Get cache statistics for monitoring.
 */
export declare function getSemanticIntelligenceCacheStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
};
export default semanticIntelligenceBuilder;
//# sourceMappingURL=semantic-intelligence-integration.d.ts.map