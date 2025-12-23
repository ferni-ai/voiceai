/**
 * Cognitive Speech Integration
 *
 * Adjusts speech patterns based on cognitive state:
 * - Showing reasoning → slower, more pauses
 * - Confident → faster, fewer hedges
 * - Uncertain → more pauses, trailing off
 * - Empathetic → softer, more breathing room
 */

import type { ReasoningStyle } from '../personas/cognitive-types.js';
import type { SpeechCharacteristics } from '../personas/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveSpeechContext {
  /** Current reasoning approach */
  reasoningStyle: ReasoningStyle;

  /** Whether showing thinking process */
  showingReasoning: boolean;

  /** Confidence level (0-1) */
  confidence: number;

  /** Emotional weight of conversation */
  emotionalWeight: number;

  /** Whether in a reasoning chain */
  inReasoningChain: boolean;

  /** Current step in chain (if applicable) */
  chainStep?: number;

  /** Total steps in chain */
  chainTotal?: number;
}

export interface SpeechAdjustments {
  /** Multiplier for base speed (0.7 - 1.2) */
  speedMultiplier: number;

  /** Multiplier for pause duration (0.6 - 1.8) */
  pauseMultiplier: number;

  /** Additional thinking sounds probability (0 - 0.3) */
  thinkingSoundBoost: number;

  /** Emphasis style override */
  emphasisStyle?: 'subtle' | 'moderate' | 'pronounced';

  /** Additional pauses to insert */
  additionalPauses: Array<{
    type: 'thinking' | 'emphasis' | 'breath' | 'transition';
    position: 'start' | 'middle' | 'end';
    duration: 'short' | 'medium' | 'long';
  }>;

  /** Phrases to potentially insert */
  filler?: string;
}

// ============================================================================
// SPEECH ADJUSTMENTS BY COGNITIVE STATE
// ============================================================================

/**
 * Calculate speech adjustments based on cognitive context
 */
export function calculateCognitiveSpeechAdjustments(
  baseCharacteristics: SpeechCharacteristics,
  context: CognitiveSpeechContext
): SpeechAdjustments {
  const adjustments: SpeechAdjustments = {
    speedMultiplier: 1.0,
    pauseMultiplier: 1.0,
    thinkingSoundBoost: 0,
    additionalPauses: [],
  };

  // ============================================================================
  // SHOWING REASONING → Slower, more deliberate
  // ============================================================================
  if (context.showingReasoning) {
    adjustments.speedMultiplier *= 0.9;
    adjustments.pauseMultiplier *= 1.3;
    adjustments.thinkingSoundBoost += 0.15;
    adjustments.additionalPauses.push({
      type: 'thinking',
      position: 'start',
      duration: 'medium',
    });
  }

  // ============================================================================
  // CONFIDENCE LEVEL → Affects pace and hesitation
  // ============================================================================
  if (context.confidence < 0.4) {
    // Low confidence → slower, more pauses, trailing off
    adjustments.speedMultiplier *= 0.85;
    adjustments.pauseMultiplier *= 1.4;
    adjustments.thinkingSoundBoost += 0.2;
    adjustments.additionalPauses.push({
      type: 'thinking',
      position: 'middle',
      duration: 'medium',
    });
    adjustments.filler = '...';
  } else if (context.confidence > 0.8) {
    // High confidence → slightly faster, more direct
    adjustments.speedMultiplier *= 1.05;
    adjustments.pauseMultiplier *= 0.85;
    adjustments.emphasisStyle = 'pronounced';
  }

  // ============================================================================
  // EMOTIONAL WEIGHT → Softer, more breathing room
  // ============================================================================
  if (context.emotionalWeight > 0.6) {
    adjustments.speedMultiplier *= 0.9;
    adjustments.pauseMultiplier *= 1.25;
    adjustments.emphasisStyle = 'subtle'; // Don't over-emphasize in emotional moments
    adjustments.additionalPauses.push({
      type: 'breath',
      position: 'end',
      duration: 'medium',
    });
  }

  // ============================================================================
  // REASONING STYLE → Style-specific adjustments
  // ============================================================================
  switch (context.reasoningStyle) {
    case 'analytical':
      // Analytical → measured, precise
      adjustments.pauseMultiplier *= 1.1;
      adjustments.emphasisStyle = adjustments.emphasisStyle || 'moderate';
      break;

    case 'empathetic':
      // Empathetic → softer, more pauses for connection
      adjustments.speedMultiplier *= 0.95;
      adjustments.pauseMultiplier *= 1.15;
      adjustments.emphasisStyle = adjustments.emphasisStyle || 'subtle';
      break;

    case 'intuitive':
      // Intuitive → contemplative pauses
      adjustments.pauseMultiplier *= 1.3;
      adjustments.thinkingSoundBoost += 0.1;
      break;

    case 'pragmatic':
      // Pragmatic → direct, efficient
      adjustments.speedMultiplier *= 1.05;
      adjustments.pauseMultiplier *= 0.9;
      adjustments.emphasisStyle = adjustments.emphasisStyle || 'moderate';
      break;

    case 'systematic':
      // Systematic → clear, structured pauses
      adjustments.additionalPauses.push({
        type: 'transition',
        position: 'middle',
        duration: 'short',
      });
      break;

    case 'narrative':
      // Narrative → storytelling rhythm
      adjustments.pauseMultiplier *= 1.1;
      // Pauses for dramatic effect
      if (Math.random() < 0.3) {
        adjustments.additionalPauses.push({
          type: 'emphasis',
          position: 'middle',
          duration: 'medium',
        });
      }
      break;
  }

  // ============================================================================
  // REASONING CHAIN → Transition pauses between steps
  // ============================================================================
  if (context.inReasoningChain && context.chainStep && context.chainTotal) {
    // First step → thinking pause
    if (context.chainStep === 1) {
      adjustments.additionalPauses.push({
        type: 'thinking',
        position: 'start',
        duration: 'medium',
      });
    }
    // Between steps → transition pause
    if (context.chainStep > 1) {
      adjustments.additionalPauses.push({
        type: 'transition',
        position: 'start',
        duration: 'short',
      });
    }
    // Last step → settling pause
    if (context.chainStep === context.chainTotal) {
      adjustments.additionalPauses.push({
        type: 'breath',
        position: 'end',
        duration: 'long',
      });
    }
  }

  // ============================================================================
  // CLAMP VALUES
  // ============================================================================
  adjustments.speedMultiplier = Math.max(0.7, Math.min(1.2, adjustments.speedMultiplier));
  adjustments.pauseMultiplier = Math.max(0.6, Math.min(1.8, adjustments.pauseMultiplier));
  adjustments.thinkingSoundBoost = Math.max(0, Math.min(0.3, adjustments.thinkingSoundBoost));

  return adjustments;
}

