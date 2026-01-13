/**
 * Significant Date Extractor
 *
 * Phase 2: Personal Memory Integration
 *
 * Extracts significant dates from conversation text. These include:
 * - Birthdays (user's or loved ones)
 * - Anniversaries (wedding, dating, work)
 * - Loss dates (death of loved ones)
 * - Milestones (graduations, promotions)
 * - Medical events (diagnoses, surgeries)
 * - Celebrations (recurring positive events)
 *
 * Uses pattern matching for common date expressions and context
 * analysis to determine emotional significance.
 *
 * @module SignificantDateExtractor
 */
import type { SignificantDate } from '../user-trigger-profile.types.js';
export interface DateExtractionOptions {
    /** Minimum confidence to include in results (0-1) */
    minConfidence?: number;
    /** Source of the extraction */
    source?: 'explicit' | 'inferred';
    /** Conversation ID for tracking */
    conversationId?: string;
}
export interface DateExtractionResult {
    dates: SignificantDate[];
    processingTimeMs: number;
}
/**
 * Extract significant dates from conversation text
 */
export declare function extractSignificantDates(text: string, options?: DateExtractionOptions): DateExtractionResult;
/**
 * Check if text contains any date-related mentions worth extracting
 */
export declare function hasDateMentions(text: string): boolean;
/**
 * Extract a year from text if present
 */
export declare function extractYear(text: string): number | null;
declare const _default: {
    extractSignificantDates: typeof extractSignificantDates;
    hasDateMentions: typeof hasDateMentions;
    extractYear: typeof extractYear;
};
export default _default;
//# sourceMappingURL=significant-date-extractor.d.ts.map