/**
 * Domain Services Index
 *
 * Domain services contain business logic that doesn't naturally fit
 * within a single entity. They are PURE - no I/O dependencies.
 *
 * @module personality/domain/services
 */

export { AnticipationEngine, type AnticipationContext } from './anticipation-engine.js';

export {
  TimingCalculator,
  type UserIntent,
  type SuggestedResponse,
  type TimingAnalysis,
  type MessageMetadata,
} from './timing-calculator.js';

export { VulnerabilityScorer, type VulnerabilityDetectionResult } from './vulnerability-scorer.js';
