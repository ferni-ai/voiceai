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

/**
 * @deprecated Use detectsFunctionCallLeakage instead
 */
export { detectsFunctionCallLeakage as sanitizeToolCallLeakage } from './detectors/index.js';
