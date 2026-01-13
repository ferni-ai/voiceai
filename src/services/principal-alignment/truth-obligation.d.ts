/**
 * Truth Obligation System
 *
 * > "A friend who only challenges you after 'earning the right' isn't a friend—they're a politician."
 *
 * This system detects when we have a moral obligation to deliver difficult truths,
 * even if it might hurt the relationship. A truly principal-aligned agent sometimes
 * needs to say things the user doesn't want to hear.
 *
 * Key insight: Sycophancy dressed as "building rapport" is not principal-aligned.
 *
 * @module @ferni/principal-alignment/truth-obligation
 */
import type { TruthCategory, TruthObligationResult, TruthSeverity } from './types.js';
/**
 * Patterns indicating user is seeking validation for a bad decision
 */
declare const VALIDATION_SEEKING_PATTERNS: Array<{
    pattern: RegExp;
    category: TruthCategory;
    severity: TruthSeverity;
}>;
/**
 * Suggested framings for different truth categories
 */
declare const TRUTH_FRAMINGS: Record<TruthCategory, string[]>;
/**
 * Analyze user message for truth obligation triggers
 */
export declare function detectTruthObligation(userMessage: string, context?: {
    previousMessages?: string[];
    statedValues?: string[];
    relationshipStage?: string;
    recentTopics?: string[];
    emotionalState?: string;
}): TruthObligationResult;
/**
 * Record a truth obligation for tracking
 */
export declare function recordTruthObligation(sessionId: string, result: TruthObligationResult): void;
/**
 * Get truth obligations for session
 */
export declare function getSessionTruthObligations(sessionId: string): TruthObligationResult[];
/**
 * Clear session data
 */
export declare function clearSessionTruthObligations(sessionId: string): void;
export { TRUTH_FRAMINGS, VALIDATION_SEEKING_PATTERNS };
//# sourceMappingURL=truth-obligation.d.ts.map