/**
 * Tool Call Sanitizer Module
 *
 * Refactored from monolithic tool-call-sanitizer.ts into focused modules.
 * This index provides backward-compatible exports.
 *
 * Architecture:
 * - config/tool-patterns.json - Single source of truth for tool patterns
 * - types.ts - Shared type definitions
 * - detectors/ - Leakage detection and pattern loading
 * - executors/ - Deduplication and retry analysis
 * - streams/ - Transform streams for real-time sanitization
 *
 * @module agents/shared/sanitizer
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  ToolDomain,
  ToolPatternsConfig,
  LeakageDetection,
  LeakagePatternType,
  JsonFunctionCall,
  ToolExecutionResult,
  RetryAnalysis,
  DedupEntry,
  SanitizerStreamOptions,
  AcknowledgmentContext,
} from './types.js';

// ============================================================================
// DETECTOR EXPORTS (from detectors/)
// ============================================================================

export {
  // Pattern loading
  getAllToolPatterns,
  getParamPatterns,
  getTeamMemberNames,
  getSlowTools,
  getDomainPatterns,
  isDomainCritical,
  getDomainNames,
  findDomainForPattern,
  getToolPatternsConfig,
  clearPatternsCache,
  // Leakage detection
  detectsFunctionCallLeakage,
  getReplacementText,
  looksLikeJsonFunctionCall,
  // Native acceleration (Rust simd-json + Aho-Corasick)
  initializeNativeAcceleration,
  isNativeAccelerationActive,
} from './detectors/index.js';

// ============================================================================
// EXECUTOR EXPORTS (from executors/)
// ============================================================================

export {
  // Deduplication
  markToolExecutedBySemanticRouter,
  wasToolExecutedBySemanticRouter,
  clearToolDeduplicationForSession,
  getDedupStats,
  clearAllDedupCache,
  // Retry analysis
  analyzeForRetry,
  clearRetryCounter,
  getRetryCount,
} from './executors/index.js';

// ============================================================================
// STREAM EXPORTS (from streams/)
// ============================================================================

export {
  createSanitizerTransformStream,
  createSanitizerWithMusicFallback,
  stripGuidanceBlocks,
  containsGuidanceBlocks,
  createGuidanceStripStream,
  type AnyTransformStream,
} from './streams/index.js';

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

import { createLogger } from '../../../utils/safe-logger.js';
import { detectsFunctionCallLeakage, getReplacementText, containsToolCallLeakage } from './detectors/index.js';

const log = createLogger({ module: 'tool-call-sanitizer' });

/**
 * Sanitize tool call leakage from text.
 * Returns replacement text if leakage detected, otherwise original text.
 *
 * @param text - Raw text from LLM
 * @returns Sanitized text safe for TTS
 */
export function sanitizeToolCallLeakage(text: string): string {
  const detection = detectsFunctionCallLeakage(text);

  if (detection.detected) {
    log.warn(
      {
        originalText: text,
        toolName: detection.toolName,
        parameter: detection.parameter,
        value: detection.value,
        pattern: detection.pattern,
      },
      '🚨 TOOL CALL LEAKAGE DETECTED - LLM output function call text instead of calling function'
    );

    return getReplacementText(detection);
  }

  return text;
}

/**
 * Quick check for function call leakage in a complete string.
 * Use this for non-streaming contexts.
 */
export { containsToolCallLeakage } from './detectors/index.js';
