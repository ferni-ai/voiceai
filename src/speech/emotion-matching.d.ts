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
import type { VoiceEmotionResult } from './audio-prosody.js';
export interface VoiceEmotionModulation {
    speedAdjust: number;
    volumeAdjust: number;
    ssmlHints: {
        prosodyRate?: string;
        prosodyPitch?: string;
        prosodyVolume?: string;
    };
    responseStyle: {
        warmth: 'high' | 'medium' | 'low';
        energy: 'high' | 'medium' | 'low';
        pause: 'more' | 'normal' | 'less';
    };
    matchedEmotion: string;
    confidence: number;
}
/**
 * How the agent should respond to different user emotions
 *
 * Philosophy:
 * - Sad/anxious users → Slower, warmer, more pauses (calming)
 * - Happy/excited users → Match their energy (celebrate with them)
 * - Neutral → Balanced, default response
 * - Angry/frustrated → Calm but not condescending
 */
declare const EMOTION_RESPONSES: Record<string, Omit<VoiceEmotionModulation, 'matchedEmotion' | 'confidence'>>;
type EmotionResponseType = Omit<VoiceEmotionModulation, 'matchedEmotion' | 'confidence'>;
/**
 * Register a custom emotion response
 * FIX BUG #voice-13: Allow extending emotion responses at runtime
 */
export declare function registerEmotionResponse(emotion: string, response: EmotionResponseType): void;
/**
 * Get all registered emotion types
 */
export declare function getRegisteredEmotions(): string[];
/**
 * Check if an emotion type is registered
 */
export declare function isEmotionRegistered(emotion: string): boolean;
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
export declare function getEmotionModulation(voiceEmotion: VoiceEmotionResult | null, tremorOptions?: TremorAdjustmentOptions): VoiceEmotionModulation;
/**
 * Convert emotion modulation to SSML wrapper
 * Wraps the response text in Cartesia-compatible SSML tags to match user emotion
 *
 * Uses Cartesia Sonic-3 compatible tags:
 * - <speed ratio="X"> for pace (0.6-1.2)
 * - <volume ratio="X"> for loudness (0.5-1.5)
 * - <emotion value="X"> for tone (affectionate, sad, curious, etc.)
 */
export declare function wrapWithEmotionProsody(text: string, modulation: VoiceEmotionModulation): string;
export interface HumanListeningSsmlSuggestions {
    speedMultiplier: number;
    pauseMultiplier: number;
    volumeLevel: 'softer' | 'normal' | 'match';
}
/**
 * Apply human listening SSML adjustments to text.
 * Called after emotion prosody to layer in cognitive/emotional state awareness.
 *
 * This responds to:
 * - Cognitive overload → Slower, more pauses
 * - Distress signals → Softer, gentler delivery
 * - Disengagement → Normal pace (don't slow down boring content)
 */
export declare function applyHumanListeningAdjustments(text: string, suggestions: HumanListeningSsmlSuggestions): string;
/**
 * Get contextual suggestion for response tone based on emotion
 * This can be injected into the LLM prompt to influence word choice
 */
export declare function getEmotionGuidance(modulation: VoiceEmotionModulation): string | null;
/**
 * Apply emotion-aware adjustments to Cartesia TTS speed parameter
 */
export declare function adjustTTSSpeed(baseSpeed: number, modulation: VoiceEmotionModulation): number;
export { EMOTION_RESPONSES };
//# sourceMappingURL=emotion-matching.d.ts.map