/**
 * Pattern Detection Module
 *
 * Cross-domain and temporal pattern detection for "Better Than Human" intelligence.
 *
 * - Level 3: Temporal Intelligence - patterns across time
 * - Level 4: Cross-Domain Correlator - patterns across life domains
 *
 * @module intelligence/patterns
 */

// ============================================================================
// LEVEL 4: CROSS-DOMAIN CORRELATOR
// ============================================================================

export {
  // Core functions
  recordDomainSignal,
  getCorrelations,
  getRelevantCorrelations,
  markCorrelationSurfaced,
  formatCorrelationsForPrompt,
  clearCorrelatorState,
  getDomainSignals,
  // Singleton accessor
  getCrossCorrelator,
  crossDomainCorrelator,
  // Types
  type CorrelationDomain,
  type DomainSignal,
  type CrossDomainCorrelation,
  type CorrelationFilterOptions,
} from './cross-domain-correlator.js';

// ============================================================================
// LEVEL 3: TEMPORAL PATTERNS
// ============================================================================

export {
  // Core functions
  recordTemporalObservation,
  analyzeTemporalPatterns,
  getTemporalPatterns,
  getRelevantTemporalPatterns,
  formatTemporalPatternsForPrompt,
  getTemporalContext,
  // Utility
  markPatternSurfaced,
  clearTemporalState,
  getObservationCount,
  // Types
  type TemporalContext,
  type TemporalPatternType,
  type TemporalPattern,
  type TemporalObservation,
} from './temporal-patterns.js';
