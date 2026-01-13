/**
 * Voice-Text Emotion Mismatch Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Real humans pick up on incongruence between what's said and how it's said.
 * When someone says "I'm fine" with a trembling voice, we know they're not fine.
 * This module gives Ferni that same intuition.
 *
 * This is the heart of being "better than human" - not by being smarter,
 * but by being more attentive than humans often are.
 */
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import { type PersonaId } from '../../services/cross-persona-insights.js';
interface MinimalEmotionResult {
    primary: string;
    confidence: number;
}
export interface MismatchResult {
    /** Is there a significant mismatch? */
    hasMismatch: boolean;
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
export type MismatchType = 'masking_negative' | 'understating_positive' | 'deflecting' | 'suppressing' | 'contradicting' | 'incongruent' | 'none';
/**
 * Detect mismatch between text sentiment and voice emotion.
 *
 * Uses HYBRID scoring to detect mismatches even with lower voice confidence
 * when text signals corroborate the emotional state. This is "Better Than Human"
 * because we catch what text-only analysis would miss.
 *
 * THRESHOLDS LOWERED (Dec 2024):
 * - Base voice confidence: 0.25 (was 0.4)
 * - Hybrid confidence can boost up to 0.35
 * - This catches more "I'm fine" moments
 */
export declare function detectMismatch(userText: string, voiceEmotion: VoiceEmotionResult | null, textEmotion?: MinimalEmotionResult): MismatchResult;
/**
 * Record mismatch as a cross-persona insight (for team awareness)
 */
export declare function recordMismatchInsight(userId: string, personaId: PersonaId, mismatch: MismatchResult): Promise<void>;
/**
 * Build guidance for LLM based on detected mismatch
 */
export declare function buildMismatchGuidance(mismatch: MismatchResult): string | null;
declare const _default: {
    detectMismatch: typeof detectMismatch;
    recordMismatchInsight: typeof recordMismatchInsight;
    buildMismatchGuidance: typeof buildMismatchGuidance;
};
export default _default;
//# sourceMappingURL=voice-mismatch.d.ts.map