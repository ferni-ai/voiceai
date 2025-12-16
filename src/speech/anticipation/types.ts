/**
 * Unified Anticipation Types
 *
 * Combines intent prediction and emotional prosody anticipation.
 *
 * @module speech/anticipation/types
 */

import type { CartesiaEmotion } from '../cartesia-expressiveness.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Context for anticipation analysis
 */
export interface AnticipationContext {
  /** Session ID */
  sessionId: string;
  /** Partial transcript text */
  partialTranscript: string;
  /** Is user still speaking? */
  isSpeaking: boolean;
  /** Detected tone from audio */
  tone?: 'neutral' | 'excited' | 'sad' | 'frustrated' | 'curious';
  /** User's speech rate */
  speechRate?: 'slow' | 'normal' | 'fast';
  /** Silence duration since last word (ms) */
  silenceMs?: number;
  /** Current turn number */
  turnNumber?: number;
}

// ============================================================================
// INTENT TYPES
// ============================================================================

/**
 * Predicted user intent categories
 */
export type IntentCategory =
  | 'greeting'
  | 'farewell'
  | 'question'
  | 'help_request'
  | 'emotional_share'
  | 'celebration'
  | 'complaint'
  | 'gratitude'
  | 'affirmation'
  | 'unknown';

/**
 * Intent prediction result
 */
export interface IntentPrediction {
  /** Predicted intent */
  intent: IntentCategory;
  /** Confidence in prediction (0-1) */
  confidence: number;
  /** Response template (if available) */
  template?: string;
  /** Variables needed to complete template */
  variables?: string[];
  /** Context hint for LLM */
  contextHint?: string;
}

// ============================================================================
// EMOTIONAL TRAJECTORY TYPES
// ============================================================================

/**
 * Emotional trajectory categories
 */
export type EmotionalTrajectory =
  | 'rising_excitement'
  | 'rising_concern'
  | 'falling_sadness'
  | 'building_frustration'
  | 'seeking_support'
  | 'sharing_vulnerability'
  | 'expressing_gratitude'
  | 'joking_playful'
  | 'stable_neutral';

/**
 * Emotional prosody prediction
 */
export interface EmotionalPrediction {
  /** Detected trajectory */
  trajectory: EmotionalTrajectory;
  /** Confidence in detection (0-1) */
  confidence: number;
  /** Anticipated response emotion */
  anticipatedEmotion: CartesiaEmotion | null;
  /** Speed multiplier for response */
  speedMultiplier: number;
  /** Volume multiplier for response */
  volumeMultiplier: number;
  /** Pause multiplier for response */
  pauseMultiplier: number;
  /** Opening micro-reaction SSML */
  microReactionSsml: string | null;
  /** Use softer delivery */
  softerDelivery: boolean;
}

// ============================================================================
// UNIFIED RESULT
// ============================================================================

/**
 * Complete anticipation result combining intent and emotion
 */
export interface AnticipationResult {
  /** Intent prediction */
  intent: IntentPrediction;
  /** Emotional prediction */
  emotion: EmotionalPrediction;
  /** Combined confidence (weighted average) */
  combinedConfidence: number;
  /** Should we act on this prediction? */
  isActionable: boolean;
  /** Reason for actionability decision */
  actionableReason: string;
  /** Prepared response prosody */
  prosody: {
    speedMultiplier: number;
    volumeMultiplier: number;
    pauseMultiplier: number;
    emotion: CartesiaEmotion | null;
    microReactionSsml: string | null;
  };
  /** Processing timestamp */
  timestamp: number;
}

// ============================================================================
// SERVICE OPTIONS
// ============================================================================

/**
 * Options for anticipation service
 */
export interface AnticipationOptions {
  /** Persona ID for persona-specific responses */
  personaId?: string;
  /** Minimum confidence to consider actionable */
  minConfidence?: number;
  /** Prefer intent over emotion or vice versa */
  preferenceWeight?: {
    intent: number;
    emotion: number;
  };
  /** Enable micro-reactions */
  enableMicroReactions?: boolean;
  /** Enable template matching */
  enableTemplates?: boolean;
}

/**
 * Default options
 */
export const DEFAULT_ANTICIPATION_OPTIONS: AnticipationOptions = {
  personaId: 'ferni',
  minConfidence: 0.5,
  preferenceWeight: {
    intent: 0.4,
    emotion: 0.6, // Prioritize emotional responsiveness
  },
  enableMicroReactions: true,
  enableTemplates: false, // Let LLM generate most responses
};
