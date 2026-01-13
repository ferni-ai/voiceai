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
import { type PersonaEmotionProfile } from './emotion-profiles.js';
/**
 * Primary emotions (best results per Cartesia docs)
 */
export declare const PRIMARY_EMOTIONS: readonly ["neutral", "angry", "excited", "content", "sad", "scared"];
/**
 * Full emotion palette supported by Sonic-3
 */
export declare const CARTESIA_EMOTIONS: {
    readonly happy: "happy";
    readonly excited: "excited";
    readonly enthusiastic: "enthusiastic";
    readonly elated: "elated";
    readonly euphoric: "euphoric";
    readonly triumphant: "triumphant";
    readonly amazed: "amazed";
    readonly surprised: "surprised";
    readonly flirtatious: "flirtatious";
    readonly joking: "joking/comedic";
    readonly curious: "curious";
    readonly grateful: "grateful";
    readonly affectionate: "affectionate";
    readonly sympathetic: "sympathetic";
    readonly proud: "proud";
    readonly confident: "confident";
    readonly content: "content";
    readonly peaceful: "peaceful";
    readonly serene: "serene";
    readonly calm: "calm";
    readonly contemplative: "contemplative";
    readonly nostalgic: "nostalgic";
    readonly wistful: "wistful";
    readonly mysterious: "mysterious";
    readonly anticipation: "anticipation";
    readonly angry: "angry";
    readonly mad: "mad";
    readonly outraged: "outraged";
    readonly frustrated: "frustrated";
    readonly agitated: "agitated";
    readonly disgusted: "disgusted";
    readonly contempt: "contempt";
    readonly envious: "envious";
    readonly sarcastic: "sarcastic";
    readonly ironic: "ironic";
    readonly sad: "sad";
    readonly dejected: "dejected";
    readonly melancholic: "melancholic";
    readonly disappointed: "disappointed";
    readonly hurt: "hurt";
    readonly guilty: "guilty";
    readonly rejected: "rejected";
    readonly bored: "bored";
    readonly tired: "tired";
    readonly resigned: "resigned";
    readonly hesitant: "hesitant";
    readonly insecure: "insecure";
    readonly confused: "confused";
    readonly apologetic: "apologetic";
    readonly anxious: "anxious";
    readonly scared: "scared";
    readonly panicked: "panicked";
    readonly alarmed: "alarmed";
    readonly threatened: "threatened";
    readonly neutral: "neutral";
    readonly distant: "distant";
    readonly skeptical: "skeptical";
    readonly determined: "determined";
};
export type CartesiaEmotion = (typeof CARTESIA_EMOTIONS)[keyof typeof CARTESIA_EMOTIONS];
/**
 * Maps conversation mood states to appropriate Cartesia emotions
 */
export declare const MOOD_TO_EMOTIONS: Record<string, CartesiaEmotion[]>;
/**
 * Get appropriate emotion for a mood state
 */
export declare function getEmotionForMood(mood: string): CartesiaEmotion;
export interface VoiceProfile {
    speed: number;
    volume: number;
    emotion?: CartesiaEmotion;
}
/**
 * Voice profiles for different conversational moments
 */
export declare const VOICE_PROFILES: Record<string, VoiceProfile>;
/**
 * Get voice profile for a moment type
 */
export declare function getVoiceProfile(moment: string): VoiceProfile;
/**
 * Clamp speed to Cartesia's valid range (0.6 - 1.5)
 */
export declare function clampSpeed(speed: number): number;
/**
 * Clamp volume to Cartesia's valid range (0.5 - 2.0)
 */
export declare function clampVolume(volume: number): number;
/**
 * Generate SSML emotion tag
 */
export declare function emotionTag(emotion: CartesiaEmotion): string;
/**
 * Generate SSML speed tag
 */
export declare function speedTag(ratio: number): string;
/**
 * Generate SSML volume tag
 */
export declare function volumeTag(ratio: number): string;
/**
 * Generate break/pause tag
 */
export declare function breakTag(ms: number): string;
/**
 * Generate a complete voice profile as SSML prefix
 */
export declare function voiceProfileToSsml(profile: VoiceProfile): string;
/**
 * Wrap text with a voice profile
 */
export declare function wrapWithProfile(text: string, profileName: string): string;
/**
 * Common self-correction patterns for natural speech
 */
export declare const SELF_CORRECTIONS: string[];
/**
 * Trailing off patterns
 */
export declare const TRAILING_OFF: string[];
/**
 * Thinking sounds (natural, no tags needed)
 */
export declare const THINKING_SOUNDS: string[];
/**
 * Realization patterns
 */
export declare const REALIZATIONS: string[];
/**
 * Get a random element from an array
 */
export declare function randomFrom<T>(arr: readonly T[]): T;
/**
 * Suggested emotion progressions for different conversation arcs
 */
export declare const EMOTION_PROGRESSIONS: Record<string, CartesiaEmotion[]>;
/**
 * Get emotion for a position in a progression
 */
export declare function getEmotionInProgression(progression: string, position: number, total: number): CartesiaEmotion;
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
export declare function applyPersonaVoiceFingerprint(text: string, personaId: string, options?: {
    emotion?: string;
    intensity?: 'subtle' | 'normal' | 'strong';
    addNonverbal?: boolean;
}): string;
/**
 * Get a random emotion from persona's natural range.
 * Use this to vary emotions while staying in-character.
 */
export declare function getRandomPersonaEmotion(personaId: string): string;
/**
 * Check if an emotion is in persona's natural range.
 * Helps avoid jarring out-of-character moments.
 */
export declare function isEmotionInPersonaRange(personaId: string, emotion: string): boolean;
/**
 * Get appropriate emotion for a moment, constrained to persona's range.
 * Falls back to persona's default if the requested emotion isn't in their range.
 */
export declare function getPersonaAppropriateEmotion(personaId: string, requestedEmotion: string): string;
/**
 * Apply contextual emotion shift based on conversation moment.
 * Stays within persona's emotional range.
 */
export declare function applyContextualEmotion(text: string, personaId: string, context: {
    isHeavyTopic?: boolean;
    isCelebration?: boolean;
    isQuestion?: boolean;
    isLateNight?: boolean;
    userEmotion?: string;
}): string;
export type { PersonaEmotionProfile };
//# sourceMappingURL=cartesia-expressiveness.d.ts.map