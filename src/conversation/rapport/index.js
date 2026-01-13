/**
 * Rapport Scoring Module
 *
 * Unified real-time conversational health tracking and repair.
 *
 * Key capabilities:
 * - Track 6 conversational health signals
 * - Calculate weighted rapport score (0-100)
 * - Detect trends (improving, declining, stable)
 * - Recommend repair strategies when rapport drops
 *
 * @module rapport
 */
// Re-export scorer
export { getActiveRapportScorerCount, getRapportScorer, RAPPORT_CONFIG, RapportScorer, rapportScorer, resetRapportScorer, } from './rapport-scorer.js';
// Re-export strategies
export { getAvailableStrategies, getStrategyContextInjection, getStrategyTtsAdjustments, selectRepairStrategy, } from './repair-strategies.js';
//# sourceMappingURL=index.js.map