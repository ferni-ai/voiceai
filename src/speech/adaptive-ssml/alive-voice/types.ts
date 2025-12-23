/**
 * Alive Voice Types
 *
 * Type definitions for the alive voice module.
 *
 * @module speech/adaptive-ssml/alive-voice/types
 */

// =============================================================================
// CONTEXT & RESULT TYPES
// =============================================================================

export interface AliveVoiceContext {
  /** User's current emotional state */
  userEmotion?: string;
  /** Topic weight: light, medium, heavy */
  topicWeight?: 'light' | 'medium' | 'heavy';
  /** Current turn count */
  turnCount?: number;
  /** Persona ID */
  personaId?: string;
  /** User's energy level */
  userEnergy?: 'low' | 'medium' | 'high';
  /** Is this response to good news? */
  isGoodNews?: boolean;
  /** Is this response to bad news? */
  isBadNews?: boolean;
  /** Is user asking a question? */
  isQuestion?: boolean;
  /** Is this a greeting? */
  isGreeting?: boolean;
  /** User's last message (for laughter context) */
  userMessage?: string;
  /** Did the user just laugh? */
  userJustLaughed?: boolean;
  /** Comfort level with user (0-1) */
  comfortLevel?: number;
  /** Session ID for tracking */
  sessionId?: string;
  /** Enable contextual laughter */
  enableLaughter?: boolean;
}

export interface AliveVoiceResult {
  /** Enhanced text with SSML */
  text: string;
  /** Features that were applied */
  appliedFeatures: string[];
  /** Debug info */
  debug?: Record<string, unknown>;
}

// =============================================================================
// PERSONA FINGERPRINT TYPES
// =============================================================================

export interface PersonaFingerprint {
  baseSpeed: number;
  pauseMultiplier: number;
  defaultEmotion: string;
  emotionRange: string[];
  thinkingSounds: string[];
  thinkingSoundProbability: number;
  emphasisStyle: 'warm' | 'deliberate' | 'energetic' | 'encouraging' | 'celebratory' | 'meditative';
  specialPatterns: Array<{
    trigger: RegExp;
    pause?: number;
    speed?: number;
    emotion?: string;
  }>;
}

// =============================================================================
// OPENING SOUND TYPES
// =============================================================================

export interface OpeningSoundOption {
  sound: string;
  emotion: string;
  probability: number;
}

// =============================================================================
// EMOTION ARC TYPES
// =============================================================================

export interface EmotionArcPattern {
  pattern: RegExp;
  replacement: string;
  name: string;
}

// =============================================================================
// SPEED VARIATION TYPES
// =============================================================================

export interface SpeedVariationPattern {
  pattern: RegExp;
  replacement: string;
  type: string;
}

// =============================================================================
// PAUSE SCALE TYPES
// =============================================================================

export interface PauseScale {
  sentence: number;
  comma: number;
  question: number;
  emphasis: number;
  breathingRoom: number;
}

export type TopicWeight = 'light' | 'medium' | 'heavy';
