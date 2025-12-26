/**
 * Superhuman Voice Types
 *
 * Type definitions for superhuman voice enhancements.
 *
 * @module speech/adaptive-ssml/superhuman-voice/types
 */

import type { PresenceLevel } from '../../../conversation/superhuman/presence-mode.js';
import type { VulnerabilityDepth } from '../../../conversation/superhuman/vulnerability-matching.js';

// ============================================================================
// MAIN CONTEXT & RESULT TYPES
// ============================================================================

export interface SuperhumanVoiceContext {
  /** Session ID for tracking */
  sessionId: string;

  /** Current persona */
  personaId?: string;

  // === Prosodic Mirroring ===
  /** User's words per minute (from WPM tracker) */
  userWPM?: number;

  /** User's energy level */
  userEnergy?: 'low' | 'medium' | 'high';

  // === Vulnerability ===
  /** Current vulnerability depth */
  vulnerabilityDepth?: VulnerabilityDepth;

  /** Presence mode level */
  presenceLevel?: PresenceLevel;

  // === Memory-Informed ===
  /** Known user context from memory (grief, stress, celebration, etc.) */
  knownUserContext?: 'grieving' | 'stressed' | 'celebrating' | 'struggling' | 'growing' | null;

  /** How long we've known this user (for trust calibration) */
  relationshipTurns?: number;

  // === Emotional Transitions ===
  /** Previous utterance's primary emotion */
  previousEmotion?: string;

  /** Current utterance's primary emotion */
  currentEmotion?: string;

  // === Content Signals ===
  /** Is the user currently sharing something heavy? */
  isHeavyContent?: boolean;

  /** Topic weight */
  topicWeight?: 'light' | 'medium' | 'heavy';

  /** Turn count in session */
  turnCount?: number;
}

export interface SuperhumanVoiceResult {
  /** Enhanced text with SSML */
  text: string;

  /** Applied enhancements */
  appliedEnhancements: string[];

  /** Speed multiplier applied */
  speedMultiplier: number;

  /** Volume multiplier applied */
  volumeMultiplier: number;

  /** Recommended pause multiplier */
  pauseMultiplier: number;

  /** Debug info */
  debug?: Record<string, unknown>;
}

// ============================================================================
// INTERNAL STATE TYPES
// ============================================================================

export interface EnhancementState {
  result: string;
  appliedEnhancements: string[];
  speedMultiplier: number;
  volumeMultiplier: number;
  pauseMultiplier: number;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

export interface SuperhumanVoiceSession {
  sessionId: string;
  lastEmotion: string | null;
  enhancementHistory: string[];
  turnCount: number;
}

// ============================================================================
// CONTENT TYPE
// ============================================================================

export type HeavyContentType = 'grief' | 'fear' | 'frustration' | 'heavyContent';

// Re-export dependency types for convenience
export type { PresenceLevel, VulnerabilityDepth };

