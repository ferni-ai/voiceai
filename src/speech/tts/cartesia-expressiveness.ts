/**
 * Cartesia Sonic-3 Expressiveness Utilities
 *
 * Provides dynamic emotion, speed, and volume mapping for more
 * human-like speech synthesis. Based on Cartesia's supported features:
 *
 * - Emotions: 50+ supported values
 * - Speed: 0.6 to 1.5 ratio
 * - Volume: 0.5 to 2.0 ratio
 * - Laughter: [laughter] tag
 * - Breaks: <break time="Xms"/> or <break time="Xs"/>
 *
 * Each persona has a unique "voice fingerprint" - their default emotion,
 * speed, volume, and natural expressions that make them sound distinctly human.
 */

// Import from standalone emotion-profiles to avoid circular deps
import { getEmotionProfile, type PersonaEmotionProfile } from '../emotion-profiles.js';

// ============================================================================
// EMOTION MAPPINGS
// ============================================================================

/**
 * Primary emotions (best results per Cartesia docs)
 */
export const PRIMARY_EMOTIONS = [
  'neutral',
  'angry',
  'excited',
  'content',
  'sad',
  'scared',
] as const;

/**
 * Full emotion palette supported by Sonic-3
 */
export const CARTESIA_EMOTIONS = {
  // Positive high-energy
  happy: 'happy',
  excited: 'excited',
  enthusiastic: 'enthusiastic',
  elated: 'elated',
  euphoric: 'euphoric',
  triumphant: 'triumphant',
  amazed: 'amazed',
  surprised: 'surprised',

  // Positive social
  flirtatious: 'flirtatious',
  joking: 'joking/comedic',
  curious: 'curious',
  grateful: 'grateful',
  affectionate: 'affectionate',
  sympathetic: 'sympathetic',
  proud: 'proud',
  confident: 'confident',

  // Calm/content
  content: 'content',
  peaceful: 'peaceful',
  serene: 'serene',
  calm: 'calm',

  // Thoughtful
  contemplative: 'contemplative',
  nostalgic: 'nostalgic',
  wistful: 'wistful',
  mysterious: 'mysterious',
  anticipation: 'anticipation',

  // Negative
  angry: 'angry',
  mad: 'mad',
  outraged: 'outraged',
  frustrated: 'frustrated',
  agitated: 'agitated',
  disgusted: 'disgusted',
  contempt: 'contempt',
  envious: 'envious',
  sarcastic: 'sarcastic',
  ironic: 'ironic',

  // Sad spectrum
  sad: 'sad',
  dejected: 'dejected',
  melancholic: 'melancholic',
  disappointed: 'disappointed',
  hurt: 'hurt',
  guilty: 'guilty',
  rejected: 'rejected',

  // Low energy
  bored: 'bored',
  tired: 'tired',
  resigned: 'resigned',

  // Uncertain/vulnerable
  hesitant: 'hesitant',
  insecure: 'insecure',
  confused: 'confused',
  apologetic: 'apologetic',
  anxious: 'anxious',

  // Fear spectrum
  scared: 'scared',
  panicked: 'panicked',
  alarmed: 'alarmed',
  threatened: 'threatened',

  // Neutral/professional
  neutral: 'neutral',
  distant: 'distant',
  skeptical: 'skeptical',
  determined: 'determined',
} as const;

export type CartesiaEmotion = (typeof CARTESIA_EMOTIONS)[keyof typeof CARTESIA_EMOTIONS];

// ============================================================================
// MOOD TO EMOTION MAPPING
// ============================================================================

/**
 * Maps conversation mood states to appropriate Cartesia emotions
 */
export const MOOD_TO_EMOTIONS: Record<string, CartesiaEmotion[]> = {
  // Energy states
  high_energy: ['excited', 'enthusiastic', 'happy'],
  medium_energy: ['content', 'curious', 'calm'],
  low_energy: ['calm', 'contemplative', 'tired'],

  // Emotional states
  joyful: ['happy', 'elated', 'excited'],
  contemplative: ['contemplative', 'wistful', 'nostalgic'],
  supportive: ['sympathetic', 'affectionate', 'calm'],
  playful: ['joking/comedic', 'happy', 'excited'],
  serious: ['determined', 'confident', 'calm'],
  vulnerable: ['hesitant', 'apologetic', 'calm'],
  curious: ['curious', 'anticipation', 'excited'],
  empathetic: ['sympathetic', 'affectionate', 'calm'],
  celebratory: ['excited', 'triumphant', 'happy'],
  concerned: ['sympathetic', 'anxious', 'calm'],
  reflective: ['contemplative', 'nostalgic', 'wistful'],
  encouraging: ['affectionate', 'confident', 'happy'],
  teasing: ['joking/comedic', 'happy', 'flirtatious'],

  // Time-based
  late_night: ['calm', 'peaceful', 'contemplative'],
  morning: ['content', 'calm', 'peaceful'],
  afternoon: ['content', 'curious', 'calm'],
};

