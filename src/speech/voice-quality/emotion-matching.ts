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

import { getLogger } from '../../utils/safe-logger.js';
import type { VoiceEmotionResult } from '../audio-prosody.js';

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
 * Options for voice tremor adjustment
 */
export interface TremorAdjustmentOptions {
  /** Tremor intensity level from voice analysis */
  intensity?: 'none' | 'subtle' | 'noticeable' | 'pronounced';
  /** Tremor type if detected */
  type?: string;
}

/**
 * Get voice modulation parameters based on detected user emotion
 *
 * @param voiceEmotion - Voice emotion analysis result
 * @param tremorOptions - Optional voice tremor data for "Better than Human" sensitivity
 */
export function getEmotionModulation(
  voiceEmotion: VoiceEmotionResult | null,
  tremorOptions?: TremorAdjustmentOptions
): VoiceEmotionModulation {
  // Default to neutral if no emotion detected
  if (!voiceEmotion || voiceEmotion.confidence < 0.3) {
    const baseResponse = { ...EMOTION_RESPONSES.neutral };

    // 🎭 BETTER THAN HUMAN: Even without clear emotion, respond to voice tremor
    // Trembling voice = user is stressed, even if they sound "neutral"
    if (tremorOptions?.intensity === 'pronounced' || tremorOptions?.intensity === 'noticeable') {
      return {
        speedAdjust: -0.15, // Slow down
        volumeAdjust: 0.9, // Softer
        ssmlHints: { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' },
        responseStyle: { warmth: 'high', energy: 'low', pause: 'more' },
        matchedEmotion: 'stressed_tremor',
        confidence: tremorOptions.intensity === 'pronounced' ? 0.8 : 0.6,
      };
    }

    return {
      ...baseResponse,
      matchedEmotion: 'neutral',
      confidence: 0,
    };
  }

  const emotion = voiceEmotion.primary.toLowerCase();
  const response = EMOTION_RESPONSES[emotion] || EMOTION_RESPONSES.neutral;

  // Scale adjustments by confidence
  const confidenceScale = voiceEmotion.confidence;

  let speedAdjust = response.speedAdjust * confidenceScale;
  let volumeAdjust = 1 + (response.volumeAdjust - 1) * confidenceScale;
  let ssmlHints = { ...response.ssmlHints };
  const responseStyle = { ...response.responseStyle };

  // 🎭 BETTER THAN HUMAN: Voice tremor overrides - user may be MORE stressed than emotion shows
  // When voice trembles, they need extra gentleness regardless of detected emotion
  if (tremorOptions?.intensity === 'pronounced') {
    // Pronounced tremor = significant stress - go extra gentle
    speedAdjust = Math.min(speedAdjust, -0.2); // At least 20% slower
    volumeAdjust = Math.min(volumeAdjust, 0.85); // Definitely softer
    ssmlHints = { prosodyRate: 'slow', prosodyPitch: 'low', prosodyVolume: 'soft' };
    responseStyle.warmth = 'high';
    responseStyle.pause = 'more';

    getLogger().debug(
      { emotion, tremorIntensity: tremorOptions.intensity },
      '🎭 Voice tremor override: applying extra-gentle delivery'
    );
  } else if (tremorOptions?.intensity === 'noticeable') {
    // Noticeable tremor = some stress - gentle up a bit
    speedAdjust = Math.min(speedAdjust, -0.1); // At least 10% slower
    volumeAdjust = Math.min(volumeAdjust, 0.95); // Slightly softer
    if (ssmlHints.prosodyVolume !== 'soft') {
      ssmlHints.prosodyVolume = 'medium'; // Don't be loud
    }
    responseStyle.warmth = 'high';
  }

  return {
    speedAdjust,
    volumeAdjust,
    ssmlHints,
    responseStyle,
    matchedEmotion: emotion,
    confidence: voiceEmotion.confidence,
  };
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
