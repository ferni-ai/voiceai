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
  readonly code = 'NATIVE_AUDIO_UNAVAILABLE';
  readonly buildInstructions: string;

  constructor(reason: string) {
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
// TYPES
// ============================================================================

/** Prosody result from native analyzer */
export interface NativeProsodyResult {
  pitchHz: number;
  pitchConfidence: number;
  energyDb: number;
  energyVariance: number;
  zcr: number;
  isSpeech: boolean;
  isVoiced: boolean;
  silenceMs: number;
  pitchTrend: 'rising' | 'falling' | 'stable';
  timestampMs: number;
}

/** Full prosody features for end-of-utterance analysis */
export interface NativeFullProsodyFeatures {
  pitchMean: number;
  pitchVariance: number;
  pitchRange: number;
  energyMean: number;
  energyVariance: number;
  speechRate: number;
  durationMs: number;
  speakingRatio: number;
  pauseCount: number;
}

/** Processor statistics */
export interface NativeProcessorStats {
  totalSamples: number;
  analysisCount: number;
  bufferFillLevel: number;
  isInSpeech: boolean;
  currentSilenceMs: number;
}

/** Library info from native module */
export interface NativeLibraryInfo {
  version: string;
  bufferPoolSize: number;
  maxFrameSize: number;
  defaultSampleRate: number;
}

// ============================================================================
// NATIVE MODULE INTERFACE
// ============================================================================

/** Native module API contract */
interface FerniAudioModule {
  getLibraryInfo: () => NativeLibraryInfo;

  // Class-based API (recommended)
  NativeAudioProcessor: {
    new (sessionId: string, sampleRate?: number): NativeProcessorInstance;
  };

  // Session registry API (alternative)
  getOrCreateProcessor: (sessionId: string, sampleRate?: number) => boolean;
  processSessionFrame: (
    sessionId: string,
    samples: Int16Array,
    timestampMs: number
  ) => NativeProsodyResult | null;
  getSessionFullFeatures: (sessionId: string) => NativeFullProsodyFeatures | null;
  resetSessionProcessor: (sessionId: string) => boolean;
  removeSessionProcessor: (sessionId: string) => boolean;
  getActiveProcessorCount: () => number;
  clearAllProcessors: () => number;

  // Standalone utilities
  convertI16ToF32: (samples: Int16Array) => Float32Array;
  computeEnergyDb: (samples: Float32Array) => number;
  isSpeech: (samples: Float32Array, thresholdDb?: number) => boolean;
}

/** Instance methods for class-based API */
interface NativeProcessorInstance {
  processFrame: (samples: Int16Array, timestampMs: number) => NativeProsodyResult | null;
  processFrameF32: (samples: Float32Array, timestampMs: number) => NativeProsodyResult | null;
  getFullFeatures: () => NativeFullProsodyFeatures;
  getStats: () => NativeProcessorStats;
  reset: () => void;
  readonly sessionId: string;
}

// ============================================================================
// MODULE LOADING (FAIL-FAST - NO JS FALLBACK)
// ============================================================================

let nativeModule: FerniAudioModule | null = null;
let loadAttempted = false;
let loadError: string | null = null;

/**
 * Load the native Rust audio module.
 * THROWS if the module is unavailable - no silent fallback.
 */
function loadNativeModule(): FerniAudioModule {
  if (loadAttempted && nativeModule) {
    return nativeModule;
  }

  if (loadAttempted && loadError) {
    throw new NativeAudioUnavailableError(loadError);
  }

  loadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require('@ferni/audio') as FerniAudioModule;

    const info = nativeModule.getLibraryInfo();
    log.info(
      {
        version: info.version,
        bufferPoolSize: info.bufferPoolSize,
        sampleRate: info.defaultSampleRate,
      },
      '🦀 Native audio processor loaded (zero-allocation mode)'
    );

    return nativeModule;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    log.error({ error: loadError }, '❌ Native audio module failed to load - NO FALLBACK');
    throw new NativeAudioUnavailableError(loadError);
  }
}

/**
 * Try to load the native module without throwing.
 * Used for isNativeAudioAvailable() check.
 */