/**
 * Get appropriate emotion for a mood state
 */
export function getEmotionForMood(mood: string): CartesiaEmotion {
  const emotions = MOOD_TO_EMOTIONS[mood] || MOOD_TO_EMOTIONS.medium_energy;
  return emotions[Math.floor(Math.random() * emotions.length)];
}

// ============================================================================
// SPEED/VOLUME PROFILES
// ============================================================================

export interface VoiceProfile {
  speed: number; // 0.6 - 1.5
  volume: number; // 0.5 - 2.0
  emotion?: CartesiaEmotion;
}

/**
 * Voice profiles for different conversational moments
 */
export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  // Energy variations
  excited: { speed: 1.15, volume: 1.2, emotion: 'excited' },
  very_excited: { speed: 1.25, volume: 1.3, emotion: 'enthusiastic' },
  calm: { speed: 0.95, volume: 0.95, emotion: 'calm' },
  peaceful: { speed: 0.9, volume: 0.85, emotion: 'peaceful' },

  // Emotional moments
  intimate: { speed: 0.85, volume: 0.75, emotion: 'affectionate' },
  vulnerable: { speed: 0.8, volume: 0.7, emotion: 'hesitant' },
  supportive: { speed: 0.9, volume: 0.9, emotion: 'sympathetic' },
  encouraging: { speed: 1.05, volume: 1.1, emotion: 'affectionate' },

  // Thinking/processing
  contemplative: { speed: 0.85, volume: 0.9, emotion: 'contemplative' },
  thinking: { speed: 0.8, volume: 0.85, emotion: 'contemplative' },
  realizing: { speed: 0.9, volume: 1.0, emotion: 'surprised' },

  // Emphasis
  emphasis: { speed: 0.85, volume: 1.15, emotion: 'determined' },
  important: { speed: 0.8, volume: 1.2, emotion: 'determined' },

  // Trailing off / uncertainty
  trailing_off: { speed: 0.7, volume: 0.6, emotion: 'hesitant' },
  uncertain: { speed: 0.85, volume: 0.8, emotion: 'hesitant' },

  // Playful
  playful: { speed: 1.1, volume: 1.05, emotion: 'joking/comedic' },
  teasing: { speed: 1.05, volume: 1.0, emotion: 'joking/comedic' },

  // Late night
  late_night: { speed: 0.85, volume: 0.7, emotion: 'calm' },
  whisper: { speed: 0.8, volume: 0.6, emotion: 'calm' },

  // Default
  neutral: { speed: 1.0, volume: 1.0, emotion: 'neutral' },
};

/**
 * Get voice profile for a moment type
 */
export function getVoiceProfile(moment: string): VoiceProfile {
  return VOICE_PROFILES[moment] || VOICE_PROFILES.neutral;
}

// ============================================================================
// SSML GENERATION HELPERS
// ============================================================================

/**
 * Clamp speed to Cartesia's valid range (0.6 - 1.5)
 */
export function clampSpeed(speed: number): number {
  return Math.max(0.6, Math.min(1.5, speed));
}

/**
 * Clamp volume to Cartesia's valid range (0.5 - 2.0)
 */
export function clampVolume(volume: number): number {
  return Math.max(0.5, Math.min(2.0, volume));
}

/**
 * Generate SSML emotion tag
 */
export function emotionTag(emotion: CartesiaEmotion): string {
  return `<emotion value="${emotion}"/>`;
}

/**
 * Generate SSML speed tag
 */
export function speedTag(ratio: number): string {
  return `<speed ratio="${clampSpeed(ratio).toFixed(2)}"/>`;
}

/**
 * Generate SSML volume tag
 */
export function volumeTag(ratio: number): string {
  return `<volume ratio="${clampVolume(ratio).toFixed(2)}"/>`;
}

/**
 * Generate break/pause tag
 */
export function breakTag(ms: number): string {
  if (ms >= 1000) {
    return `<break time="${(ms / 1000).toFixed(1)}s"/>`;
  }
  return `<break time="${ms}ms"/>`;
}

/**
 * Generate a complete voice profile as SSML prefix
 */
