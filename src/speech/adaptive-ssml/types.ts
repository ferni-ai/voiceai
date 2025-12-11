/**
 * Adaptive SSML Types
 *
 * Type definitions for adaptive SSML tagging.
 */

import type { CognitiveGuidance } from '../../personas/cognitive-types.js';
import type { SpeechContext } from '../speech-context.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for cognitive-aware SSML tagging
 */
export interface CognitiveSsmlOptions {
  /** Speech context with pacing, energy, etc. */
  speechContext: SpeechContext;
  /** Cognitive guidance from the cognitive engine */
  cognitiveGuidance?: CognitiveGuidance;
  /** Persona ID for persona-specific SSML */
  personaId?: string;
  /** Session ID for tracking */
  sessionId?: string;
  /** Emotional weight of conversation */
  emotionalWeight?: number;
  /** Base speech characteristics from persona */
  baseCharacteristics?: {
    baseSpeedMultiplier: number;
    pauseMultiplier: number;
    thinkingSoundFrequency: number;
    emphasisStyle: 'subtle' | 'moderate' | 'pronounced';
    sentenceEndingStyle: 'natural' | 'falling' | 'rising';
    minimumEnergy: number;
    maximumEnergy: number;
    speedVariation: number;
  };
}

/**
 * Options for personality-based SSML tagging
 */
export interface PersonalityTagOptions {
  speedRatio?: number;
  pauseMultiplier?: number;
  emotion?: string;
  volumeRatio?: number;
}