function tryLoadNativeModule(): FerniAudioModule | null {
  if (loadAttempted) {
    return nativeModule;
  }

  try {
    return loadNativeModule();
  } catch {
    return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if native audio processing is available.
 */
export function isNativeAudioAvailable(): boolean {
  return tryLoadNativeModule() !== null;
}

/**
 * Get native library info.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function getNativeLibraryInfo(): NativeLibraryInfo {
  const mod = loadNativeModule();
  return mod.getLibraryInfo();
}

/**
 * Get the reason native module failed to load (for debugging).
 */
export function getNativeLoadError(): string | null {
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
export function createNativeProcessor(
  sessionId: string,
  sampleRate: number = 16000
): NativeProcessorInstance {
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
export function getOrCreateNativeProcessor(sessionId: string, sampleRate: number = 16000): boolean {
  const mod = loadNativeModule();
  return mod.getOrCreateProcessor(sessionId, sampleRate);
}

/**
 * Process an audio frame using the session registry.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function processNativeFrame(
  sessionId: string,
  samples: Int16Array,
  timestampMs: number
): NativeProsodyResult | null {
  const mod = loadNativeModule();
  return mod.processSessionFrame(sessionId, samples, timestampMs);
}

/**
 * Get full prosody features for a session.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function getNativeFullFeatures(sessionId: string): NativeFullProsodyFeatures | null {
  const mod = loadNativeModule();
  return mod.getSessionFullFeatures(sessionId);
}

/**
 * Reset a native processor (keeps buffers, clears state).
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function resetNativeProcessor(sessionId: string): boolean {
  const mod = loadNativeModule();
  return mod.resetSessionProcessor(sessionId);
}

/**
 * Remove a native processor from the registry.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function removeNativeProcessor(sessionId: string): boolean {
  const mod = loadNativeModule();
  return mod.removeSessionProcessor(sessionId);
}

/**
 * Get count of active native processors.
 * Returns 0 if native module unavailable (doesn't throw).
 */
export function getActiveNativeProcessorCount(): number {
  const mod = tryLoadNativeModule();
  return mod?.getActiveProcessorCount() ?? 0;
}

/**
 * Clear all native processors (emergency cleanup).
 * Returns 0 if native module unavailable (doesn't throw).
 */
export function clearAllNativeProcessors(): number {
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
export function convertI16ToF32(samples: Int16Array): Float32Array {
  const mod = loadNativeModule();
  return mod.convertI16ToF32(samples);
}

/**
 * Compute energy in dB for audio samples.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function computeEnergyDb(samples: Float32Array): number {
  const mod = loadNativeModule();
  return mod.computeEnergyDb(samples);
}

/**
 * Check if audio contains speech.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function isSpeechNative(samples: Float32Array, thresholdDb: number = -40.0): boolean {
  const mod = loadNativeModule();
  return mod.isSpeech(samples, thresholdDb);
}

// ============================================================================
// UNIFIED ANALYZER (NATIVE ONLY - NO JS FALLBACK)
// ============================================================================

/** Unified analyzer interface wrapping native implementation */
export interface UnifiedAudioAnalyzer {
  /** Process Int16 audio samples (LiveKit format) */
  processFrame: (samples: Int16Array, timestampMs: number) => NativeProsodyResult | null;

  /** Get full prosody features for end-of-utterance analysis */
  getFullFeatures: () => NativeFullProsodyFeatures;

  /** Get processor statistics */
  getStats: () => NativeProcessorStats;

  /** Reset for reuse (keeps buffers) */
  reset: () => void;

  /** Always true - native is required */
  readonly isNative: true;

  /** Session ID */
  readonly sessionId: string;
}

/**
 * Create a unified analyzer using native Rust implementation.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 *
 * This is the recommended entry point for production use.
 */
export function createUnifiedAnalyzer(
  sessionId: string,
  sampleRate: number = 16000
): UnifiedAudioAnalyzer {
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

const unifiedAnalyzers = new Map<string, UnifiedAudioAnalyzer>();

/**
 * Get or create a unified analyzer for a session.
 * @throws {NativeAudioUnavailableError} if native module unavailable
 */
export function getSessionUnifiedAnalyzer(
  sessionId: string,
  sampleRate: number = 16000
): UnifiedAudioAnalyzer {
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
export function resetSessionUnifiedAnalyzer(sessionId: string): void {
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
export function getActiveUnifiedAnalyzerCount(): number {
  return unifiedAnalyzers.size;
}

/**
 * Clear all unified analyzers (emergency cleanup).
 */
export function clearAllUnifiedAnalyzers(): number {
  const count = unifiedAnalyzers.size;

  for (const [sessionId, analyzer] of unifiedAnalyzers) {
    analyzer.reset();
    removeNativeProcessor(sessionId);
  }

  unifiedAnalyzers.clear();
  clearAllNativeProcessors();

  return count;
}