export function voiceProfileToSsml(profile: VoiceProfile): string {
  let ssml = '';
  ssml += speedTag(profile.speed);
  ssml += volumeTag(profile.volume);
  if (profile.emotion) {
    ssml += emotionTag(profile.emotion);
  }
  return ssml;
}

/**
 * Wrap text with a voice profile
 */
export function wrapWithProfile(text: string, profileName: string): string {
  const profile = getVoiceProfile(profileName);
  return voiceProfileToSsml(profile) + text;
}

// ============================================================================
// NATURAL SPEECH PATTERNS
// ============================================================================

/**
 * Common self-correction patterns for natural speech
 */
export const SELF_CORRECTIONS = [
  'I think— <break time="200ms"/>actually, no...',
  'Well— <break time="150ms"/>hmm, let me think...',
  'It is— <break time="200ms"/>okay, wait...',
  'So the thing is— <break time="200ms"/>actually...',
  'I was going to say— <break time="150ms"/>no, different thought...',
];

/**
 * Trailing off patterns
 */
export const TRAILING_OFF = [
  '<speed ratio="0.8"/><volume ratio="0.7"/>I just...<break time="400ms"/>',
  '<speed ratio="0.75"/><volume ratio="0.65"/>It makes me think...<break time="400ms"/>',
  '<speed ratio="0.8"/><volume ratio="0.7"/>Sometimes I wonder...<break time="350ms"/>',
  '<speed ratio="0.75"/><volume ratio="0.6"/>You know...<break time="400ms"/>',
];

/**
 * Thinking sounds (natural, no tags needed)
 */
export const THINKING_SOUNDS = ['Hmm.', 'Mmm.', 'Ah.', 'Oh.', 'Huh.'];

/**
 * Realization patterns
 */
export const REALIZATIONS = [
  '<emotion value="surprised"/>Oh! <break time="150ms"/>',
  '<emotion value="surprised"/>Wait— <break time="200ms"/>',
  '<emotion value="curious"/>Hmm. <break time="200ms"/>Actually...',
  '<emotion value="surprised"/>Oh! <break time="100ms"/>That reminds me...',
];

/**
 * Get a random element from an array
 */
export function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// EMOTION LAYERING FOR MULTI-SENTENCE RESPONSES
// ============================================================================

/**
 * Suggested emotion progressions for different conversation arcs
 */
export const EMOTION_PROGRESSIONS: Record<string, CartesiaEmotion[]> = {
  // Building excitement
  building_excitement: ['curious', 'anticipation', 'excited', 'enthusiastic'],

  // Calming down
  calming: ['excited', 'happy', 'content', 'calm'],

  // Getting serious
  getting_serious: ['happy', 'contemplative', 'determined'],

  // Empathy arc
  empathy: ['curious', 'sympathetic', 'affectionate'],

  // Celebration
  celebration: ['surprised', 'excited', 'triumphant', 'happy'],

  // Reflection
  reflection: ['curious', 'contemplative', 'wistful', 'peaceful'],

  // Support
  support: ['calm', 'sympathetic', 'affectionate', 'confident'],

  // Late night intimacy
  late_night: ['calm', 'peaceful', 'affectionate', 'contemplative'],
};

/**
 * Get emotion for a position in a progression
 */
export function getEmotionInProgression(
  progression: string,
  position: number,
  total: number
): CartesiaEmotion {
  const emotions = EMOTION_PROGRESSIONS[progression] || EMOTION_PROGRESSIONS.empathy;
  const index = Math.min(Math.floor((position / total) * emotions.length), emotions.length - 1);
  return emotions[index];
}

// ============================================================================
// PERSONA VOICE FINGERPRINTS - Better Than Human
// ============================================================================

/**
 * Apply persona's unique voice fingerprint to text.
 * Each persona sounds distinctly human with their baseline emotion,
 * speed, volume, and occasional nonverbal sounds.
 *
 * @param text - The text to enhance
 * @param personaId - The persona to apply (e.g., 'ferni', 'maya-santos')
 * @param options - Override default emotion or add intensity
 * @returns SSML-enhanced text with persona fingerprint
 */
