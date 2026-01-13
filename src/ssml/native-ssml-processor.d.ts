/**
 * Native SSML Processor - Rust-accelerated SSML processing
 *
 * Uses the Rust ferni-perf crate for optimized regex-based SSML processing.
 * REQUIRED: Native module must be available - no JavaScript fallback.
 *
 * Performance characteristics:
 * - Rust regex: 3-10x faster than JavaScript RegExp
 * - Pre-compiled patterns (DFA-based regex engine)
 * - memchr for fast byte searching
 * - Parallel batch processing with Rayon
 *
 * If the native module fails to load, functions throw NativeSsmlUnavailableError
 * with clear instructions for building the native module.
 *
 * @module ssml/native-ssml-processor
 */
/**
 * Error thrown when native SSML module is unavailable.
 * Provides actionable instructions for building the module.
 */
export declare class NativeSsmlUnavailableError extends Error {
    readonly code = "NATIVE_SSML_UNAVAILABLE";
    readonly buildInstructions: string;
    constructor(reason: string);
}
/** SSML tag types */
export type SsmlTagType = 'break' | 'emotion' | 'speed' | 'volume' | 'spell' | 'emphasis' | 'prosody' | 'phoneme' | 'sayAs' | 'speak' | 'unknown';
/** Extracted SSML tag with its data */
export interface ExtractedTag {
    /** Tag type */
    tagType: SsmlTagType;
    /** Full matched text */
    fullMatch: string;
    /** Tag attributes as key-value pairs */
    attributes: Record<string, string>;
    /** Content between opening and closing tags (for non-self-closing) */
    content: string | null;
    /** Start position in original text */
    startPos: number;
    /** End position in original text */
    endPos: number;
}
/** Result of SSML analysis */
export interface SsmlAnalysis {
    /** All extracted tags */
    tags: ExtractedTag[];
    /** Plain text with all SSML removed */
    plainText: string;
    /** Total break time in milliseconds */
    totalBreakMs: number;
    /** Detected emotions */
    emotions: string[];
    /** Speed modifiers found */
    speeds: number[];
    /** Has any SSML tags */
    hasSsml: boolean;
}
/** Library info from native module */
export interface NativeSsmlLibraryInfo {
    version: string;
    simdAvailable: boolean;
    parallelThreads: number;
}
interface SsmlMetrics {
    nativeCalls: number;
    tagsProcessed: number;
    totalTimeNativeMs: number;
    lastResetTime: number;
}
/**
 * Get current SSML processor metrics.
 */
export declare function getSsmlMetrics(): SsmlMetrics & {
    avgNativeTimeMs: number;
};
/**
 * Reset SSML processor metrics.
 */
export declare function resetSsmlMetrics(): void;
/**
 * Check if native SSML processor is available.
 */
export declare function isNativeSsmlAvailable(): boolean;
/**
 * Get native library info.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function getNativeSsmlInfo(): NativeSsmlLibraryInfo;
/**
 * Get the reason native module failed to load (for debugging).
 */
export declare function getNativeSsmlLoadError(): string | null;
/**
 * Fast check if text contains any SSML tags.
 * Uses optimized memchr + RegexSet.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function containsSsmlNative(text: string): boolean;
/**
 * Strip all SSML tags from text, leaving only content.
 * Uses optimized Rust regex.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function stripSsmlNative(text: string): string;
/**
 * Full SSML analysis - extract all tags and compute statistics.
 * Uses optimized Rust regex.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function analyzeSsmlNative(text: string): SsmlAnalysis;
/**
 * Batch analyze multiple texts in parallel.
 * Uses Rayon parallel iteration.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function batchAnalyzeSsmlNative(texts: string[]): SsmlAnalysis[];
/**
 * Extract all break tags and their durations.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function extractBreaksNative(text: string): Array<{
    durationMs: number;
    startPos: number;
    endPos: number;
}>;
/**
 * Extract all emotion tags.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function extractEmotionsNative(text: string): Array<{
    emotion: string;
    startPos: number;
    endPos: number;
}>;
/**
 * Extract all speed tags.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function extractSpeedsNative(text: string): Array<{
    speed: number;
    startPos: number;
    endPos: number;
}>;
/**
 * Insert a break tag at specified position.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function insertBreakNative(text: string, position: number, durationMs: number): string;
/**
 * Insert an emotion tag at specified position.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function insertEmotionNative(text: string, position: number, emotion: string): string;
/**
 * Wrap text with a speed tag.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export declare function wrapWithSpeedNative(text: string, speedRatio: number): string;
/**
 * Log SSML processor status for debugging.
 */
export declare function logSsmlStatus(): void;
export {};
//# sourceMappingURL=native-ssml-processor.d.ts.map