/**
 * Persona Emotion Profiles
 *
 * Static emotion configuration for each persona.
 * This file has NO dependencies on personas module to avoid circular imports.
 *
 * Used by: advanced-humanization, ssml, voice-manager
 *
 * @module speech/emotion-profiles
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaEmotionProfile {
  defaultEmotion: string;
  emotionRange: string[];
  defaultSpeed: number;
  defaultVolume: number;
  laughterFrequency: number;
  nonverbals: string[];
}

// ============================================================================
// PERSONA EMOTION PROFILES - Better than Human
// ============================================================================

/**
 * Emotion profiles for each persona - makes their voice distinctly human.
 * These are static configurations with no runtime dependencies.
 */
export const PERSONA_EMOTION_PROFILES: Record<string, PersonaEmotionProfile> = {
  ferni: {
    defaultEmotion: 'affectionate',
    emotionRange: [
      'affectionate',
      'curious',
      'contemplative',
      'sympathetic',
      'proud',
      'wistful',
      'calm',
      'grateful',
    ],
    defaultSpeed: 0.95,
    defaultVolume: 1.0,
    laughterFrequency: 0.15,
    // NOTE: Only actual sounds go here - NOT SSML tags like <break>!
    // <break> tags are formatting instructions, not nonverbal sounds.
    nonverbals: ['[laughter]', 'Mmm.'],
  },
  'peter-john': {
    defaultEmotion: 'enthusiastic',
    emotionRange: [
      'enthusiastic',
      'curious',
      'excited',
      'confident',
      'playful',
      'satisfied',
      'affectionate',
      'sympathetic',
    ],
    defaultSpeed: 0.95, // Per manifest - not elderly/slow
    defaultVolume: 1.05,
    laughterFrequency: 0.15, // Laughs easily
    nonverbals: ['[chuckle]', 'Oh!', 'Wait—', 'Ooh!', 'Ha!'],
  },
  'alex-chen': {
    defaultEmotion: 'calm', // Per manifest - calm presence, not just confident
    emotionRange: [
      'calm',
      'confident',
      'amused',
      'helpful',
      'determined',
      'affectionate',
      'sympathetic',
    ],
    defaultSpeed: 0.95, // Per manifest
    defaultVolume: 1.0,
    laughterFrequency: 0.1, // Occasional warmth
    // NOTE: Only actual sounds go here - NOT SSML tags like <break>!
    nonverbals: ['[dry chuckle]', 'Okay.', 'Hey.', 'Breathe.'],
  },
  'maya-santos': {
    defaultEmotion: 'affectionate',
    emotionRange: [
      'affectionate',
      'proud',
      'calm',
      'grateful',
      'sympathetic',
      'enthusiastic',
      'curious',
      'wistful',
      'contemplative',
    ],
    defaultSpeed: 0.95,
    defaultVolume: 1.0,
    laughterFrequency: 0.18, // More frequent laughter - per manifest
    // NOTE: Only actual sounds go here - NOT SSML tags like <break>!
    nonverbals: ['[laughter]', 'Hey.', 'Oh!', 'Wait—', 'Nice!'],
  },
  'jordan-taylor': {
    defaultEmotion: 'excited',
    emotionRange: [
      'excited',
      'happy',
      'affectionate',
      'sympathetic',
      'curious',
      'hopeful',
      'enthusiastic',
    ],
    defaultSpeed: 0.98, // Per manifest - energetic but not rushed
    defaultVolume: 1.05,
    laughterFrequency: 0.2, // Very frequent - Jordan loves to laugh
    nonverbals: ['[laughter]', 'Oh!', 'Wait—', 'Yes!', 'Wow!'],
  },
  'nayan-patel': {
    defaultEmotion: 'contemplative',
    emotionRange: ['contemplative', 'calm', 'affectionate', 'amused', 'curious'],
    defaultSpeed: 0.85,
    defaultVolume: 0.92,
    laughterFrequency: 0.06,
    // NOTE: Only actual sounds go here - NOT SSML tags like <break>!
    // Nayan is more contemplative, so uses softer nonverbals
    nonverbals: ['Hmm.', 'Mmm.', 'Ah.'],
  },
  'joel-dickson': {
    defaultEmotion: 'confident',
    emotionRange: [
      'confident',
      'curious',
      'excited',
      'affectionate',
      'contemplative',
      'proud',
      'nostalgic',
      'sympathetic',
      'enthusiastic',
      'happy',
    ],
    defaultSpeed: 1.0, // From manifest: base_speed_multiplier 1.0
    defaultVolume: 1.0,
    laughterFrequency: 0.18, // Joel laughs easily — humor_level 0.82
    // Joel's natural sounds: economist wit, warm self-deprecation
    nonverbals: ['[laughter]', 'Ha!', 'Hmm.', 'Oh!', 'Wait—'],
  },
};

/**
 * Get emotion profile for a persona (with sensible defaults).
 * Returns Ferni's profile as fallback for unknown personas.
 */
export function getEmotionProfile(personaId: string): PersonaEmotionProfile {
  // Normalize persona ID
  const normalized = personaId.toLowerCase().replace(/[_\s]/g, '-');
  return PERSONA_EMOTION_PROFILES[normalized] || PERSONA_EMOTION_PROFILES.ferni;
}