export function applyPersonaVoiceFingerprint(
  text: string,
  personaId: string,
  options?: {
    emotion?: string; // Override default emotion
    intensity?: 'subtle' | 'normal' | 'strong'; // Emotion intensity
    addNonverbal?: boolean; // Chance to add laughter/sounds
  }
): string {
  const profile = getEmotionProfile(personaId);
  const emotion = options?.emotion || profile.defaultEmotion;

  // Build SSML prefix
  let ssml = '';

  // Apply speed and volume
  ssml += `<speed ratio="${clampSpeed(profile.defaultSpeed).toFixed(2)}"/>`;
  ssml += `<volume ratio="${clampVolume(profile.defaultVolume).toFixed(2)}"/>`;

  // Apply emotion with intensity
  if (emotion) {
    const intensityPrefix =
      options?.intensity === 'strong'
        ? 'very '
        : options?.intensity === 'subtle'
          ? 'slightly '
          : '';
    ssml += `<emotion value="${intensityPrefix}${emotion}"/>`;
  }

  // Maybe add nonverbal sound at the beginning
  if (options?.addNonverbal && Math.random() < profile.laughterFrequency) {
    const nonverbal = randomFrom(profile.nonverbals);
    return `${ssml + nonverbal} ${text}`;
  }

  return ssml + text;
}

/**
 * Get a random emotion from persona's natural range.
 * Use this to vary emotions while staying in-character.
 */
export function getRandomPersonaEmotion(personaId: string): string {
  const profile = getEmotionProfile(personaId);
  return randomFrom(profile.emotionRange);
}

/**
 * Check if an emotion is in persona's natural range.
 * Helps avoid jarring out-of-character moments.
 */
export function isEmotionInPersonaRange(personaId: string, emotion: string): boolean {
  const profile = getEmotionProfile(personaId);
  return profile.emotionRange.includes(emotion);
}

/**
 * Get appropriate emotion for a moment, constrained to persona's range.
 * Falls back to persona's default if the requested emotion isn't in their range.
 */
export function getPersonaAppropriateEmotion(personaId: string, requestedEmotion: string): string {
  const profile = getEmotionProfile(personaId);

  // If the requested emotion is in their range, use it
  if (profile.emotionRange.includes(requestedEmotion)) {
    return requestedEmotion;
  }

  // Find the closest emotion in their range
  const emotionMappings: Record<string, string[]> = {
    // If they want 'sad', look for these alternatives
    sad: ['sympathetic', 'contemplative', 'calm'],
    happy: ['affectionate', 'excited', 'proud', 'grateful'],
    angry: ['determined', 'confident'],
    scared: ['sympathetic', 'calm'],
    surprised: ['curious', 'excited'],
    excited: ['enthusiastic', 'happy', 'playful'],
    contemplative: ['calm', 'curious', 'wistful'],
  };

  const alternatives = emotionMappings[requestedEmotion] || [];
  for (const alt of alternatives) {
    if (profile.emotionRange.includes(alt)) {
      return alt;
    }
  }

  // Fall back to their default
  return profile.defaultEmotion;
}

/**
 * Apply contextual emotion shift based on conversation moment.
 * Stays within persona's emotional range.
 */
export function applyContextualEmotion(
  text: string,
  personaId: string,
  context: {
    isHeavyTopic?: boolean;
    isCelebration?: boolean;
    isQuestion?: boolean;
    isLateNight?: boolean;
    userEmotion?: string;
  }
): string {
  const profile = getEmotionProfile(personaId);
  let emotion = profile.defaultEmotion;
  let speed = profile.defaultSpeed;
  let volume = profile.defaultVolume;

  // Adjust based on context
  if (context.isHeavyTopic) {
    emotion = getPersonaAppropriateEmotion(personaId, 'sympathetic');
    speed *= 0.92; // Slower for heavy topics
    volume *= 0.9; // Softer
  } else if (context.isCelebration) {
    emotion = getPersonaAppropriateEmotion(personaId, 'excited');
    speed *= 1.08; // Faster when celebrating
    volume *= 1.1; // Louder
  } else if (context.isQuestion) {
    emotion = getPersonaAppropriateEmotion(personaId, 'curious');
  } else if (context.isLateNight) {
    emotion = getPersonaAppropriateEmotion(personaId, 'calm');
    speed *= 0.9;
    volume *= 0.85;
  }

  // Mirror user's emotion if we can
  if (context.userEmotion) {
    const mirrored = getPersonaAppropriateEmotion(personaId, context.userEmotion);
    if (mirrored !== profile.defaultEmotion) {
      emotion = mirrored;
    }
  }

  // Build SSML
  let ssml = '';
  ssml += `<speed ratio="${clampSpeed(speed).toFixed(2)}"/>`;
  ssml += `<volume ratio="${clampVolume(volume).toFixed(2)}"/>`;
  ssml += `<emotion value="${emotion}"/>`;

  return ssml + text;
}

// Re-export PersonaEmotionProfile for use elsewhere
export type { PersonaEmotionProfile };
