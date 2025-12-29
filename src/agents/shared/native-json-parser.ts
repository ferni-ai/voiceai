/**
 * Native JSON Parser - SIMD-accelerated JSON function call detection
 *
 * Uses the Rust ferni-perf crate for simd-json accelerated parsing,
 * with graceful fallback to the JavaScript implementation.
 *
 * Performance characteristics:
 * - Rust simd-json: 2-5x faster than JSON.parse
 * - memchr for fast byte pattern searching
 * - Pre-compiled regex patterns
 * - JS fallback: Works without native module (development/CI)
 *
 * This is used in the TTS stream hot path to detect and extract
 * JSON function calls that the LLM outputs.
 *
 * @module agents/shared/native-json-parser
 */

import { createRequire } from 'module';
import { createLogger } from '../../utils/safe-logger.js';

// Create require for loading native modules in ESM context
const require = createRequire(import.meta.url);

const log = createLogger({ module: 'NativeJsonParser' });

// ============================================================================
// TYPES
// ============================================================================

/** Parsed function call from TTS stream */
export interface ParsedFunctionCall {
  /** Tool name */
  fnName: string;
  /** Arguments as JSON string */
  argsJson: string;
  /** Start position in original text */
  startPos: number;
  /** End position in original text */
  endPos: number;
}

/** Result of scanning text for function calls */
export interface ScanResult {
  /** All detected function calls */
  calls: ParsedFunctionCall[];
  /** Text with function calls removed */
  cleanText: string;
  /** Whether any function calls were found */
  hasCalls: boolean;
}

/** Library info from native module */
export interface NativeJsonLibraryInfo {
  version: string;
  simdAvailable: boolean;
  parallelThreads: number;
}

// ============================================================================
// NATIVE MODULE INTERFACE
// ============================================================================

/** Aho-Corasick pattern match result */
export interface AhoCorasickMatch {
  patternIdx: number;
  start: number;
  end: number;
  matchedText: string;
}

/** Aho-Corasick scan result */
export interface AhoCorasickScanResult {
  matches: AhoCorasickMatch[];
  hasMatches: boolean;
  matchCount: number;
}

/** Native module API contract */
interface FerniPerfJsonModule {
  getLibraryInfo: () => NativeJsonLibraryInfo;

  // JSON parsing functions
  likelyContainsFunctionCall: (text: string) => boolean;
  extractFunctionCalls: (text: string) => ScanResult;
  parseFunctionCall: (jsonStr: string) => ParsedFunctionCall | null;
  isValidJson: (jsonStr: string) => boolean;
  parseJsonFast: (jsonStr: string) => string | null;

  // Tool name registration
  registerToolNames: (names: string[]) => void;
  clearToolNames: () => void;
  isKnownTool: (name: string) => boolean;
  getToolCount: () => number;

  // Aho-Corasick multi-pattern matching (O(n) for all patterns)
  buildToolNameAutomaton: (patterns: string[]) => boolean;
  scanForToolNames: (text: string) => AhoCorasickScanResult;
  containsAnyToolName: (text: string) => boolean;
  getToolNameByIndex: (index: number) => string | null;
  getToolNamePatternCount: () => number;
  clearToolNameAutomaton: () => void;

  // Class-based Aho-Corasick API (for independent matchers)
  AhoCorasickMatcher: new (patterns: string[]) => NativeAhoCorasickMatcher;
}

/** Native Aho-Corasick matcher instance */
interface NativeAhoCorasickMatcher {
  scan: (text: string) => AhoCorasickScanResult;
  containsAny: (text: string) => boolean;
  getPattern: (index: number) => string | null;
  patternCount: () => number;
  replaceAll: (text: string, replacements: string[]) => string;
}

// ============================================================================
// MODULE LOADING (GRACEFUL FALLBACK)
// ============================================================================

let nativeModule: FerniPerfJsonModule | null = null;
let loadAttempted = false;
let loadError: string | null = null;

/**
 * Attempt to load the native Rust perf module.
 * Returns null if not available (graceful degradation).
 */
