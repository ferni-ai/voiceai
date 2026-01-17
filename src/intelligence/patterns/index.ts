/**
 * Pattern Detection Module
 *
 * Cross-domain pattern detection for "Better Than Human" intelligence.
 *
 * @module intelligence/patterns
 */

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
