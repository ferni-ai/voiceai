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
import { createRequire } from 'module';
import { getLogger } from '../utils/safe-logger.js';
// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);
const log = getLogger().child({ module: 'NativeSsmlProcessor' });
// ============================================================================
// CUSTOM ERROR
// ============================================================================
/**
 * Error thrown when native SSML module is unavailable.
 * Provides actionable instructions for building the module.
 */
export class NativeSsmlUnavailableError extends Error {
    code = 'NATIVE_SSML_UNAVAILABLE';
    buildInstructions;
    constructor(reason) {
        super(`Native SSML module unavailable: ${reason}`);
        this.name = 'NativeSsmlUnavailableError';
        this.buildInstructions = `
To fix this error, build the native perf module:

  cd apps/rust-perf
  pnpm build

Or install pre-built binaries:

  pnpm install @ferni/perf

The native module is REQUIRED for production - no JavaScript fallback exists.
This ensures consistent performance and prevents silent degradation.
`;
        Object.setPrototypeOf(this, NativeSsmlUnavailableError.prototype);
    }
}
// ============================================================================
// MODULE LOADING (FAIL-FAST - NO JS FALLBACK)
// ============================================================================
let nativeModule = null;
let loadAttempted = false;
let loadError = null;
/**
 * Load the native Rust perf module with SSML functions.
 * THROWS if the module is unavailable - no silent fallback.
 */
function loadNativeModule() {
    if (loadAttempted && nativeModule) {
        return nativeModule;
    }
    if (loadAttempted && loadError) {
        throw new NativeSsmlUnavailableError(loadError);
    }
    loadAttempted = true;
    try {
        const mod = require('@ferni/perf');
        // Verify core SSML functions actually exist
        const requiredFunctions = [
            'containsSsml',
            'stripSsml',
            'analyzeSsml',
            'getLibraryInfo',
        ];
        for (const fn of requiredFunctions) {
            if (typeof mod[fn] !== 'function') {
                loadError = `Native module loaded but SSML function '${fn}' not available`;
                log.error({ error: loadError }, '❌ Native SSML processor incomplete - NO FALLBACK');
                throw new NativeSsmlUnavailableError(loadError);
            }
        }
        // Module has all required functions - safe to cast
        nativeModule = mod;
        const info = nativeModule.getLibraryInfo();
        log.info({
            version: info.version,
            simd: info.simdAvailable,
            threads: info.parallelThreads,
        }, '🦀 Native SSML processor loaded (optimized regex)');
        return nativeModule;
    }
    catch (err) {
        if (err instanceof NativeSsmlUnavailableError) {
            throw err;
        }
        loadError = err instanceof Error ? err.message : String(err);
        log.error({ error: loadError }, '❌ Native SSML processor failed to load - NO FALLBACK');
        throw new NativeSsmlUnavailableError(loadError);
    }
}
/**
 * Try to load the native module without throwing.
 * Used for isNativeSsmlAvailable() check.
 */
function tryLoadNativeModule() {
    if (loadAttempted) {
        return nativeModule;
    }
    try {
        return loadNativeModule();
    }
    catch {
        return null;
    }
}
const metrics = {
    nativeCalls: 0,
    tagsProcessed: 0,
    totalTimeNativeMs: 0,
    lastResetTime: Date.now(),
};
/**
 * Get current SSML processor metrics.
 */
export function getSsmlMetrics() {
    return {
        ...metrics,
        avgNativeTimeMs: metrics.nativeCalls > 0 ? metrics.totalTimeNativeMs / metrics.nativeCalls : 0,
    };
}
/**
 * Reset SSML processor metrics.
 */
export function resetSsmlMetrics() {
    metrics.nativeCalls = 0;
    metrics.tagsProcessed = 0;
    metrics.totalTimeNativeMs = 0;
    metrics.lastResetTime = Date.now();
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Check if native SSML processor is available.
 */
export function isNativeSsmlAvailable() {
    return tryLoadNativeModule() !== null;
}
/**
 * Get native library info.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function getNativeSsmlInfo() {
    const mod = loadNativeModule();
    return mod.getLibraryInfo();
}
/**
 * Get the reason native module failed to load (for debugging).
 */
export function getNativeSsmlLoadError() {
    tryLoadNativeModule(); // Ensure we've tried
    return loadError;
}
/**
 * Fast check if text contains any SSML tags.
 * Uses optimized memchr + RegexSet.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function containsSsmlNative(text) {
    const mod = loadNativeModule();
    return mod.containsSsml(text);
}
/**
 * Strip all SSML tags from text, leaving only content.
 * Uses optimized Rust regex.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function stripSsmlNative(text) {
    const mod = loadNativeModule();
    return mod.stripSsml(text);
}
/**
 * Full SSML analysis - extract all tags and compute statistics.
 * Uses optimized Rust regex.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function analyzeSsmlNative(text) {
    const start = performance.now();
    const mod = loadNativeModule();
    const result = mod.analyzeSsml(text);
    const elapsed = performance.now() - start;
    metrics.nativeCalls++;
    metrics.totalTimeNativeMs += elapsed;
    metrics.tagsProcessed += result.tags.length;
    return result;
}
/**
 * Batch analyze multiple texts in parallel.
 * Uses Rayon parallel iteration.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function batchAnalyzeSsmlNative(texts) {
    const start = performance.now();
    const mod = loadNativeModule();
    const results = mod.batchAnalyzeSsml(texts);
    const elapsed = performance.now() - start;
    metrics.nativeCalls++;
    metrics.totalTimeNativeMs += elapsed;
    for (const r of results) {
        metrics.tagsProcessed += r.tags.length;
    }
    return results;
}
/**
 * Extract all break tags and their durations.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function extractBreaksNative(text) {
    const mod = loadNativeModule();
    metrics.nativeCalls++;
    return mod.extractBreaks(text);
}
/**
 * Extract all emotion tags.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function extractEmotionsNative(text) {
    const mod = loadNativeModule();
    metrics.nativeCalls++;
    return mod.extractEmotions(text);
}
/**
 * Extract all speed tags.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function extractSpeedsNative(text) {
    const mod = loadNativeModule();
    metrics.nativeCalls++;
    return mod.extractSpeeds(text);
}
/**
 * Insert a break tag at specified position.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function insertBreakNative(text, position, durationMs) {
    const mod = loadNativeModule();
    return mod.insertBreak(text, position, durationMs);
}
/**
 * Insert an emotion tag at specified position.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function insertEmotionNative(text, position, emotion) {
    const mod = loadNativeModule();
    return mod.insertEmotion(text, position, emotion);
}
/**
 * Wrap text with a speed tag.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function wrapWithSpeedNative(text, speedRatio) {
    const mod = loadNativeModule();
    return mod.wrapWithSpeed(text, speedRatio);
}
/**
 * Log SSML processor status for debugging.
 */
export function logSsmlStatus() {
    const available = isNativeSsmlAvailable();
    const m = getSsmlMetrics();
    if (available) {
        const info = getNativeSsmlInfo();
        log.info({
            nativeAvailable: true,
            version: info.version,
            simd: info.simdAvailable,
            threads: info.parallelThreads,
            totalCalls: m.nativeCalls,
            tagsProcessed: m.tagsProcessed,
            avgTimeMs: m.avgNativeTimeMs.toFixed(2),
        }, '🦀 Native SSML processor status');
    }
    else {
        log.warn({
            nativeAvailable: false,
            loadError,
        }, '⚠️ Native SSML processor not available');
    }
}
//# sourceMappingURL=native-ssml-processor.js.map