function loadNativeModule(): FerniPerfJsonModule | null {
  if (loadAttempted) {
    return nativeModule;
  }

  loadAttempted = true;

  try {
    // Try to load the native module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require('@ferni/perf') as FerniPerfJsonModule;

    const info = nativeModule.getLibraryInfo();
    log.info(
      {
        version: info.version,
        simd: info.simdAvailable,
        threads: info.parallelThreads,
      },
      '🦀 Native JSON parser loaded (simd-json accelerated)'
    );

    return nativeModule;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    log.debug({ error: loadError }, 'Native JSON parser not available, using JS fallback');
    return null;
  }
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

interface JsonParserMetrics {
  nativeCalls: number;
  jsFallbackCalls: number;
  functionCallsDetected: number;
  totalTimeNativeMs: number;
  totalTimeJsMs: number;
  lastResetTime: number;
}

const metrics: JsonParserMetrics = {
  nativeCalls: 0,
  jsFallbackCalls: 0,
  functionCallsDetected: 0,
  totalTimeNativeMs: 0,
  totalTimeJsMs: 0,
  lastResetTime: Date.now(),
};

/**
 * Get current JSON parser metrics.
 */
export function getJsonParserMetrics(): JsonParserMetrics & {
  nativePercent: number;
  avgNativeTimeMs: number;
  avgJsTimeMs: number;
} {
  const total = metrics.nativeCalls + metrics.jsFallbackCalls;
  return {
    ...metrics,
    nativePercent: total > 0 ? (metrics.nativeCalls / total) * 100 : 0,
    avgNativeTimeMs: metrics.nativeCalls > 0 ? metrics.totalTimeNativeMs / metrics.nativeCalls : 0,
    avgJsTimeMs: metrics.jsFallbackCalls > 0 ? metrics.totalTimeJsMs / metrics.jsFallbackCalls : 0,
  };
}

/**
 * Reset JSON parser metrics.
 */
export function resetJsonParserMetrics(): void {
  metrics.nativeCalls = 0;
  metrics.jsFallbackCalls = 0;
  metrics.functionCallsDetected = 0;
  metrics.totalTimeNativeMs = 0;
  metrics.totalTimeJsMs = 0;
  metrics.lastResetTime = Date.now();
}

// ============================================================================
// JS FALLBACK IMPLEMENTATION
// ============================================================================

/**
 * Regex for JSON function call detection (JS fallback).
 * Format: {"fn":"toolName","args":{...}}
 */
const JSON_FUNCTION_REGEX = /\{\s*"fn"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*\{[^}]*\}\s*\}/g;

/**
 * Fast check if text likely contains a function call (JS fallback).
 */
function likelyContainsFunctionCallJs(text: string): boolean {
  // Fast path: check for opening brace and "fn" pattern
  return text.includes('{') && text.includes('"fn"');
}

/**
 * Extract function calls from text (JS fallback).
 */
