/**
 * Life Context Snapshot Types
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Defines the schema for collecting and synthesizing insights across all
 * personas' domains to understand the user's full life context.
 *
 * The goal is to detect patterns like:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Synthesis: "You're carrying a lot right now"
 *
 * Not reactive to words, but to LIFE CONTEXT.
 *
 * @module life-context-snapshot
 */
// ============================================================================
// DEFAULTS
// ============================================================================
/**
 * Default empty life context snapshot
 */
export const DEFAULT_LIFE_CONTEXT_SNAPSHOT = {
    userId: '',
    createdAt: new Date(),
    analysisWindowDays: 7,
    domains: {},
    stressIndicators: [],
    overallLoadScore: 0,
    wellbeingScore: 0.5,
    synthesizedTriggers: [],
    patterns: [],
    metadata: {
        domainsWithData: [],
        domainsMissingData: ['sleep', 'calendar', 'finance', 'goals', 'relationships', 'habits'],
        dataQuality: 'low',
        processingTimeMs: 0,
    },
};
/**
 * Default aggregator configuration
 */
export const DEFAULT_AGGREGATOR_CONFIG = {
    analysisWindowDays: 7,
    minConfidence: 0.3,
    maxTriggers: 5,
    supportTriggerThreshold: 0.6,
    celebrationThreshold: 0.7,
};
//# sourceMappingURL=life-context-snapshot.js.map