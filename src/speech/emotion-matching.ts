/**
 * Voice Emotion Matching
 *
 * Adjusts TTS response characteristics based on detected user emotion.
 * This creates empathetic responses where the agent's voice tone
 * naturally matches or appropriately responds to the user's emotional state.
 *
 * Cartesia voice controls:
 * - speed: "slowest", "slow", "normal", "fast", "fastest" or -1.0 to 1.0
 * - emotion: Cartesia supports emotion controls via voice embedding modifications
 */

import { getLogger } from '../utils/safe-logger.js';
import type { VoiceEmotionResult } from './audio-prosody.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceEmotionModulation {
  // Speed adjustment (-1 to 1, 0 = normal)
  speedAdjust: number;

  // Volume/energy level (0.5 to 1.5, 1 = normal)
  volumeAdjust: number;

  // Suggested voice characteristics for SSML
  ssmlHints: {
    prosodyRate?: string; // "slow", "medium", "fast"
    prosodyPitch?: string; // "low", "medium", "high"
    prosodyVolume?: string; // "soft", "medium", "loud"
  };

  // Recommended response characteristics
  responseStyle: {
    warmth: 'high' | 'medium' | 'low';
    energy: 'high' | 'medium' | 'low';
    pause: 'more' | 'normal' | 'less';
  };

  // Debug info
  matchedEmotion: string;
  confidence: number;
}

// ============================================================================
// EMOTION RESPONSE MAPPING
// ============================================================================

/**
 * How the agent should respond to different user emotions
 *
 * Philosophy:
 * - Sad/anxious users → Slower, warmer, more pauses (calming)
 * - Happy/excited users → Match their energy (celebrate with them)
 * - Neutral → Balanced, default response
 * - Angry/frustrated → Calm but not condescending
 */
const EMOTION_RESPONSES: Record<
  string,
  Omit<VoiceEmotionModulation, 'matchedEmotion' | 'confidence'>
> = {
  // Positive emotions - match the energy!
  happy: {
    speedAdjust: 0.1, // Slightly faster
    volumeAdjust: 1.1,
    ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'high', energy: 'high', pause: 'less' },
  },

  excited: {
    speedAdjust: 0.2, // More energy
    volumeAdjust: 1.15,
    ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'high', energy: 'high', pause: 'less' },
  },

  // Negative emotions - slow down, add warmth
  sad: {
    speedAdjust: -0.2, // Slower
    volumeAdjust: 0.9,
    ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' },
    responseStyle: { warmth: 'high', energy: 'low', pause: 'more' },
  },

  anxious: {
    speedAdjust: -0.15,
    volumeAdjust: 0.95,
    ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'medium', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'high', energy: 'medium', pause: 'more' },
  },

  worried: {
    speedAdjust: -0.1,
    volumeAdjust: 0.95,
    ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'medium', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'high', energy: 'medium', pause: 'more' },
  },

  frustrated: {
    speedAdjust: -0.1,
    volumeAdjust: 1.0,
    ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'high', energy: 'medium', pause: 'normal' },
  },

  angry: {
    speedAdjust: -0.15,
    volumeAdjust: 0.95,
    ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'high', energy: 'low', pause: 'more' },
  },

  // Neutral states
  neutral: {
    speedAdjust: 0,
    volumeAdjust: 1.0,
    ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'medium', energy: 'medium', pause: 'normal' },
  },

  curious: {
    speedAdjust: 0,
    volumeAdjust: 1.0,
    ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'medium', energy: 'medium', pause: 'normal' },
  },

  // Special states
  tired: {
    speedAdjust: -0.2,
    volumeAdjust: 0.9,
    ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' },
    responseStyle: { warmth: 'high', energy: 'low', pause: 'more' },
  },

  confident: {
    speedAdjust: 0.05,
    volumeAdjust: 1.05,
    ssmlHints: { prosodyRate: 'medium', prosodyPitch: 'medium', prosodyVolume: 'medium' },
    responseStyle: { warmth: 'medium', energy: 'medium', pause: 'normal' },
  },
};

// FIX BUG #voice-13: Make emotion responses extensible
type EmotionResponseType = Omit<VoiceEmotionModulation, 'matchedEmotion' | 'confidence'>;

/**
 * Register a custom emotion response
 * FIX BUG #voice-13: Allow extending emotion responses at runtime
 */
export function registerEmotionResponse(emotion: string, response: EmotionResponseType): void {
  EMOTION_RESPONSES[emotion.toLowerCase()] = response;
}

