/**
 * Persona Phrases - Type Definitions
 *
 * All types for persona-specific phrases.
 *
 * @module persona-phrases/types
 */

// ============================================================================
// PERSONA IDS
// ============================================================================

export type PersonaId =
  | 'ferni'
  | 'jack-b' // Legacy alias for ferni
  | 'nayan-patel'
  | 'peter-john'
  | 'maya-santos'
  | 'maya' // Short alias
  | 'jordan-taylor'
  | 'jordan' // Short alias
  | 'alex-chen'
  | 'alex'; // Short alias

// ============================================================================
// BACKCHANNEL TYPES
// ============================================================================

export type BackchannelEmotionType =
  | 'neutral'
  | 'engaged'
  | 'empathetic'
  | 'excited'
  | 'supportive';

export type BackchannelCategory =
  | 'acknowledgment' // "Mm-hmm", "Yeah"
  | 'understanding' // "I see", "Got it"
  | 'encouragement' // "I'm here", "I'm with you" (NOT commands like "Tell me more")
  | 'empathy' // "Mmm", "I hear you"
  | 'agreement' // "Right", "Exactly"
  | 'surprise' // "Oh!", "Wow"
  | 'thinking'; // "Hmm", "Let me think"

// ============================================================================
// ACKNOWLEDGMENT TYPES
// ============================================================================

export type AcknowledgmentMood = 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful';

// ============================================================================
// STYLE TYPES
// ============================================================================

export interface PersonaBackchannelStyle {
  /** Preferred backchannel categories for this persona */
  preferred: BackchannelCategory[];
  /** Volume ratio for backchannels (0-1) */
  volumeRatio: number;
  /** Cartesia emotion tag to use */
  emotionTag?: string;
}

export interface CatchphraseConfig {
  phrases: string[];
  emphasis: 'slow' | 'normal' | 'excited';
  ssmlWrapper: (phrase: string) => string;
}
