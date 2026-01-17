/**
 * Predictive Anticipation Engine
 *
 * @deprecated Import from './predictive-anticipation/index.js' directly
 *
 * This file re-exports the predictive anticipation module for backward compatibility.
 * The implementation has been split into focused submodules:
 *
 * - types.ts - Type definitions
 * - patterns.ts - Need detection patterns and constants
 * - index.ts - Main engine and exports
 *
 * @module conversation/predictive-anticipation
 */

export {
  PredictiveAnticipationEngine,
  getPredictiveAnticipationEngine,
  resetPredictiveAnticipationEngine,
  clearPredictiveAnticipationEngine,
  getActivePredictiveAnticipationCount,
  default,
} from './predictive-anticipation/index.js';

export type {
  EmotionalHistoryEntry,
  EmotionalPrediction,
  EmotionalTrajectory,
  NeedPrediction,
  PredictContext,
  PredictedNeed,
  PredictionResult,
  ProsodyInput,
  TopicSequencePrediction,
  TopicTransition,
  UserBaseline,
  VoiceStatePrediction,
} from './predictive-anticipation/index.js';
