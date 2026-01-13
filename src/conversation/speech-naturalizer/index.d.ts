/**
 * Speech Naturalizer Module
 *
 * Clean architecture refactoring of the speech naturalizer.
 *
 * @module @ferni/conversation/speech-naturalizer
 */
export type { DisfluencyConfig, DisfluencyPatterns, NaturalizationContext, RandomOptions, ThinkingPattern, } from './types.js';
export { DEFAULT_DISFLUENCIES, getPatternsForPersona, HEDGES_BY_STRENGTH, PERSONA_DISFLUENCIES, TYPE_SPECIFIC_THINKING, } from './patterns.js';
export { applyRandomImperfection, DOUBT_TO_CONVICTION, generateCourseCorrection, generateDoubtToConviction, generateFragment, generateGracefulUncertainty, generateSelfInterruption, generateThinkingOutLoud, GRACEFUL_UNCERTAINTY, MID_THOUGHT_CORRECTIONS, SELF_INTERRUPTIONS, shouldApplyImperfection, THINKING_OUT_LOUD, } from './imperfections.js';
export { SpeechNaturalizer, default } from './engine.js';
import { SpeechNaturalizer } from './engine.js';
export declare function getSpeechNaturalizer(): SpeechNaturalizer;
export declare function resetSpeechNaturalizer(): void;
//# sourceMappingURL=index.d.ts.map