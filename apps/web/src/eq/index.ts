/**
 * Ferni EQ - Superhuman Emotional Intelligence
 *
 * This module implements emotional capabilities that make Ferni "Better than Human"
 * because we operate in real-time with real humans.
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
 * @module @ferni/eq
 * @see design-system/docs/brand/BETTER-THAN-HUMAN.md
 */

import { createLogger } from '../utils/logger.js';

// Re-export types
export * from './types.js';

// Re-export capabilities
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
} from './capabilities/index.js';

// Re-export bridge
export {
  handleBetterThanHumanSignal,
  handleBehaviorModeShift,
  handleBehaviorExpression,
  handleBehaviorHoldSpace,
  handleBehaviorProcessing,
  initBetterThanHumanSignalHandlers,
  initBehaviorSignalHandlers,
  disposeSignalHandlers,
  setBridgeAvatarContainer,
  // BTH hint listener (testing)
  showBthHint,
  resetBthHintRateLimits,
} from './bridge/index.js';

// Import for initialization
import {
  setAvatarContainer,
  startBreathSyncInterval,
  stopBreathSyncInterval,
  isBreathSyncEnabled,
  startActiveListening,
  stopActiveListening,
  onUserSpeechPause,
  detectUserBreathRate,
  playMicroExpression,
  detectAndTriggerMicroExpression,
  syncBreathing,
  setBreathSyncStrength,
  setBreathSyncEnabled,
  analyzeConcern,
  getConcernState,
  anticipateEmotion,
} from './capabilities/index.js';
import {
  initBetterThanHumanSignalHandlers,
  initBehaviorSignalHandlers,
  disposeSignalHandlers,
  setBridgeAvatarContainer,
  handleBetterThanHumanSignal,
  initBthHintListener,
  disposeBthHintListener,
} from './bridge/index.js';

const log = createLogger('FerniEQ');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Ferni EQ system.
 */
export function initFerniEQ(): void {
  if (isInitialized) return;

  const avatarContainer = document.querySelector<HTMLElement>('.avatar-container');
  setAvatarContainer(avatarContainer);
  setBridgeAvatarContainer(avatarContainer);

  // Set up event listeners
  document.addEventListener('ferni:user-speech-start', () => {
    startActiveListening();
  });

  document.addEventListener('ferni:user-speech-end', () => {
    stopActiveListening();
  });

  document.addEventListener('ferni:user-speech-pause', ((e: CustomEvent) => {
    const pausePatterns = onUserSpeechPause(e.detail?.duration || 0);
    if (pausePatterns.length >= 5) {
      detectUserBreathRate(pausePatterns);
    }
  }) as EventListener);

  // Initialize signal handlers
  initBetterThanHumanSignalHandlers();
  initBehaviorSignalHandlers();
  initBthHintListener();

  // Start periodic breath sync
  startBreathSyncInterval();

  isInitialized = true;
  log.info('Ferni EQ system initialized');
}

/**
 * Dispose the Ferni EQ system.
 */
export function disposeFerniEQ(): void {
  stopBreathSyncInterval();
  disposeBthHintListener();
  disposeSignalHandlers();
  setAvatarContainer(null);
  setBridgeAvatarContainer(null);
  isInitialized = false;
  log.info('Ferni EQ system disposed');
}

/**
 * Check if EQ system is initialized
 */
export function isEQInitialized(): boolean {
  return isInitialized;
}

// ============================================================================
// FERNI EQ API OBJECT
// ============================================================================

/**
 * Ferni EQ - Superhuman Emotional Intelligence
 *
 * Access via: ferni.playMicroExpression(), ferni.anticipateEmotion(), etc.
 */
export const ferni = {
  // Micro-expressions
  playMicroExpression,
  detectAndTriggerMicroExpression,

  // Active listening
  startActiveListening,
  stopActiveListening,
  onUserSpeechPause,

  // Breath sync
  detectUserBreathRate,
  syncBreathing,
  setBreathSyncStrength,
  setBreathSyncEnabled,

  // Concern detection
  analyzeConcern,
  getConcernState,

  // Anticipation
  anticipateEmotion,

  // Better Than Human signals
  handleBetterThanHumanSignal,

  // Lifecycle
  init: initFerniEQ,
  dispose: disposeFerniEQ,
};

// Backward compatibility aliases
export const beyondPixarUI = ferni;
export const initBeyondPixarUI = initFerniEQ;
export const beyondPixar = ferni;
export const initBeyondPixar = initFerniEQ;

// Expose to window for easy browser console testing
if (typeof window !== 'undefined') {
  (window as unknown as { __ferniEQ: typeof ferni }).__ferniEQ = ferni;
}
