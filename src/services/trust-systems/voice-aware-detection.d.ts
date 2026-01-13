/**
 * Voice-Aware Unsaid Detection
 *
 * Enhances "reading between the lines" with voice prosody analysis.
 * This is the "Better Than Human" superpower - hearing what they're NOT saying
 * through their voice, not just their words.
 *
 * Key capabilities:
 * - Detect false "I'm fine" from voice tone contradiction
 * - Identify emotional suppression in prosody
 * - Combine text + voice signals for higher confidence
 *
 * @module VoiceAwareDetection
 */
import { type UnsaidSignal } from './reading-between-lines.js';
export interface VoiceEmotionSignal {
    /** Primary detected emotion */
    primary: string;
    /** Confidence in detection 0-1 */
    confidence: number;
    /** Emotion intensity 0-1 */
    intensity: number;
    /** Optional secondary emotion */
    secondary?: string;
    /** Prosody characteristics */
    characteristics?: {
        pitchVariance?: number;
        speechRate?: number;
        energy?: number;
        breathiness?: number;
    };
}
export interface VoiceAwareContext {
    /** Recent topics in conversation */
    recentTopics?: string[];
    /** What user stated their emotion as */
    statedEmotion?: string;
    /** Voice-detected emotion */
    detectedEmotion?: string;
    /** Emotion intensity */
    emotionIntensity?: number;
    /** Previous messages */
    previousMessages?: string[];
    /** Topic before current */
    topicBeforeThis?: string;
    /** Voice prosody signal */
    voiceEmotion?: VoiceEmotionSignal;
}
/**
 * Detect unsaid signals using BOTH text and voice analysis.
 *
 * This is the "Better Than Human" superpower - we can hear:
 * - False "I'm fine" (words say fine, voice says sad)
 * - Emotional suppression (flat voice on emotional topic)
 * - Hidden distress (trembling voice, forced calm)
 *
 * @param userId - User ID for profile tracking
 * @param userMessage - What the user said
 * @param context - Context including voice emotion
 * @returns Array of unsaid signals with enhanced confidence
 */
export declare function detectUnsaidSignalsWithVoice(userId: string, userMessage: string, context: VoiceAwareContext): UnsaidSignal[];
declare const _default: {
    detectUnsaidSignalsWithVoice: typeof detectUnsaidSignalsWithVoice;
};
export default _default;
//# sourceMappingURL=voice-aware-detection.d.ts.map