/**
 * Apply cognitive adjustments to base speech characteristics
 */
export function applyCognitiveAdjustments(
  base: SpeechCharacteristics,
  adjustments: SpeechAdjustments
): SpeechCharacteristics {
  return {
    ...base,
    baseSpeedMultiplier: base.baseSpeedMultiplier * adjustments.speedMultiplier,
    pauseMultiplier: base.pauseMultiplier * adjustments.pauseMultiplier,
    thinkingSoundFrequency: Math.min(
      1.0,
      base.thinkingSoundFrequency + adjustments.thinkingSoundBoost
    ),
    emphasisStyle: adjustments.emphasisStyle || base.emphasisStyle,
  };
}

/**
 * Get SSML-compatible pause durations
 */
export function getPauseDuration(duration: 'short' | 'medium' | 'long'): string {
  switch (duration) {
    case 'short':
      return '200ms';
    case 'medium':
      return '400ms';
    case 'long':
      return '700ms';
  }
}

/**
 * Build SSML pause element
 */
export function buildPauseSSML(pause: SpeechAdjustments['additionalPauses'][0]): string {
  const duration = getPauseDuration(pause.duration);
  return `<break time="${duration}"/>`;
}

/**
 * Get thinking sounds based on cognitive state
 *
 * HUMANIZATION FIX: Removed "Let me see/think" - too robotic.
 * Keep only natural conversational sounds that don't feel like voice assistant responses.
 */
export function getCognitiveThinkingSound(
  reasoningStyle: ReasoningStyle,
  confidence: number
): string {
  const sounds: Record<ReasoningStyle, string[]> = {
    analytical: ['Hmm', 'Interesting', 'So...'],
    empathetic: ['Mmm', 'I hear you', 'Yeah...'],
    narrative: ['You know', 'So', 'Right'],
    systematic: ['Okay', 'Right', 'So...'],
    pragmatic: ['Alright', 'Okay so', 'Right'],
    intuitive: ['Hmm', '...', 'Mm'],
  };

  const options = sounds[reasoningStyle] || sounds.analytical;

  // Low confidence → more hesitant sounds
  if (confidence < 0.4) {
    return `${options[0]}...`;
  }

  return options[Math.floor(Math.random() * options.length)];
}

export default {
  calculateCognitiveSpeechAdjustments,
  applyCognitiveAdjustments,
  getPauseDuration,
  buildPauseSSML,
  getCognitiveThinkingSound,
};
