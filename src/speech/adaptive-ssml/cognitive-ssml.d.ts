/**
 * Cognitive-Aware SSML Tagging
 *
 * Applies cognitive intelligence adjustments to SSML output.
 */
import { type CognitiveSpeechResult } from '../cognitive-speech-integration.js';
import type { CognitiveSsmlOptions } from './types.js';
/**
 * Tag text with SSML, applying cognitive intelligence adjustments.
 *
 * This is the recommended entry point for cognitive-aware speech generation.
 * It combines:
 * - Base SSML tagging
 * - Persona-specific characteristics
 * - Cognitive state adjustments (reasoning mode, confidence, etc.)
 */
export declare function tagTextWithCognitiveSsml(text: string, options: CognitiveSsmlOptions): {
    ssml: string;
    cognitiveResult?: CognitiveSpeechResult;
};
export { clearCognitiveSpeechState, getCognitiveSpeechStats, } from '../cognitive-speech-integration.js';
//# sourceMappingURL=cognitive-ssml.d.ts.map