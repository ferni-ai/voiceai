/**
 * SSML Module - Single Source of Truth
 *
 * This module provides all SSML (Speech Synthesis Markup Language) functionality
 * for the Ferni voice AI platform.
 *
 * This is the CANONICAL source for all SSML functionality.
 * Other modules should import from here:
 *
 * ```typescript
 * import {
 *   tagTextWithSsmlPersonaAware,
 *   sanitizeSsml,
 *   detectEmotion,
 *   CARTESIA_EMOTIONS,
 * } from '../ssml/index.js';
 * ```
 *
 * @module ssml
 */
export type { BreathGroupConfig, CartesiaEmotion, DetectedPacing, DetectedVocalCues, DetectedVolume, FillerConfig, PronunciationEntry, SanitizationResult, SsmlTagOptions, TTSCheckResult, TaggingContext, ThinkingContext, ThinkingInjection, } from './types.js';
export { ALL_CARTESIA_EMOTIONS, CARTESIA_EMOTIONS, CARTESIA_SUPPORTED_EMOTIONS, isCartesiaSupportedEmotion, } from './types.js';
export { FINANCIAL_END, FINANCIAL_START } from './constants.js';
export { ALL_PRONUNCIATIONS, FINANCIAL_PRONUNCIATIONS } from './constants.js';
export { DEFAULT_EMOTION, EMOTION_KEYWORDS, INTENSITY_MODIFIERS } from './constants.js';
export { DEFAULT_SPEED, DEFAULT_VOLUME, EMPHASIS_KEYWORDS, FAST_PACE_KEYWORDS, SLOW_PACE_KEYWORDS, SPEED_ADJUSTMENTS, VOLUME_ADJUSTMENTS, WHISPER_KEYWORDS, } from './constants.js';
export { ACRONYM_PATTERNS, BREATH_POINT_PATTERNS, CONTEMPLATIVE_PATTERNS, CONTRASTIVE_PATTERNS, DISFLUENCY_PATTERNS, LAUGHTER_PATTERNS, LIST_PATTERNS, NUMBER_PATTERNS, PARENTHETICAL_PATTERNS, REFLECTION_PHRASES, REPETITION_PATTERNS, SARCASTIC_PATTERNS, SIGH_PATTERNS, THINKING_PATTERNS, TRANSITION_PATTERNS, } from './constants.js';
export { LAUGHTER_CONVERSION_KEYWORDS, STAGE_DIRECTION_KEYWORDS, STAGE_DIRECTION_PATTERNS, UNSUPPORTED_NONVERBALS, } from './constants.js';
export { CALENDAR_PRONUNCIATIONS, COMMON_ABBREVIATIONS, GEOGRAPHIC_PRONUNCIATIONS, JAPANESE_PRONUNCIATIONS, MENTAL_HEALTH_PRONUNCIATIONS, MINDFULNESS_PRONUNCIATIONS, MISPRONOUNCED_WORDS, NATIVE_AMERICAN_PRONUNCIATIONS, PERSONA_PRONUNCIATIONS, TECH_PRONUNCIATIONS, THOUGHT_LEADER_PRONUNCIATIONS, WELLNESS_PRONUNCIATIONS, ZEN_BUDDHIST_PRONUNCIATIONS, } from './constants.js';
export { breakTag, clampSpeed, clampVolume, detectEmotionFromKeywords, emotionTag, getContextualEmotion, mapToCartesiaEmotion, speedTag, spellTag, volumeTag, } from './tags.js';
export { detectEmotion, detectPacing, detectVocalCues, detectVolume } from './detection.js';
export { hasSsmlTags, sanitizeSsml, stripSsmlTags, tagTextWithSsmlPersonaAware as tagTextWithSsml, tagTextWithSsmlPersonaAware, } from './core.js';
export { applyPronunciationsOptimized, estimatePatternChecks, getCategoryStats, resetPronunciationCache, } from './pronunciation-processor.js';
export type { ThinkingContext as ThinkingTimeContext, ThinkingInjection as ThinkingTimeInjection, } from '../conversation/thinking-time-injector.js';
/**
 * Regex cache for performance optimization
 * Avoids recreating the same regex patterns repeatedly
 */
export declare const regexCache: {
    /**
     * Get a cached regex or create and cache a new one
     */
    get(pattern: string, flags?: string): RegExp;
    /**
     * Clear the regex cache (useful for testing)
     */
    clear(): void;
    /**
     * Get the current cache size
     */
    readonly size: number;
};
export { analyzeSsmlNative, batchAnalyzeSsmlNative, containsSsmlNative, stripSsmlNative, extractBreaksNative, extractEmotionsNative, extractSpeedsNative, insertBreakNative, insertEmotionNative, wrapWithSpeedNative, getNativeSsmlInfo, getNativeSsmlLoadError, isNativeSsmlAvailable, getSsmlMetrics, logSsmlStatus, resetSsmlMetrics, type SsmlAnalysis, type NativeSsmlLibraryInfo, } from './native-ssml-processor.js';
//# sourceMappingURL=index.d.ts.map