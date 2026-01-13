/**
 * Voice-Text Mismatch Detector
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is THE superhuman capability that makes Ferni "better than human."
 * Real humans pick up on incongruence between what's said and how it's said.
 * When someone says "I'm fine" with a trembling voice, we know they're not fine.
 *
 * This module gives Ferni that same intuition - and makes it a PRIORITY signal
 * that shapes the entire response.
 *
 * @module intelligence/unified/mismatch-detector
 */
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
export type MismatchType = 'masking_negative' | 'understating_positive' | 'suppressing' | 'contradicting' | 'deflecting' | 'none';
export interface MismatchResult {
    /** Is there a significant mismatch? */
    detected: boolean;
    /** Confidence in the mismatch detection (0-1) */
    confidence: number;
    /** What the text suggests */
    textEmotion: string;
    /** What the voice reveals */
    voiceEmotion: string;
    /** Type of mismatch */
    type: MismatchType;
    /** Human-readable interpretation */
    interpretation: string;
    /** How to approach this sensitively */
    suggestedApproach: string;
    /** Should we surface this to the user? */
    shouldSurface: boolean;
    /** If surfacing, what to say */
    surfacePhrase?: string;
}
export interface MismatchGuidance {
    /** Critical injection for the prompt */
    promptInjection: string;
    /** Priority level */
    priority: 'critical' | 'high' | 'standard';
    /** Whether to use high-emotion mode */
    useHighEmotionMode: boolean;
}
export declare class VoiceTextMismatchDetector {
    private static instance;
    static getInstance(): VoiceTextMismatchDetector;
    /**
     * Detect mismatch between text sentiment and voice emotion
     */
    detect(userText: string, voiceEmotion: VoiceEmotionResult | null | undefined, textEmotion?: {
        primary: string;
        confidence: number;
        valence?: string;
    }): MismatchResult;
    /**
     * Build critical prompt injection for detected mismatch
     */
    buildGuidance(mismatch: MismatchResult): MismatchGuidance | null;
    private noMismatch;
    private isPositiveText;
    private isNegativeText;
    private isNeutralText;
    private isPositiveVoice;
    private isNegativeVoice;
    private getSurfacePhrase;
}
/**
 * Quick detection function - use for single calls
 */
export declare function detectMismatch(userText: string, voiceEmotion: VoiceEmotionResult | null | undefined, textEmotion?: {
    primary: string;
    confidence: number;
    valence?: string;
}): MismatchResult;
export default VoiceTextMismatchDetector;
//# sourceMappingURL=mismatch-detector.d.ts.map