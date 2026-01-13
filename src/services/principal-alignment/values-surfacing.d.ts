/**
 * Proactive Values Surfacing
 *
 * > "A truly principal-aligned agent proactively surfaces values conflicts, not just when asked."
 *
 * This system monitors for situations where a user's stated values conflict with their
 * proposed actions or decisions, and surfaces these conflicts before they become problems.
 *
 * Key insight: Users don't always see their own contradictions. A good coach helps them see.
 *
 * @module @ferni/principal-alignment/values-surfacing
 */
import type { ValuesAlignmentResult } from './types.js';
/**
 * Categories of values and their associated keywords
 */
declare const VALUE_CATEGORIES: Record<string, string[]>;
/**
 * Actions that typically conflict with specific values
 */
declare const VALUE_CONFLICTS: Record<string, Array<{
    pattern: RegExp;
    description: string;
}>>;
interface UserValuesProfile {
    userId: string;
    statedValues: Array<{
        value: string;
        category: string;
        confidence: number;
        lastMentioned: number;
    }>;
    conflictsDetected: Array<{
        value: string;
        action: string;
        timestamp: number;
        surfaced: boolean;
        userResponse?: 'acknowledged' | 'dismissed' | 'thanked';
    }>;
    lastUpdated: number;
}
/**
 * Extract values from user message
 */
export declare function extractValues(userId: string, userMessage: string): string[];
/**
 * Analyze user message for values conflicts
 */
export declare function analyzeValuesAlignment(userId: string, userMessage: string, context?: {
    currentTopic?: string;
    statedValues?: string[];
}): ValuesAlignmentResult;
/**
 * Get user's values profile
 */
export declare function getUserValuesProfile(userId: string): UserValuesProfile | null;
/**
 * Get user's top stated values
 */
export declare function getTopValues(userId: string, count?: number): string[];
/**
 * Set user's stated values (from external source like onboarding)
 */
export declare function setUserValues(userId: string, values: string[]): void;
/**
 * Clear user data
 */
export declare function clearUserValuesData(userId: string): void;
export { VALUE_CATEGORIES, VALUE_CONFLICTS };
//# sourceMappingURL=values-surfacing.d.ts.map