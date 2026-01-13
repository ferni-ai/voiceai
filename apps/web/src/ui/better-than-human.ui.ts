/**
 * Ferni EQ - Superhuman Emotional Intelligence
 *
 * BACKWARD COMPATIBILITY SHIM
 * This file re-exports from the new modular eq/ system.
 * New code should import from '../eq/index.js' directly.
 *
 * CAPABILITIES:
 * 1. MICRO-EXPRESSIONS - Subliminal 40-150ms emotional flashes
 * 2. BREATH SYNCHRONIZATION - Neural mirroring with user
 * 3. EMPATHETIC NODDING - Active listening micro-nods
 * 4. CONCERN DETECTION - Subtle distress signal recognition
 * 5. ANTICIPATORY EMOTIONS - Reading emotions before fully expressed
 *
 * BRAND PHILOSOPHY:
 * "Better than human" means understanding things humans don't notice about themselves.
 *
 * @see design-system/docs/brand/BETTER-THAN-HUMAN.md
 * @deprecated Import from '../eq/index.js' instead
 */

// ============================================================================
// RE-EXPORTS FROM NEW EQ MODULE
// ============================================================================

// Types
export type {
  MicroExpression,
  MicroExpressionTriggerContent,
  ActiveListeningState,
  NodIntensity,
  BreathSyncState,
  ConcernLevel,
  ConcernState,
  ConcernAnalysisInput,
  AnticipationInput,
  BetterThanHumanSignalType,
  BetterThanHumanSignal,
} from '../eq/types.js';

// Capabilities
export {
  // Micro-expressions
  playMicroExpression,
  detectAndTriggerMicroExpression,
  enforceMicroExpressionTiming,
  MICRO_EXPRESSIONS,
  MICRO_EXPRESSION_MIN_MS,
  MICRO_EXPRESSION_MAX_MS,
  type MicroExpressionType,
  // Active listening
  startActiveListening,
  stopActiveListening,
  onUserSpeechPause,
  getActiveListeningState,
  getPausePatterns,
  clearPausePatterns,
  setAvatarContainer,
  isListening,
  // Breath sync
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
  // Concern detection
  analyzeConcern,
  getConcernState,
  getConcernLevel,
  getConcernTriggers,
  resetConcernState,
  getTriggerCategories,
  // Anticipation
  anticipateEmotion,
  hasMemoryReference,
  hasConcerningPattern,
  hasPositivePattern,
} from '../eq/capabilities/index.js';

// Bridge
export {
  handleBetterThanHumanSignal,
  handleBehaviorModeShift,
  handleBehaviorExpression,
  handleBehaviorHoldSpace,
  handleBehaviorProcessing,
  initBetterThanHumanSignalHandlers,
  initBehaviorSignalHandlers,
  disposeSignalHandlers,
} from '../eq/bridge/index.js';

// Main exports
export {
  ferni,
  initFerniEQ,
  disposeFerniEQ,
  isEQInitialized,
  beyondPixarUI,
  initBeyondPixarUI,
  beyondPixar,
  initBeyondPixar,
} from '../eq/index.js';
