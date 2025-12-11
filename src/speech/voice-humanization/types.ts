/**
 * Voice Humanization Types
 *
 * Type definitions for voice humanization capabilities.
 */

import type { VoiceEmotionResult } from '../audio-prosody.js';
import type { EmotionalArc } from '../../conversation/emotional-arc.js';

// ============================================================================
// MICRO-INTERRUPTION TYPES
// ============================================================================

/**
 * Micro-interruption detection result
 */
export interface MicroInterruptionResult {
  /** Did we detect an interruption signal? */
  detected: boolean;
  /** The word/phrase that triggered it */
  trigger: string | null;
  /** How urgent is the interruption? */
  urgency: 'immediate' | 'soon' | 'none';
  /** Should agent stop speaking? */
  shouldStopAgent: boolean;
  /** Reason for the detection */
  reason: string;
}

// ============================================================================
// LAUGHTER DETECTION TYPES
// ============================================================================

/**
 * Laughter detection result
 */
export interface LaughterDetectionResult {
  /** Is the user laughing? */
  isLaughing: boolean;
  /** Confidence (0-1) */
  confidence: number;
  /** Type of laugh detected */
  laughType: 'chuckle' | 'laugh' | 'giggle' | 'hearty' | 'unknown';
  /** How should agent respond? */
  suggestedResponse: 'join_in' | 'acknowledge' | 'smile' | 'none';
}

// ============================================================================
// TTS ADJUSTMENT TYPES
// ============================================================================

/**
 * Emotional arc TTS adjustments
 */
export interface EmotionalTtsAdjustments {
  /** Opening pause before speaking (ms) */
  openingPauseMs: number;
  /** Speed adjustment (-0.3 to 0.3) */
  speedAdjust: number;
  /** Volume adjustment (0.8 to 1.2) */
  volumeAdjust: number;
  /** SSML emotion tag to use */
  ssmlEmotion: string;
  /** Should add extra breaths/pauses? */
  addBreaths: boolean;
  /** Warmth level for tone */
  warmth: 'high' | 'medium' | 'low';
  /** Reason for these adjustments */
  reason: string;
}

// ============================================================================
// RHYTHM TYPES
// ============================================================================

/**
 * Speech rhythm profile
 */
export interface SpeechRhythmProfile {
  /** Average phrase length (words) */
  avgPhraseLength: number;
  /** Typical pause between phrases (ms) */
  pauseBetweenPhrases: number;
  /** Speech pattern type */
  pattern: 'flowing' | 'staccato' | 'burst' | 'measured' | 'varied';
  /** Confidence in the pattern detection */
  confidence: number;
}

/**
 * Rhythm mirroring adjustments
 */
export interface RhythmMirroringAdjustments {
  pauseMultiplier: number;
  phraseBreakMs: number;
}

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * Voice humanization context (accumulated state)
 */
export interface VoiceHumanizationState {
  /** Session ID */
  sessionId: string;
  /** Recent voice emotion results */
  recentVoiceEmotions: VoiceEmotionResult[];
  /** User's speech rhythm profile */
  userRhythmProfile: SpeechRhythmProfile | null;
  /** Laughter events this session */
  laughterEvents: Array<{ timestamp: number; type: string }>;
  /** Interruption patterns */
  interruptionPatterns: Array<{ timestamp: number; trigger: string }>;
  /** Current emotional arc state */
  currentEmotionalArc: EmotionalArc | null;
  /** Turn count */
  turnCount: number;
}
