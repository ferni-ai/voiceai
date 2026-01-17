/**
 * EQ Capabilities - Index
 *
 * Exports all EQ capability modules.
 *
 * @module @ferni/eq/capabilities
 */

// Micro-expressions
export {
  playMicroExpression,
  detectAndTriggerMicroExpression,
  enforceMicroExpressionTiming,
  MICRO_EXPRESSIONS,
  MICRO_EXPRESSION_MIN_MS,
  MICRO_EXPRESSION_MAX_MS,
  type MicroExpressionType,
} from './micro-expressions.js';

// Active listening
export {
  startActiveListening,
  stopActiveListening,
  onUserSpeechPause,
  getActiveListeningState,
  getPausePatterns,
  clearPausePatterns,
  setAvatarContainer,
  isListening,
} from './active-listening.js';

// Breath sync
export {
  detectUserBreathRate,
  syncBreathing,
  setBreathSyncStrength,
  getBreathSyncStrength,
  setBreathSyncEnabled,
  isBreathSyncEnabled,
  getUserBreathRate,
  getBreathSyncState,
  startBreathSyncInterval,
  stopBreathSyncInterval,
} from './breath-sync.js';

// Concern detection
export {
  analyzeConcern,
  getConcernState,
  getConcernLevel,
  getConcernTriggers,
  resetConcernState,
  getTriggerCategories,
} from './concern-detection.js';

// Anticipation
export {
  anticipateEmotion,
  hasMemoryReference,
  hasConcerningPattern,
  hasPositivePattern,
} from './anticipation.js';
