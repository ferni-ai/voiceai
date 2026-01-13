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
export type { AnalysisContext, BreathingSignals, ConcernApproach, ConcernLevel, ConcernSignal, ConcernState, ConcernType, ProsodySignals, TemporalContext, UserBaseline, } from './types.js';
export { DEFAULT_USER_BASELINE } from './types.js';
export { ABSOLUTIST_PATTERNS, ANXIETY_PATTERNS, CRISIS_PATTERNS, EXHAUSTION_PATTERNS, FRUSTRATION_PATTERNS, HOPELESSNESS_PATTERNS, LONELINESS_PATTERNS, OVERWHELM_PATTERNS, PATTERN_CHECKS, SADNESS_PATTERNS, SELF_DOUBT_PATTERNS, SOURCE_WEIGHTS, type PatternCheck, } from './patterns.js';
export { analyzeBehavioral, analyzeBreathing, analyzeLinguistic, analyzeProsody, analyzeTemporal, type BehavioralContext, type BehavioralState, type SignalAdder, } from './analyzers.js';
export { ConcernDetectionEngine, default } from './engine.js';
import { ConcernDetectionEngine } from './engine.js';
export declare function getConcernDetectionEngine(sessionId: string): ConcernDetectionEngine;
export declare function resetConcernDetectionEngine(sessionId: string): void;
export declare function resetAllConcernDetectionEngines(): void;
export declare function hasConcernDetectionEngine(sessionId: string): boolean;
export declare function getActiveConcernDetectionCount(): number;
//# sourceMappingURL=index.d.ts.map