/**
 * Get all registered emotion types
 */
export function getRegisteredEmotions(): string[] {
  return Object.keys(EMOTION_RESPONSES);
}

/**
 * Check if an emotion type is registered
 */
export function isEmotionRegistered(emotion: string): boolean {
  return emotion.toLowerCase() in EMOTION_RESPONSES;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Get voice modulation parameters based on detected user emotion
 */
export function getEmotionModulation(
  voiceEmotion: VoiceEmotionResult | null
): VoiceEmotionModulation {
  // Default to neutral if no emotion detected
  if (!voiceEmotion || voiceEmotion.confidence < 0.3) {
    return {
      ...EMOTION_RESPONSES.neutral,
      matchedEmotion: 'neutral',
      confidence: 0,
    };
  }

  const emotion = voiceEmotion.primary.toLowerCase();
  const response = EMOTION_RESPONSES[emotion] || EMOTION_RESPONSES.neutral;

  // Scale adjustments by confidence
  const confidenceScale = voiceEmotion.confidence;

  return {
    speedAdjust: response.speedAdjust * confidenceScale,
    volumeAdjust: 1 + (response.volumeAdjust - 1) * confidenceScale,
    ssmlHints: response.ssmlHints,
    responseStyle: response.responseStyle,
    matchedEmotion: emotion,
    confidence: voiceEmotion.confidence,
  };
}

/**
 * Convert emotion modulation to SSML wrapper
 * Wraps the response text in prosody tags to match user emotion
 */
export function wrapWithEmotionProsody(text: string, modulation: VoiceEmotionModulation): string {
  // Only apply if there's meaningful modulation
  if (modulation.confidence < 0.4) {
    return text;
  }

  const { ssmlHints } = modulation;
  const attrs: string[] = [];

  if (ssmlHints.prosodyRate && ssmlHints.prosodyRate !== 'medium') {
    attrs.push(`rate="${ssmlHints.prosodyRate}"`);
  }

  if (ssmlHints.prosodyPitch && ssmlHints.prosodyPitch !== 'medium') {
    attrs.push(`pitch="${ssmlHints.prosodyPitch}"`);
  }

  if (ssmlHints.prosodyVolume && ssmlHints.prosodyVolume !== 'medium') {
    attrs.push(`volume="${ssmlHints.prosodyVolume}"`);
  }

  // Only wrap if there are modifications
  if (attrs.length === 0) {
    return text;
  }

  getLogger().debug(
    {
      emotion: modulation.matchedEmotion,
      confidence: modulation.confidence,
      attrs,
    },
    '🎭 Applying emotion prosody to response'
  );

  return `<prosody ${attrs.join(' ')}>${text}</prosody>`;
}

/**
 * Get contextual suggestion for response tone based on emotion
 * This can be injected into the LLM prompt to influence word choice
 */
export function getEmotionGuidance(modulation: VoiceEmotionModulation): string | null {
  if (modulation.confidence < 0.5) {
    return null;
  }

  const { matchedEmotion, responseStyle } = modulation;

  const guidelines: Record<string, string> = {
    sad: `[The user sounds sad. Respond with extra warmth and empathy. Take your time. Use gentler language.]`,
    anxious: `[The user sounds anxious. Be calm and reassuring. Speak slower. Offer concrete help.]`,
    frustrated: `[The user sounds frustrated. Acknowledge their feelings. Be direct and helpful. Don't be overly cheerful.]`,
    angry: `[The user sounds upset. Stay calm and professional. Validate their feelings. Focus on solutions.]`,
    happy: `[The user sounds happy! Match their energy. Feel free to be more enthusiastic.]`,
    excited: `[The user is excited! Share their enthusiasm. Be energetic and positive.]`,
    tired: `[The user sounds tired. Be concise and considerate. Don't overwhelm them with information.]`,
    worried: `[The user sounds worried. Be reassuring and clear. Offer specific help.]`,
  };

  return guidelines[matchedEmotion] || null;
}

/**
 * Apply emotion-aware adjustments to Cartesia TTS speed parameter
 */
export function adjustTTSSpeed(baseSpeed: number, modulation: VoiceEmotionModulation): number {
  // Clamp to Cartesia's valid range: -1.0 to 1.0
  const adjusted = baseSpeed + modulation.speedAdjust;
  return Math.max(-1.0, Math.min(1.0, adjusted));
}

// ============================================================================
// EXPORTS
// ============================================================================

export { EMOTION_RESPONSES };
