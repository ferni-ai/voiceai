/**
 * Cognitive Speech Integration
 *
 * Adjusts speech patterns based on cognitive state:
 * - Showing reasoning → slower, more pauses
 * - Confident → faster, fewer hedges
 * - Uncertain → more pauses, trailing off
 * - Empathetic → softer, more breathing room
 */
import type { ReasoningStyle } from '../personas/cognitive-types.js';
import type { SpeechCharacteristics } from '../personas/types.js';
export interface CognitiveSpeechContext {
    /** Current reasoning approach */
    reasoningStyle: ReasoningStyle;
    /** Whether showing thinking process */
    showingReasoning: boolean;
    /** Confidence level (0-1) */
    confidence: number;
    /** Emotional weight of conversation */
    emotionalWeight: number;
    /** Whether in a reasoning chain */
    inReasoningChain: boolean;
    /** Current step in chain (if applicable) */
    chainStep?: number;
    /** Total steps in chain */
    chainTotal?: number;
}
export interface SpeechAdjustments {
    /** Multiplier for base speed (0.7 - 1.2) */
    speedMultiplier: number;
    /** Multiplier for pause duration (0.6 - 1.8) */
    pauseMultiplier: number;
    /** Additional thinking sounds probability (0 - 0.3) */
    thinkingSoundBoost: number;
    /** Emphasis style override */
    emphasisStyle?: 'subtle' | 'moderate' | 'pronounced';
    /** Additional pauses to insert */
    additionalPauses: Array<{
        type: 'thinking' | 'emphasis' | 'breath' | 'transition';
        position: 'start' | 'middle' | 'end';
        duration: 'short' | 'medium' | 'long';
    }>;
    /** Phrases to potentially insert */
    filler?: string;
}
/**
 * Calculate speech adjustments based on cognitive context
 */
export declare function calculateCognitiveSpeechAdjustments(baseCharacteristics: SpeechCharacteristics, context: CognitiveSpeechContext): SpeechAdjustments;
/**
 * Apply cognitive adjustments to base speech characteristics
 */
export declare function applyCognitiveAdjustments(base: SpeechCharacteristics, adjustments: SpeechAdjustments): SpeechCharacteristics;
/**
 * Get SSML-compatible pause durations
 */
export declare function getPauseDuration(duration: 'short' | 'medium' | 'long'): string;
/**
 * Build SSML pause element
 */
export declare function buildPauseSSML(pause: SpeechAdjustments['additionalPauses'][0]): string;
/**
 * Get thinking sounds based on cognitive state
 *
 * HUMANIZATION FIX: Removed "Let me see/think" - too robotic.
 * Keep only natural conversational sounds that don't feel like voice assistant responses.
 */
export declare function getCognitiveThinkingSound(reasoningStyle: ReasoningStyle, confidence: number): string;
declare const _default: {
    calculateCognitiveSpeechAdjustments: typeof calculateCognitiveSpeechAdjustments;
    applyCognitiveAdjustments: typeof applyCognitiveAdjustments;
    getPauseDuration: typeof getPauseDuration;
    buildPauseSSML: typeof buildPauseSSML;
    getCognitiveThinkingSound: typeof getCognitiveThinkingSound;
};
export default _default;
//# sourceMappingURL=cognitive-speech.d.ts.map