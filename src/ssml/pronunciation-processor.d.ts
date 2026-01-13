/**
 * Optimized Pronunciation Processor
 *
 * Performance-optimized pronunciation matching using:
 * - Category-based grouping for quick skipping
 * - Character presence checks before pattern matching
 * - Pre-compiled regex patterns (patterns are already compiled in constants)
 *
 * With 233 patterns, naive iteration is O(n*m) per call.
 * This optimization reduces average-case complexity by skipping
 * entire categories when their required characters aren't present.
 *
 * @module ssml/pronunciation-processor
 */
import type { PronunciationEntry } from './types.js';
/**
 * Pattern categories based on what characters they require to match.
 * If a text doesn't contain the required characters, the entire category is skipped.
 */
export interface PatternCategory {
    /** Category name for debugging */
    name: string;
    /** Quick check function - if false, skip all patterns in category */
    quickCheck: (text: string) => boolean;
    /** Patterns in this category */
    patterns: PronunciationEntry[];
}
/**
 * Apply pronunciation dictionary to text (optimized)
 *
 * This is the performance-optimized version that:
 * 1. Groups patterns by category
 * 2. Skips entire categories when their required characters aren't present
 * 3. Reduces average-case complexity significantly for typical text
 *
 * @param text - Text to process
 * @returns Text with pronunciations applied and wrapped in protection markers
 */
export declare function applyPronunciationsOptimized(text: string): string;
/**
 * Get statistics about pattern categorization
 * Useful for debugging and optimization tuning
 */
export declare function getCategoryStats(): Array<{
    name: string;
    count: number;
}>;
/**
 * Estimate how many patterns will be checked for given text
 */
export declare function estimatePatternChecks(text: string): {
    total: number;
    checked: number;
    skipped: number;
    categories: Array<{
        name: string;
        checked: boolean;
        count: number;
    }>;
};
/**
 * Reset categorization cache (for testing)
 */
export declare function resetPronunciationCache(): void;
//# sourceMappingURL=pronunciation-processor.d.ts.map