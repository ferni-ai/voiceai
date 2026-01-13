/**
 * Unified Concern Detection System
 *
 * ⚠️ This file has been refactored for clean architecture.
 * The implementation is now in the concern-detection/ directory.
 *
 * This file re-exports everything for backward compatibility.
 *
 * @see concern-detection/index.ts for the new module structure
 * @module @ferni/concern-detection
 */
// Re-export everything from the new module
export { 
// Patterns
ABSOLUTIST_PATTERNS, ANXIETY_PATTERNS, CRISIS_PATTERNS, EXHAUSTION_PATTERNS, FRUSTRATION_PATTERNS, HOPELESSNESS_PATTERNS, LONELINESS_PATTERNS, OVERWHELM_PATTERNS, SADNESS_PATTERNS, SELF_DOUBT_PATTERNS, 
// Engine and registry
ConcernDetectionEngine, getActiveConcernDetectionCount, getConcernDetectionEngine, hasConcernDetectionEngine, resetAllConcernDetectionEngines, resetConcernDetectionEngine, default, } from './concern-detection/index.js';
//# sourceMappingURL=concern-detection.js.map