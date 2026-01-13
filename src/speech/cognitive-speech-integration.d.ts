/**
 * Cognitive Speech Integration
 *
 * Wires cognitive intelligence into the speech pipeline.
 * Adjusts voice parameters based on:
 * - Cognitive reasoning mode (analytical vs empathetic)
 * - Confidence level (certain vs uncertain)
 * - Thinking aloud (showing work)
 * - User cognitive style matching
 */
import type { SpeechContext } from './speech-context.js';
import type { CognitiveGuidance, ReasoningStyle, CognitiveProfile } from '../personas/cognitive-types.js';
import { type SpeechAdjustments } from './cognitive-speech.js';
import type { SpeechCharacteristics } from '../personas/types.js';
export interface CognitiveSpeechInput {
    /** Base speech context */
    speechContext: SpeechContext;
    /** Base speech characteristics from persona */
    baseCharacteristics: SpeechCharacteristics;
    /** Current cognitive guidance */
    cognitiveGuidance: CognitiveGuidance;
    /** Full cognitive profile (optional) */
    cognitiveProfile?: CognitiveProfile;
    /** Emotional weight of conversation */
    emotionalWeight: number;
    /** Whether in a multi-step reasoning chain */
    inReasoningChain?: boolean;
    /** Current step in chain */
    chainStep?: number;
    /** Total steps */
    chainTotal?: number;
}
export interface CognitiveSpeechResult {
    /** Adjusted speech characteristics */
    characteristics: SpeechCharacteristics;
    /** SSML prefix to inject before text */
    ssmlPrefix: string;
    /** SSML suffix to inject after text */
    ssmlSuffix: string;
    /** Optional thinking sound to insert */
    thinkingSound?: string;
    /** Debug info */
    debug: {
        cognitiveMode: ReasoningStyle;
        confidence: number;
        adjustments: SpeechAdjustments;
    };
}
/**
 * Apply cognitive adjustments to speech
 */
export declare function applyCognitiveSpeechAdjustments(input: CognitiveSpeechInput, sessionId: string): CognitiveSpeechResult;
/**
 * Build cognitive-aware SSML for a text response
 */
export declare function buildCognitiveSSML(text: string, cognitiveResult: CognitiveSpeechResult): string;
/**
 * Get cognitive speech stats for a session
 */
export declare function getCognitiveSpeechStats(sessionId: string): {
    totalTurns: number;
    thinkingSoundsUsed: number;
    thinkingSoundRate: number;
    showReasoningRate: number;
    lastReasoningStyle: ReasoningStyle;
};
/**
 * Clear cognitive speech state for a session
 */
export declare function clearCognitiveSpeechState(sessionId: string): void;
/**
 * Get speech characteristic overrides for reasoning styles
 * These can be used to quickly adjust speech for different cognitive modes
 */
export declare function getReasoningStyleSpeechPreset(style: ReasoningStyle): Partial<SpeechCharacteristics>;
declare const _default: {
    applyCognitiveSpeechAdjustments: typeof applyCognitiveSpeechAdjustments;
    buildCognitiveSSML: typeof buildCognitiveSSML;
    getCognitiveSpeechStats: typeof getCognitiveSpeechStats;
    clearCognitiveSpeechState: typeof clearCognitiveSpeechState;
    getReasoningStyleSpeechPreset: typeof getReasoningStyleSpeechPreset;
};
export default _default;
//# sourceMappingURL=cognitive-speech-integration.d.ts.map