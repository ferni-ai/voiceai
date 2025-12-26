/**
 * Alive Voice Module
 *
 * Makes agents come alive through:
 * 1. Sentence-level emotion arcs - emotions shift mid-sentence based on content
 * 2. Dynamic pause scaling - longer pauses for heavier topics
 * 3. Speed variation - slow for emphasis, fast for asides
 * 4. Pre-response micro-sounds - "Oh!", "Hmm...", "Wow!" openings
 * 5. Persona voice fingerprints - distinct SSML patterns per persona
 * 6. Contextual laughter - knows when a laugh would feel natural
 *
 * Philosophy: Humans don't speak with one emotion. They shift, hesitate,
 * speed up when excited, slow down when serious. This module brings
 * that natural variation to AI speech.
 *
 * @module speech/adaptive-ssml/alive-voice
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { addContextualLaughter } from '../contextual-laughter.js';
import { detectContentContext } from './context-detection.js';
import { applyEmotionArcs } from './emotion-arcs.js';
import { applyDynamicPauses } from './pauses.js';
import { addOpeningSound } from './opening-sounds.js';
import { applyPersonaFingerprint } from './persona-fingerprints.js';
import { applySpeedVariation } from './speed-variation.js';
import type { AliveVoiceContext, AliveVoiceResult } from './types.js';

const log = getLogger().child({ module: 'AliveVoice' });

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Types
export type {
  AliveVoiceContext,
  AliveVoiceResult,
  PersonaFingerprint,
  OpeningSoundOption,
  EmotionArcPattern,
  SpeedVariationPattern,
  PauseScale,
  TopicWeight,
} from './types.js';

// Emotion Arcs
export { EMOTION_ARC_PATTERNS, applyEmotionArcs } from './emotion-arcs.js';

// Pauses
export { PAUSE_SCALES, applyDynamicPauses } from './pauses.js';

// Speed Variation
export { SPEED_VARIATION_PATTERNS, applySpeedVariation } from './speed-variation.js';

// Opening Sounds
export { OPENING_SOUNDS, addOpeningSound } from './opening-sounds.js';

// Persona Fingerprints
export { PERSONA_FINGERPRINTS, applyPersonaFingerprint } from './persona-fingerprints.js';

// Nonverbals
export {
  NONVERBAL_CONFIG,
  getNonverbal,
  isNonverbalSupported,
  type NonverbalType,
} from './nonverbals.js';

// Context Detection
export { detectContentContext } from './context-detection.js';

// =============================================================================
// MAIN ORCHESTRATOR
// =============================================================================

/**
 * Apply all alive voice enhancements to text.
 * This is the main entry point that orchestrates all features.
 *
 * @param text - The text to enhance
 * @param context - Context about the conversation
 * @returns Enhanced text with all alive voice features
 */
export function makeVoiceAlive(text: string, context: AliveVoiceContext = {}): AliveVoiceResult {
  if (!text || text.trim().length === 0) {
    return { text, appliedFeatures: [] };
  }

  let result = text;
  const appliedFeatures: string[] = [];

  // 1. Detect content context (if not provided)
  const detectedContext = detectContentContext(text, context);

  // 2. Apply persona fingerprint first (sets base characteristics)
  if (context.personaId) {
    result = applyPersonaFingerprint(result, detectedContext);
    appliedFeatures.push('persona_fingerprint');
  }

  // 3. Add opening sound based on detected context
  const beforeOpening = result;
  result = addOpeningSound(result, detectedContext);
  if (result !== beforeOpening) {
    appliedFeatures.push('opening_sound');
  }

  // 4. Apply sentence-level emotion arcs
  const beforeArcs = result;
  result = applyEmotionArcs(result, detectedContext);
  if (result !== beforeArcs) {
    appliedFeatures.push('emotion_arcs');
  }

  // 5. Apply speed variations (skip for heavy topics)
  if (detectedContext.topicWeight !== 'heavy') {
    const beforeSpeed = result;
    result = applySpeedVariation(result, detectedContext);
    if (result !== beforeSpeed) {
      appliedFeatures.push('speed_variation');
    }
  }

  // 6. Apply dynamic pauses
  const beforePauses = result;
  result = applyDynamicPauses(result, detectedContext);
  if (result !== beforePauses) {
    appliedFeatures.push('dynamic_pauses');
  }

  // 7. Apply contextual laughter (if enabled, default: true)
  if (context.enableLaughter !== false) {
    // Map 5-level energy to 3-level for laughter context
    const mapEnergyTo3Level = (
      energy?: 'very_low' | 'low' | 'neutral' | 'elevated' | 'high'
    ): 'low' | 'medium' | 'high' | undefined => {
      if (!energy) return undefined;
      if (energy === 'very_low' || energy === 'low') return 'low';
      if (energy === 'elevated' || energy === 'high') return 'high';
      return 'medium';
    };

    const laughResult = addContextualLaughter(
      result,
      {
        userMessage: context.userMessage,
        userEmotion: detectedContext.userEmotion,
        userEnergy: mapEnergyTo3Level(context.userEnergy),
        topicWeight: detectedContext.topicWeight,
        turnCount: context.turnCount,
        personaId: context.personaId,
        userJustLaughed: context.userJustLaughed,
        comfortLevel: context.comfortLevel ?? 0.5,
      },
      context.sessionId || 'default'
    );

    if (laughResult.decision.shouldLaugh) {
      result = laughResult.text;
      appliedFeatures.push(`laughter_${laughResult.decision.laughType}`);
    }
  }

  log.debug({ appliedFeatures, personaId: context.personaId }, 'Made voice alive');

  return {
    text: result,
    appliedFeatures,
    debug: {
      detectedContext,
      originalLength: text.length,
      enhancedLength: result.length,
    },
  };
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default makeVoiceAlive;
