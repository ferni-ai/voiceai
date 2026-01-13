/**
 * Unified Moment Detection - Single Source of Truth
 *
 * > "We hear what you're not saying."
 *
 * This module consolidates all moment detection into a single system.
 * It serves multiple consumers:
 * - Relationship Memory (significant shared moments)
 * - Meaningful Silence (memorable details for callbacks)
 * - Predictive Intelligence (pattern detection)
 * - Trust Systems (vulnerability, breakthroughs)
 *
 * All moment detection should go through this module to ensure:
 * - Consistent detection patterns
 * - No duplicate detection logic
 * - Single place to improve detection
 * - Unified logging and analytics
 */
import type { SharedMomentType } from './relationship-memory/types.js';
/**
 * A detected moment with full context
 */
export interface UnifiedMoment {
    /** Unique ID for this detection */
    id: string;
    /** High-level category */
    category: MomentCategory;
    /** Specific type for Relationship Memory */
    type: SharedMomentType;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Human-readable summary */
    summary: string;
    /** The phrase that triggered detection */
    triggerPhrase?: string;
    /** Inferred topic */
    topic?: string;
    /** Significance score (0-1) */
    significance: number;
    /** Tags for categorization */
    tags: string[];
    /** Memorable details for callbacks (names, family, events) */
    memorableDetails: string[];
    /** Original user message */
    originalMessage: string;
    /** Detection timestamp */
    detectedAt: Date;
}
export type MomentCategory = 'emotional' | 'cognitive' | 'relational' | 'behavioral' | 'life_event';
/**
 * Context for moment detection
 */
export interface MomentDetectionContext {
    /** User's message */
    userMessage: string;
    /** AI's response (if available) */
    aiResponse?: string;
    /** Current topic being discussed */
    topic?: string;
    /** User's detected emotional state */
    emotionalState?: string;
    /** Session number */
    sessionNumber: number;
    /** Has user shared vulnerability before? */
    hasSharedVulnerabilityBefore: boolean;
    /** User's name if known */
    userName?: string;
}
/**
 * Result of unified moment detection
 */
export interface MomentDetectionResult {
    /** All detected moments */
    moments: UnifiedMoment[];
    /** Primary moment (highest significance) */
    primaryMoment: UnifiedMoment | null;
    /** Memorable details for silence/callbacks */
    memorableDetails: string[];
    /** Should this moment be acknowledged? */
    shouldAcknowledge: boolean;
    /** Suggested acknowledgment phrase */
    acknowledgmentSuggestion?: string;
}
/**
 * Unified moment detection - single entry point for all moment detection
 */
export declare function detectMomentsUnified(context: MomentDetectionContext): MomentDetectionResult;
/**
 * Backward-compatible wrapper for moment-detection.ts
 */
export declare function detectMoments(context: MomentDetectionContext): UnifiedMoment[];
/**
 * Backward-compatible wrapper for meaningful-silence.ts
 */
export declare function extractMemorableMoments(message: string): string[];
declare const _default: {
    detectMomentsUnified: typeof detectMomentsUnified;
    detectMoments: typeof detectMoments;
    extractMemorableMoments: typeof extractMemorableMoments;
};
export default _default;
//# sourceMappingURL=unified-moment-detection.d.ts.map