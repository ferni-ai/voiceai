/**
 * Emotional State Builder
 *
 * Builds emotional state from message analysis and voice emotion.
 * Includes voice-text mismatch detection for "better than human" emotional intelligence.
 */

import { getEmotionalArcTracker } from '../../conversation/index.js';
import {
  buildMismatchGuidance,
  detectMismatch,
  type MismatchResult,
} from '../../intelligence/detectors/voice-mismatch.js';
import { getEmotionGuidance } from '../../speech/emotion-matching.js';
import type { EmotionalState, TurnAnalysisResult, TurnContext } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended emotional state with optional mismatch detection
 */
export interface EmotionalStateWithMismatch extends EmotionalState {
  mismatch?: MismatchResult;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build emotional state from analysis and voice emotion
 * Now includes voice-text mismatch detection for "better than human" emotional intelligence
 */
export function buildEmotionalState(
  ctx: TurnContext,
  analysisResult: TurnAnalysisResult
): EmotionalStateWithMismatch {
  const { userData, userText } = ctx;
  const { analysis } = analysisResult;

  const emotionalArc = getEmotionalArcTracker();

  // Record emotion (combines text and voice)
  emotionalArc.recordEmotion(analysis.emotion || null, userData.voiceEmotion || null);

  const arc = emotionalArc.getArc();
  const emotionalResponse = emotionalArc.getResponseRecommendation();
  const transitionPhrase = emotionalArc.getTransitionPhrase();

  // Get emotion guidance for voice emotion mirroring
  const { emotionModulation } = userData;
  const emotionalGuidance = emotionModulation ? getEmotionGuidance(emotionModulation) : null;

  // "Better than human" - detect when voice contradicts words
  // (e.g., "I'm fine" + trembling voice)
  const mismatch = detectMismatch(userText, userData.voiceEmotion || null, analysis.emotion);

  // Combine guidance if there's a mismatch
  let combinedGuidance = emotionalResponse.guidance || emotionalGuidance || undefined;
  if (mismatch.hasMismatch && mismatch.confidence > 0.5) {
    const mismatchGuidance = buildMismatchGuidance(mismatch);
    if (mismatchGuidance) {
      combinedGuidance = combinedGuidance
        ? `${combinedGuidance}\n\n${mismatchGuidance}`
        : mismatchGuidance;
    }
  }

  return {
    primary: analysis.emotion.primary,
    intensity: analysis.emotion.intensity || 0.5,
    distressLevel: analysis.emotion.distressLevel || 0,
    trajectory: arc.trajectory,
    responseGuidance: combinedGuidance,
    transitionPhrase: transitionPhrase || undefined,
    mismatch: mismatch.hasMismatch ? mismatch : undefined,
  };
}
