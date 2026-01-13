/**
 * Native Audio Analyzer - Rust-accelerated prosody analysis
 *
 * Uses the Rust ferni-audio crate for zero-allocation audio processing.
 * REQUIRED: Native module must be available - no JavaScript fallback.
 *
 * Performance characteristics:
 * - Zero per-frame allocations (~192KB/sec GC reduction)
 * - <1ms per 20ms frame processing
 * - SIMD-accelerated where available
 *
 * If the native module fails to load, functions throw NativeAudioUnavailableError
 * with clear instructions for building the native module.
 *
 * @module speech/audio-prosody/native-analyzer
 */
import { createRequire } from 'module';
import { getLogger } from '../../utils/safe-logger.js';
// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);
const log = getLogger().child({ module: 'NativeAudioAnalyzer' });
// ============================================================================
// CUSTOM ERROR
// ============================================================================
/**
 * Error thrown when native audio module is unavailable.
 * Provides actionable instructions for building the module.
 */
export class NativeAudioUnavailableError extends Error {
    code = 'NATIVE_AUDIO_UNAVAILABLE';
    buildInstructions;
    constructor(reason) {
        super(`Native audio module unavailable: ${reason}`);
        this.name = 'NativeAudioUnavailableError';
        this.buildInstructions = `
To fix this error, build the native audio module:

  cd apps/rust-audio
  pnpm build

Or install pre-built binaries:

  pnpm install @ferni/audio

The native module is REQUIRED for production - no JavaScript fallback exists.
This ensures consistent performance and prevents silent degradation.
`;
        Object.setPrototypeOf(this, NativeAudioUnavailableError.prototype);
    }
}
// ============================================================================
// MODULE LOADING (FAIL-FAST - NO JS FALLBACK)
// ============================================================================
let nativeModule = null;
let loadAttempted = false;
let loadError = null;
/**
 * Load the native Rust audio module.
 * THROWS if the module is unavailable - no silent fallback.
 */
function loadNativeModule() {
    if (loadAttempted && nativeModule) {
        return nativeModule;
    }
    if (loadAttempted && loadError) {
        throw new NativeAudioUnavailableError(loadError);
    }
    loadAttempted = true;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        nativeModule = require('@ferni/audio');
        const info = nativeModule.getLibraryInfo();
        log.info({
            version: info.version,
            bufferPoolSize: info.bufferPoolSize,
            sampleRate: info.defaultSampleRate,
        }, '🦀 Native audio processor loaded (zero-allocation mode)');
        return nativeModule;
    }
    catch (err) {
        loadError = err instanceof Error ? err.message : String(err);
        log.error({ error: loadError }, '❌ Native audio module failed to load - NO FALLBACK');
        throw new NativeAudioUnavailableError(loadError);
    }
}
/**
 * Try to load the native module without throwing.
 * Used for isNativeAudioAvailable() check.
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
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Check if native audio processing is available.
 */
export function isNativeAudioAvailable() {
    return tryLoadNativeModule() !== null;
}
/**
 * Get native library info.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function getNativeLibraryInfo() {
    const mod = loadNativeModule();
    return mod.getLibraryInfo();
}
/**
 * Get the reason native module failed to load (for debugging).
 */
