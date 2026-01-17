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
  readonly code = 'NATIVE_SSML_UNAVAILABLE';
  readonly buildInstructions: string;

  constructor(reason: string) {
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
// TYPES
// ============================================================================

/** SSML tag types */
export type SsmlTagType =
  | 'break'
  | 'emotion'
  | 'speed'
  | 'volume' // Cartesia Sonic-3 specific
  | 'spell' // Cartesia Sonic-3 specific
  | 'emphasis'
  | 'prosody'
  | 'phoneme'
  | 'sayAs'
  | 'speak'
  | 'unknown';

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

// ============================================================================
// NATIVE MODULE INTERFACE
// ============================================================================

/** Native module API contract */
interface FerniPerfSsmlModule {
  getLibraryInfo: () => NativeSsmlLibraryInfo;

  // SSML processing functions
  containsSsml: (text: string) => boolean;
  stripSsml: (text: string) => string;
  analyzeSsml: (text: string) => SsmlAnalysis;
  batchAnalyzeSsml: (texts: string[]) => SsmlAnalysis[];

  // Extraction functions
  extractBreaks: (text: string) => Array<{ durationMs: number; startPos: number; endPos: number }>;
  extractEmotions: (text: string) => Array<{ emotion: string; startPos: number; endPos: number }>;
  extractSpeeds: (text: string) => Array<{ speed: number; startPos: number; endPos: number }>;

  // Tag insertion
  insertBreak: (text: string, position: number, durationMs: number) => string;
  insertEmotion: (text: string, position: number, emotion: string) => string;
  wrapWithSpeed: (text: string, speedRatio: number) => string;

  // Custom patterns
  registerCustomPattern: (name: string, pattern: string) => boolean;
  matchCustomPattern: (
    name: string,
    text: string
  ) => Array<{ match: string; startPos: number; endPos: number }>;
  clearCustomPatterns: () => void;
}

// ============================================================================
// MODULE LOADING (FAIL-FAST - NO JS FALLBACK)
// ============================================================================

let nativeModule: FerniPerfSsmlModule | null = null;
let loadAttempted = false;
let loadError: string | null = null;

/**
 * Load the native Rust perf module with SSML functions.
 * THROWS if the module is unavailable - no silent fallback.
 */
function loadNativeModule(): FerniPerfSsmlModule {
  if (loadAttempted && nativeModule) {
    return nativeModule;
  }

  if (loadAttempted && loadError) {
    throw new NativeSsmlUnavailableError(loadError);
  }

  loadAttempted = true;

  try {
    const mod = require('@ferni/perf') as Record<string, unknown>;

    // Verify core SSML functions actually exist
    const requiredFunctions = [
      'containsSsml',
      'stripSsml',
      'analyzeSsml',
      'getLibraryInfo',
    ] as const;

    for (const fn of requiredFunctions) {
      if (typeof mod[fn] !== 'function') {
        loadError = `Native module loaded but SSML function '${fn}' not available`;
        log.error({ error: loadError }, '❌ Native SSML processor incomplete - NO FALLBACK');
        throw new NativeSsmlUnavailableError(loadError);
      }
    }

    // Module has all required functions - safe to cast
    nativeModule = mod as unknown as FerniPerfSsmlModule;

    const info = nativeModule.getLibraryInfo();
    log.info(
      {
        version: info.version,
        simd: info.simdAvailable,
        threads: info.parallelThreads,
      },
      '🦀 Native SSML processor loaded (optimized regex)'
    );

    return nativeModule;
  } catch (err) {
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
function tryLoadNativeModule(): FerniPerfSsmlModule | null {
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
// METRICS TRACKING
// ============================================================================

interface SsmlMetrics {
  nativeCalls: number;
  tagsProcessed: number;
  totalTimeNativeMs: number;
  lastResetTime: number;
}

const metrics: SsmlMetrics = {
  nativeCalls: 0,
  tagsProcessed: 0,
  totalTimeNativeMs: 0,
  lastResetTime: Date.now(),
};

/**
 * Get current SSML processor metrics.
 */
export function getSsmlMetrics(): SsmlMetrics & {
  avgNativeTimeMs: number;
} {
  return {
    ...metrics,
    avgNativeTimeMs: metrics.nativeCalls > 0 ? metrics.totalTimeNativeMs / metrics.nativeCalls : 0,
  };
}

/**
 * Reset SSML processor metrics.
 */
export function resetSsmlMetrics(): void {
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
export function isNativeSsmlAvailable(): boolean {
  return tryLoadNativeModule() !== null;
}

/**
 * Get native library info.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function getNativeSsmlInfo(): NativeSsmlLibraryInfo {
  const mod = loadNativeModule();
  return mod.getLibraryInfo();
}

/**
 * Get the reason native module failed to load (for debugging).
 */
export function getNativeSsmlLoadError(): string | null {
  tryLoadNativeModule(); // Ensure we've tried
  return loadError;
}

/**
 * Fast check if text contains any SSML tags.
 * Uses optimized memchr + RegexSet.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function containsSsmlNative(text: string): boolean {
  const mod = loadNativeModule();
  return mod.containsSsml(text);
}

/**
 * Strip all SSML tags from text, leaving only content.
 * Uses optimized Rust regex.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function stripSsmlNative(text: string): string {
  const mod = loadNativeModule();
  return mod.stripSsml(text);
}

/**
 * Full SSML analysis - extract all tags and compute statistics.
 * Uses optimized Rust regex.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function analyzeSsmlNative(text: string): SsmlAnalysis {
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
export function batchAnalyzeSsmlNative(texts: string[]): SsmlAnalysis[] {
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
export function extractBreaksNative(
  text: string
): Array<{ durationMs: number; startPos: number; endPos: number }> {
  const mod = loadNativeModule();
  metrics.nativeCalls++;
  return mod.extractBreaks(text);
}

/**
 * Extract all emotion tags.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function extractEmotionsNative(
  text: string
): Array<{ emotion: string; startPos: number; endPos: number }> {
  const mod = loadNativeModule();
  metrics.nativeCalls++;
  return mod.extractEmotions(text);
}

/**
 * Extract all speed tags.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function extractSpeedsNative(
  text: string
): Array<{ speed: number; startPos: number; endPos: number }> {
  const mod = loadNativeModule();
  metrics.nativeCalls++;
  return mod.extractSpeeds(text);
}

/**
 * Insert a break tag at specified position.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function insertBreakNative(text: string, position: number, durationMs: number): string {
  const mod = loadNativeModule();
  return mod.insertBreak(text, position, durationMs);
}

/**
 * Insert an emotion tag at specified position.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function insertEmotionNative(text: string, position: number, emotion: string): string {
  const mod = loadNativeModule();
  return mod.insertEmotion(text, position, emotion);
}

/**
 * Wrap text with a speed tag.
 * @throws {NativeSsmlUnavailableError} if native module unavailable
 */
export function wrapWithSpeedNative(text: string, speedRatio: number): string {
  const mod = loadNativeModule();
  return mod.wrapWithSpeed(text, speedRatio);
}

/**
 * Log SSML processor status for debugging.
 */
export function logSsmlStatus(): void {
  const available = isNativeSsmlAvailable();
  const m = getSsmlMetrics();

  if (available) {
    const info = getNativeSsmlInfo();
    log.info(
      {
        nativeAvailable: true,
        version: info.version,
        simd: info.simdAvailable,
        threads: info.parallelThreads,
        totalCalls: m.nativeCalls,
        tagsProcessed: m.tagsProcessed,
        avgTimeMs: m.avgNativeTimeMs.toFixed(2),
      },
      '🦀 Native SSML processor status'
    );
  } else {
    log.warn(
      {
        nativeAvailable: false,
        loadError,
      },
      '⚠️ Native SSML processor not available'
    );
  }
}
