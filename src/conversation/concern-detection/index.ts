/**
 * Concern Detection Module
 *
 * Clean architecture refactoring of the concern detection system.
 * Split into focused modules:
 * - types.ts: Type definitions
 * - patterns.ts: Linguistic patterns (regex)
 * - analyzers.ts: Individual analyzer functions
 * - engine.ts: Main detection engine
 *
 * @module @ferni/conversation/concern-detection
 */

// Types
export type {
  AnalysisContext,
  BreathingSignals,
  ConcernApproach,
  ConcernLevel,
  ConcernSignal,
  ConcernState,
  ConcernType,
  ProsodySignals,
  TemporalContext,
  UserBaseline,
} from './types.js';

export { DEFAULT_USER_BASELINE } from './types.js';

// Patterns
export {
  ABSOLUTIST_PATTERNS,
  ANXIETY_PATTERNS,
  CRISIS_PATTERNS,
  EXHAUSTION_PATTERNS,
  FRUSTRATION_PATTERNS,
  HOPELESSNESS_PATTERNS,
  LONELINESS_PATTERNS,
  OVERWHELM_PATTERNS,
  PATTERN_CHECKS,
  SADNESS_PATTERNS,
  SELF_DOUBT_PATTERNS,
  SOURCE_WEIGHTS,
  type PatternCheck,
} from './patterns.js';

// Analyzers
export {
  analyzeBehavioral,
  analyzeBreathing,
  analyzeLinguistic,
  analyzeProsody,
  analyzeTemporal,
  type BehavioralContext,
  type BehavioralState,
  type SignalAdder,
} from './analyzers.js';

// Engine
export { ConcernDetectionEngine, default } from './engine.js';

// ============================================================================
// SESSION REGISTRY
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';
import { ConcernDetectionEngine } from './engine.js';

/**
 * Session registry for concern detection engines.
 * Provides automatic cleanup and lifecycle management.
 */
const concernDetectionRegistry = createSessionRegistry(
  (sessionId: string) => new ConcernDetectionEngine(),
  {
    name: 'ConcernDetection',
    cleanup: (engine) => engine.reset(),
    verbose: false,
  }
);

// Register globally for coordinated session cleanup
registerGlobalRegistry(concernDetectionRegistry);

export function getConcernDetectionEngine(sessionId: string): ConcernDetectionEngine {
  return concernDetectionRegistry.get(sessionId);
}

export function resetConcernDetectionEngine(sessionId: string): void {
  concernDetectionRegistry.reset(sessionId);
}

export function resetAllConcernDetectionEngines(): void {
  concernDetectionRegistry.resetAll();
}

export function hasConcernDetectionEngine(sessionId: string): boolean {
  return concernDetectionRegistry.has(sessionId);
}

export function getActiveConcernDetectionCount(): number {
  return concernDetectionRegistry.getActiveCount();
}
