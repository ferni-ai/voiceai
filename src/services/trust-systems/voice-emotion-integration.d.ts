/**
 * Voice Emotion Integration
 *
 * Enhances trust system detection by incorporating voice emotion signals.
 * When someone says "I'm fine" but their voice is sad, that's a stronger signal.
 *
 * Philosophy: Words lie, voice doesn't. The tone, pace, and emotion in
 * someone's voice tells the truth their words might be hiding.
 *
 * @module VoiceEmotionIntegration
 */
import { type UnsaidSignal } from './reading-between-lines.js';
export interface VoiceEmotionSignal {
    /** Detected emotion from voice */
    emotion: string;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Speech characteristics */
    characteristics?: {
        pace?: 'slow' | 'normal' | 'fast' | 'rushed';
        volume?: 'quiet' | 'normal' | 'loud';
        stability?: 'steady' | 'wavering' | 'breaking';
        energy?: 'low' | 'normal' | 'high';
    };
}
export interface EnhancedUnsaidSignal extends UnsaidSignal {
    /** Voice evidence that supports this signal */
    voiceEvidence?: {
        emotion: string;
        confidence: number;
        mismatchStrength: number;
    };
    /** Combined confidence (text + voice) */
    combinedConfidence: number;
}
export interface EmotionMismatch {
    /** What they said */
    statedEmotion: string;
    /** What their voice revealed */
    voiceEmotion: string;
    /** How strong the mismatch is (0-1) */
    mismatchStrength: number;
    /** Suggested interpretation */
    interpretation: string;
}
/**
 * Detect mismatch between stated emotion and voice emotion
 */
export declare function detectEmotionMismatch(statedText: string, voiceSignal: VoiceEmotionSignal): EmotionMismatch | null;
/**
 * Enhance unsaid signal detection with voice emotion data
 */
export declare function enhanceWithVoiceEmotion(userId: string, userMessage: string, textContext: {
    recentTopics?: string[];
    detectedEmotion?: string;
    emotionIntensity?: number;
}, voiceSignal?: VoiceEmotionSignal): EnhancedUnsaidSignal[];
/**
 * Update baseline voice patterns for a user
 */
export declare function updateVoiceBaseline(userId: string, signal: VoiceEmotionSignal): void;
/**
 * Check if current voice deviates from baseline
 */
export declare function detectVoiceDeviation(userId: string, signal: VoiceEmotionSignal): {
    deviates: boolean;
    deviation?: string;
    significance: number;
};
declare const _default: {
    detectEmotionMismatch: typeof detectEmotionMismatch;
    enhanceWithVoiceEmotion: typeof enhanceWithVoiceEmotion;
    updateVoiceBaseline: typeof updateVoiceBaseline;
    detectVoiceDeviation: typeof detectVoiceDeviation;
};
export default _default;
//# sourceMappingURL=voice-emotion-integration.d.ts.map