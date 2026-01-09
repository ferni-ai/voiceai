/**
 * Voice Agent Integration - Engine Access
 *
 * Access functions for various humanization engines.
 *
 * @module @ferni/humanization/voice-agent-integration/engines
 */

import { getAmbientAwarenessEngine } from '../ambient-awareness.js';
import { getBreathingSyncEngine } from '../breathing-sync.js';
import { getCrossSessionVoiceEngine } from '../cross-session-voice.js';
import { getEmotionalLeadingEngine, type UserEmotionalState } from '../emotional-leading.js';
import { getVoicePrintEngine, type VoiceSnapshot } from '../voice-print.js';

import { getSession } from './session-store.js';

// ============================================================================
// EMOTIONAL LEADING
// ============================================================================

/**
 * Get emotional leading guidance for current user state
 */
export function getEmotionalLeadingGuidance(
  sessionId: string,
  userState: UserEmotionalState,
  userMessage: string
): ReturnType<ReturnType<typeof getEmotionalLeadingEngine>['decideLeading']> | null {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const leading = getEmotionalLeadingEngine(sessionId);
  return leading.decideLeading(userState, userMessage, {
    turnCount: state.turnCount,
    comfortLevel: state.comfortLevel,
    recentTopics: state.recentTopics,
  });
}

// ============================================================================
// AMBIENT AWARENESS
// ============================================================================

/**
 * Get ambient context for conversation adaptation
 */
export function getAmbientContext(sessionId: string) {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const ambient = getAmbientAwarenessEngine(sessionId);
  return ambient.getCurrentContext();
}

/**
 * Get ambient acknowledgment if appropriate
 */
export function getAmbientAcknowledgment(sessionId: string): string | null {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const ambient = getAmbientAwarenessEngine(sessionId);
  const ack = ambient.getAcknowledgment();
  if (ack) {
    ambient.markAcknowledged();
  }
  return ack;
}

// ============================================================================
// VOICE STATE DETECTION
// ============================================================================

/**
 * Detect voice state changes from baseline
 */
export function detectVoiceState(
  sessionId: string,
  currentVoice: VoiceSnapshot
): ReturnType<ReturnType<typeof getVoicePrintEngine>['detectState']> | null {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const voicePrint = getVoicePrintEngine(state.userId);
  if (!voicePrint.isCalibrated()) {
    return null;
  }

  return voicePrint.detectState(currentVoice);
}

// ============================================================================
// CROSS-SESSION FEATURES
// ============================================================================

/**
 * Get cross-session acknowledgment if appropriate
 */
export function getCrossSessionAcknowledgment(
  sessionId: string,
  currentVoice: VoiceSnapshot
): ReturnType<ReturnType<typeof getCrossSessionVoiceEngine>['generateAcknowledgment']> | null {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const crossSession = getCrossSessionVoiceEngine(state.userId);
  return crossSession.generateAcknowledgment(currentVoice);
}

/**
 * Mark a cross-session acknowledgment as delivered
 */
export function markCrossSessionAcknowledged(sessionId: string, changeId: string): void {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return;
  }

  const crossSession = getCrossSessionVoiceEngine(state.userId);
  crossSession.markAcknowledged(changeId);
}

// ============================================================================
// BREATHING SYNC
// ============================================================================

/**
 * Get breathing sync adjustments for SSML
 */
export function getBreathingSyncAdjustments(
  sessionId: string,
  text: string,
  emotionalContext?: {
    isEmotional: boolean;
    isHeavy: boolean;
    isExcited: boolean;
  }
): ReturnType<ReturnType<typeof getBreathingSyncEngine>['calculateAdjustments']> | null {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return null;
  }

  const breathing = getBreathingSyncEngine(sessionId);
  if (!breathing.hasValidData()) {
    return null;
  }

  return breathing.calculateAdjustments(text, emotionalContext);
}

/**
 * Apply breathing sync to SSML
 */
export function applyBreathingSync(
  sessionId: string,
  ssml: string,
  adjustments: ReturnType<ReturnType<typeof getBreathingSyncEngine>['calculateAdjustments']>
): string {
  const state = getSession(sessionId);
  if (!state || !state.isActive) {
    return ssml;
  }

  const breathing = getBreathingSyncEngine(sessionId);
  return breathing.applyToSsml(ssml, adjustments);
}
