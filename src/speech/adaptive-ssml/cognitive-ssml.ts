/**
 * Cognitive-Aware SSML Tagging
 *
 * Applies cognitive intelligence adjustments to SSML output.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  applyCognitiveSpeechAdjustments,
  buildCognitiveSSML,
  type CognitiveSpeechInput,
  type CognitiveSpeechResult,
} from '../cognitive-speech-integration.js';
import { tagTextWithSsmlAdaptive } from './adaptation.js';
import type { CognitiveSsmlOptions } from './types.js';

// ============================================================================
// COGNITIVE-AWARE SSML TAGGING
// ============================================================================

/**
 * Tag text with SSML, applying cognitive intelligence adjustments.
 *
 * This is the recommended entry point for cognitive-aware speech generation.
 * It combines:
 * - Base SSML tagging
 * - Persona-specific characteristics
 * - Cognitive state adjustments (reasoning mode, confidence, etc.)
 */
export function tagTextWithCognitiveSsml(
  text: string,
  options: CognitiveSsmlOptions
): { ssml: string; cognitiveResult?: CognitiveSpeechResult } {
  const {
    speechContext,
    cognitiveGuidance,
    personaId,
    sessionId,
    emotionalWeight,
    baseCharacteristics,
  } = options;

  if (!text || text.trim().length === 0) {
    return { ssml: text };
  }

  // First, apply base SSML tagging
  let tagged = tagTextWithSsmlAdaptive(text, speechContext, personaId);

  // If we have cognitive guidance and session, apply cognitive adjustments
  let cognitiveResult: CognitiveSpeechResult | undefined;

  if (cognitiveGuidance && sessionId && baseCharacteristics) {
    const cognitiveInput: CognitiveSpeechInput = {
      speechContext,
      baseCharacteristics,
      cognitiveGuidance,
      emotionalWeight: emotionalWeight || 0.3,
    };

    cognitiveResult = applyCognitiveSpeechAdjustments(cognitiveInput, sessionId);

    // Apply cognitive SSML (thinking sounds, pauses)
    tagged = buildCognitiveSSML(tagged, cognitiveResult);

    // Log cognitive speech adjustments
    getLogger().debug(
      {
        personaId,
        cognitiveMode: cognitiveResult.debug.cognitiveMode,
        confidence: cognitiveResult.debug.confidence,
        speedMult: cognitiveResult.debug.adjustments.speedMultiplier,
        pauseMult: cognitiveResult.debug.adjustments.pauseMultiplier,
      },
      '🧠 Cognitive SSML applied'
    );
  }

  return { ssml: tagged, cognitiveResult };
}

// Re-export cognitive speech stats for monitoring
export {
  clearCognitiveSpeechState,
  getCognitiveSpeechStats,
} from '../cognitive-speech-integration.js';