export function getNativeLoadError() {
    tryLoadNativeModule(); // Ensure we've tried
    return loadError;
}
// ============================================================================
// SESSION-SCOPED NATIVE PROCESSOR
// ============================================================================
/**
 * Session-scoped audio processor using native Rust implementation.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function createNativeProcessor(sessionId, sampleRate = 16000) {
    const mod = loadNativeModule();
    return new mod.NativeAudioProcessor(sessionId, sampleRate);
}
// ============================================================================
// SESSION REGISTRY API (for compatibility with existing code)
// ============================================================================
/**
 * Get or create a native processor for a session.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function getOrCreateNativeProcessor(sessionId, sampleRate = 16000) {
    const mod = loadNativeModule();
    return mod.getOrCreateProcessor(sessionId, sampleRate);
}
/**
 * Process an audio frame using the session registry.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function processNativeFrame(sessionId, samples, timestampMs) {
    const mod = loadNativeModule();
    return mod.processSessionFrame(sessionId, samples, timestampMs);
}
/**
 * Get full prosody features for a session.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function getNativeFullFeatures(sessionId) {
    const mod = loadNativeModule();
    return mod.getSessionFullFeatures(sessionId);
}
/**
 * Reset a native processor (keeps buffers, clears state).
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function resetNativeProcessor(sessionId) {
    const mod = loadNativeModule();
    return mod.resetSessionProcessor(sessionId);
}
/**
 * Remove a native processor from the registry.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function removeNativeProcessor(sessionId) {
    const mod = loadNativeModule();
    return mod.removeSessionProcessor(sessionId);
}
/**
 * Get count of active native processors.
 * Returns 0 if native module unavailable (doesn't throw).
 */
export function getActiveNativeProcessorCount() {
    const mod = tryLoadNativeModule();
    return mod?.getActiveProcessorCount() ?? 0;
}
/**
 * Clear all native processors (emergency cleanup).
 * Returns 0 if native module unavailable (doesn't throw).
 */
export function clearAllNativeProcessors() {
    const mod = tryLoadNativeModule();
    return mod?.clearAllProcessors() ?? 0;
}
// ============================================================================
// STANDALONE UTILITIES
// ============================================================================
/**
 * Convert Int16 samples to Float32 using native SIMD implementation.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function convertI16ToF32(samples) {
    const mod = loadNativeModule();
    return mod.convertI16ToF32(samples);
}
/**
 * Compute energy in dB for audio samples.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function computeEnergyDb(samples) {
    const mod = loadNativeModule();
    return mod.computeEnergyDb(samples);
}
/**
 * Check if audio contains speech.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function isSpeechNative(samples, thresholdDb = -40.0) {
    const mod = loadNativeModule();
    return mod.isSpeech(samples, thresholdDb);
}
/**
 * Create a unified analyzer using native Rust implementation.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 *
 * This is the recommended entry point for production use.
 */
export function createUnifiedAnalyzer(sessionId, sampleRate = 16000) {
    const native = createNativeProcessor(sessionId, sampleRate);
    log.debug({ sessionId }, 'Created native audio analyzer');
    return {
        processFrame: (samples, timestampMs) => native.processFrame(samples, timestampMs),
        getFullFeatures: () => native.getFullFeatures(),
        getStats: () => native.getStats(),
        reset: () => native.reset(),
        isNative: true,
        sessionId,
    };
}
// ============================================================================
// SESSION-SCOPED UNIFIED ANALYZERS
// ============================================================================
const unifiedAnalyzers = new Map();
/**
 * Get or create a unified analyzer for a session.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function getSessionUnifiedAnalyzer(sessionId, sampleRate = 16000) {
    const existing = unifiedAnalyzers.get(sessionId);
    if (existing) {
        return existing;
    }
    const analyzer = createUnifiedAnalyzer(sessionId, sampleRate);
    unifiedAnalyzers.set(sessionId, analyzer);
    return analyzer;
}
/**
 * Reset and remove a unified analyzer for a session.
 */
export function resetSessionUnifiedAnalyzer(sessionId) {
    const analyzer = unifiedAnalyzers.get(sessionId);
    if (analyzer) {
        analyzer.reset();
        removeNativeProcessor(sessionId);
        unifiedAnalyzers.delete(sessionId);
    }
}
/**
 * Get count of active unified analyzers.
 */
export function getActiveUnifiedAnalyzerCount() {
    return unifiedAnalyzers.size;
}
/**
 * Clear all unified analyzers (emergency cleanup).
 */
export function clearAllUnifiedAnalyzers() {
    const count = unifiedAnalyzers.size;
    for (const [sessionId, analyzer] of unifiedAnalyzers) {
        analyzer.reset();
        removeNativeProcessor(sessionId);
    }
    unifiedAnalyzers.clear();
    clearAllNativeProcessors();
    return count;
}
//# sourceMappingURL=native-analyzer.js.map