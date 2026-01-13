/**
 * Trigger System Types
 *
 * Type definitions for the Superhuman Trigger Intelligence system.
 * Phase 1: Semantic Core - embedding-based trigger matching.
 *
 * @module TriggerTypes
 */
/**
 * Default hybrid matching config
 */
export const DEFAULT_HYBRID_CONFIG = {
    semanticThreshold: 0.65,
    patternThreshold: 0.5,
    semanticWeight: 0.6,
    patternWeight: 0.4,
    maxMatches: 5,
    enableHybrid: true,
    fallbackToPattern: true,
};
//# sourceMappingURL=types.js.map