function extractFunctionCallsJs(text: string): ScanResult {
  if (!likelyContainsFunctionCallJs(text)) {
    return {
      calls: [],
      cleanText: text,
      hasCalls: false,
    };
  }

  const calls: ParsedFunctionCall[] = [];
  let cleanText = text;
  let offset = 0;

  // Reset regex state
  JSON_FUNCTION_REGEX.lastIndex = 0;

  let match;
  while ((match = JSON_FUNCTION_REGEX.exec(text)) !== null) {
    const matchedText = match[0];
    const start = match.index;
    const end = start + matchedText.length;

    try {
      const parsed = JSON.parse(matchedText) as { fn: string; args: Record<string, unknown> };

      if (parsed.fn && parsed.args) {
        calls.push({
          fnName: parsed.fn,
          argsJson: JSON.stringify(parsed.args),
          startPos: start,
          endPos: end,
        });

        // Remove from clean text
        const adjustedStart = start + offset;
        const adjustedEnd = end + offset;

        if (adjustedStart < cleanText.length && adjustedEnd <= cleanText.length) {
          cleanText = cleanText.slice(0, adjustedStart) + cleanText.slice(adjustedEnd);
          offset -= matchedText.length;
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return {
    calls,
    cleanText: cleanText.trim(),
    hasCalls: calls.length > 0,
  };
}

/**
 * Parse a single JSON function call (JS fallback).
 */
function parseFunctionCallJs(jsonStr: string): ParsedFunctionCall | null {
  if (!likelyContainsFunctionCallJs(jsonStr)) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonStr) as { fn?: string; args?: Record<string, unknown> };

    if (!parsed.fn || !parsed.args) {
      return null;
    }

    return {
      fnName: parsed.fn,
      argsJson: JSON.stringify(parsed.args),
      startPos: 0,
      endPos: jsonStr.length,
    };
  } catch {
    return null;
  }
}

/**
 * Validate JSON string (JS fallback).
 */
function isValidJsonJs(jsonStr: string): boolean {
  try {
    JSON.parse(jsonStr);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if native JSON parser is available.
 */
export function isNativeJsonParserAvailable(): boolean {
  return loadNativeModule() !== null;
}

/**
 * Get native library info if available.
 */
export function getNativeJsonInfo(): NativeJsonLibraryInfo | null {
  const mod = loadNativeModule();
  return mod?.getLibraryInfo() ?? null;
}

/**
 * Get the reason native module failed to load (for debugging).
 */
export function getNativeJsonLoadError(): string | null {
  loadNativeModule(); // Ensure we've tried
  return loadError;
}

/**
 * Fast check if text likely contains a function call.
 * Uses native memchr for fast byte searching when available.
 *
 * @param text - Text to check
 * @returns true if likely contains function call
 */
export function likelyContainsFunctionCall(text: string): boolean {
  const mod = loadNativeModule();

  if (mod) {
    return mod.likelyContainsFunctionCall(text);
  }

  return likelyContainsFunctionCallJs(text);
}

/**
 * Extract function calls from text using SIMD-accelerated parsing.
 * Falls back to JS if native unavailable.
 *
 * @param text - Text to scan for function calls
 * @returns Scan result with calls and clean text
 */
export function extractFunctionCalls(text: string): ScanResult {
  const start = performance.now();
  const mod = loadNativeModule();

  if (mod) {
    const result = mod.extractFunctionCalls(text);
    const elapsed = performance.now() - start;

    metrics.nativeCalls++;
    metrics.totalTimeNativeMs += elapsed;
    metrics.functionCallsDetected += result.calls.length;

    return result;
  }

  // JS fallback
  const result = extractFunctionCallsJs(text);
  const elapsed = performance.now() - start;

  metrics.jsFallbackCalls++;
  metrics.totalTimeJsMs += elapsed;
  metrics.functionCallsDetected += result.calls.length;

  return result;
}

/**
 * Parse a single JSON function call.
 * Falls back to JS if native unavailable.
 *
 * Expected format: {"fn":"toolName","args":{...}}
 *
 * @param jsonStr - JSON string to parse
 * @returns Parsed function call or null
 */
export function parseFunctionCall(jsonStr: string): ParsedFunctionCall | null {
  const mod = loadNativeModule();

  if (mod) {
    metrics.nativeCalls++;
    return mod.parseFunctionCall(jsonStr);
  }

  metrics.jsFallbackCalls++;
  return parseFunctionCallJs(jsonStr);
}

/**
 * Validate JSON string quickly.
 * Uses simd-json for fast validation when available.
 *
 * @param jsonStr - JSON string to validate
 * @returns true if valid JSON
 */
export function isValidJson(jsonStr: string): boolean {
  const mod = loadNativeModule();

  if (mod) {
    return mod.isValidJson(jsonStr);
  }

  return isValidJsonJs(jsonStr);
}

/**
 * Parse JSON using SIMD-accelerated simd-json.
 * Falls back to standard JSON.parse if native unavailable.
 *
 * @param jsonStr - JSON string to parse
 * @returns Parsed value or null if invalid
 */
export function parseJsonFast<T = unknown>(jsonStr: string): T | null {
  const mod = loadNativeModule();

  if (mod) {
    const result = mod.parseJsonFast(jsonStr);
    if (result) {
      return JSON.parse(result) as T;
    }
    return null;
  }

  // JS fallback
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// TOOL NAME REGISTRATION (for faster detection)
// ============================================================================

const jsKnownTools = new Set<string>();

/**
 * Register a known tool name for faster detection.
 *
 * @param name - Tool name to register
 */
export function registerToolName(name: string): void {
  const mod = loadNativeModule();

  if (mod) {
    mod.registerToolNames([name]);
  }

  jsKnownTools.add(name.toLowerCase());
}

/**
 * Register multiple tool names at once.
 *
 * @param names - Array of tool names
 */
export function registerToolNames(names: string[]): void {
  const mod = loadNativeModule();

  if (mod) {
    mod.registerToolNames(names);
  }

  for (const name of names) {
    jsKnownTools.add(name.toLowerCase());
  }
}

/**
 * Clear all registered tool names.
 */
export function clearToolNames(): void {
  const mod = loadNativeModule();

  if (mod) {
    mod.clearToolNames();
  }

  jsKnownTools.clear();
}

/**
 * Check if a tool name is registered.
 *
 * @param name - Tool name to check
 * @returns true if registered
 */
export function isKnownTool(name: string): boolean {
  const mod = loadNativeModule();

  if (mod) {
    return mod.isKnownTool(name);
  }

  return jsKnownTools.has(name.toLowerCase());
}

/**
 * Get count of registered tools.
 */
export function getToolCount(): number {
  const mod = loadNativeModule();

  if (mod) {
    return mod.getToolCount();
  }

  return jsKnownTools.size;
}

/**
 * Log JSON parser status for debugging.
 */
export function logJsonParserStatus(): void {
  const info = getNativeJsonInfo();
  const m = getJsonParserMetrics();

  log.info(
    {
      nativeAvailable: info !== null,
      version: info?.version ?? 'N/A',
      simd: info?.simdAvailable ?? false,
      registeredTools: getToolCount(),
      nativePercent: m.nativePercent.toFixed(1),
      totalCalls: m.nativeCalls + m.jsFallbackCalls,
      functionsDetected: m.functionCallsDetected,
      avgSpeedup:
        m.avgJsTimeMs > 0 && m.avgNativeTimeMs > 0
          ? (m.avgJsTimeMs / m.avgNativeTimeMs).toFixed(1)
          : 'N/A',
    },
    '🦀 Native JSON parser status'
  );
}

// ============================================================================
// AHO-CORASICK MULTI-PATTERN MATCHING (O(n) for all patterns)
// ============================================================================

// JS fallback: Use simple Set-based membership check
// This is O(n×p) but works when native is unavailable
const jsToolPatterns: string[] = [];

/**
 * Build the Aho-Corasick automaton for tool name detection.
 * This should be called once at startup with all tool name patterns.
 *
 * @param patterns - Array of tool name patterns to match
 * @returns true if automaton was built successfully
 */
export function buildToolNameAutomaton(patterns: string[]): boolean {
  const mod = loadNativeModule();

  // Always keep JS fallback patterns
  jsToolPatterns.length = 0;
  jsToolPatterns.push(...patterns.map((p) => p.toLowerCase()));

  if (mod) {
    try {
      const success = mod.buildToolNameAutomaton(patterns);
      if (success) {
        log.info(
          { patternCount: patterns.length },
          '🦀 Aho-Corasick automaton built for tool name detection'
        );
      }
      return success;
    } catch (err) {
      log.warn({ error: String(err) }, 'Failed to build native Aho-Corasick automaton');
      return false;
    }
  }

  log.debug({ patternCount: patterns.length }, 'Using JS fallback for tool name matching');
  return true;
}

/**
 * Scan text for tool name patterns using Aho-Corasick.
 * Returns all matches in O(n+m+z) time where:
 * - n = text length
 * - m = total pattern length
 * - z = number of matches
 *
 * @param text - Text to scan
 * @returns Scan result with all matches
 */
export function scanForToolNames(text: string): AhoCorasickScanResult {
  const mod = loadNativeModule();

  if (mod) {
    try {
      return mod.scanForToolNames(text);
    } catch {
      // Fall through to JS
    }
  }

  // JS fallback: O(n×p) simple search
  const lowerText = text.toLowerCase();
  const matches: AhoCorasickMatch[] = [];

  for (let i = 0; i < jsToolPatterns.length; i++) {
    const pattern = jsToolPatterns[i];
    let searchIdx = 0;

    while (searchIdx < lowerText.length) {
      const foundIdx = lowerText.indexOf(pattern, searchIdx);
      if (foundIdx === -1) break;

      matches.push({
        patternIdx: i,
        start: foundIdx,
        end: foundIdx + pattern.length,
        matchedText: text.slice(foundIdx, foundIdx + pattern.length),
      });

      searchIdx = foundIdx + 1;
    }
  }

  return {
    matches,
    hasMatches: matches.length > 0,
    matchCount: matches.length,
  };
}

/**
 * Fast check if text contains any tool name pattern.
 * Uses Aho-Corasick for O(n) check across all patterns.
 *
 * @param text - Text to check
 * @returns true if any pattern matches
 */
export function containsAnyToolName(text: string): boolean {
  const mod = loadNativeModule();

  if (mod) {
    try {
      return mod.containsAnyToolName(text);
    } catch {
      // Fall through to JS
    }
  }

  // JS fallback
  const lowerText = text.toLowerCase();
  return jsToolPatterns.some((p) => lowerText.includes(p));
}

/**
 * Get the pattern at a specific index (for resolving match results).
 *
 * @param index - Pattern index from match result
 * @returns Pattern string or null if not found
 */
export function getToolNameByIndex(index: number): string | null {
  const mod = loadNativeModule();

  if (mod) {
    return mod.getToolNameByIndex(index);
  }

  return jsToolPatterns[index] ?? null;
}

/**
 * Get the number of patterns in the automaton.
 */
export function getToolNamePatternCount(): number {
  const mod = loadNativeModule();

  if (mod) {
    return mod.getToolNamePatternCount();
  }

  return jsToolPatterns.length;
}

/**
 * Clear the tool name automaton.
 */
export function clearToolNameAutomaton(): void {
  const mod = loadNativeModule();

  if (mod) {
    mod.clearToolNameAutomaton();
  }

  jsToolPatterns.length = 0;
}

/**
 * Check if Aho-Corasick native acceleration is available.
 */
export function isAhoCorasickAvailable(): boolean {
  const mod = loadNativeModule();
  return mod !== null;
}
