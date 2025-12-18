/**
 * Anticipation Module
 *
 * Unified anticipation engine for "Better Than Human" response preparation.
 *
 * @module Anticipation
 */

export {
  getAnticipationEngine,
  resetAnticipationEngine,
  cleanupAllEngines,
  UnifiedAnticipationEngine,
  type PartialTranscript,
  type IntentPrediction,
  type EmotionPrediction,
  type ProsodyPreparation,
  type AnticipationState,
  type PrecomputedResponse,
} from './unified-anticipation.js';
