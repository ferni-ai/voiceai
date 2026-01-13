/**
 * Communication Pattern Extractor
 *
 * Phase 2: Personal Memory Integration
 *
 * Analyzes conversation text to detect communication patterns:
 * - Phrase patterns: How user expresses distress, deflection, etc.
 * - Temporal patterns: Late-night conversations, time-sensitive topics
 * - Interaction patterns: Response styles, topic transitions
 *
 * @module CommunicationPatternExtractor
 */
import type { CommunicationPatterns } from '../user-trigger-profile.types.js';
export interface CommunicationPatternExtractionOptions {
    /** Minimum confidence to include patterns (0-1) */
    minConfidence?: number;
    /** Context time for temporal pattern matching */
    contextTime?: Date;
    /** Merge with existing patterns */
    existingPatterns?: CommunicationPatterns;
}
export interface CommunicationPatternExtractionResult {
    patterns: CommunicationPatterns;
    detectedCategories: string[];
    processingTimeMs: number;
}
/**
 * Extract communication patterns from conversation text
 */
export declare function extractCommunicationPatterns(text: string, options?: CommunicationPatternExtractionOptions): CommunicationPatternExtractionResult;
/**
 * Detect if text contains distress signals
 */
export declare function hasDistressSignals(text: string): boolean;
/**
 * Detect if text contains deflection signals
 */
export declare function hasDeflectionSignals(text: string): boolean;
/**
 * Get the dominant communication pattern category
 */
export declare function getDominantPattern(patterns: CommunicationPatterns): {
    category: string;
    weight: number;
} | null;
declare const _default: {
    extractCommunicationPatterns: typeof extractCommunicationPatterns;
    hasDistressSignals: typeof hasDistressSignals;
    hasDeflectionSignals: typeof hasDeflectionSignals;
    getDominantPattern: typeof getDominantPattern;
};
export default _default;
//# sourceMappingURL=communication-pattern-extractor.d.ts.map