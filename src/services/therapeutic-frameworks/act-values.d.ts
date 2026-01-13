/**
 * ACT Values Work
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Values clarification is the heart of ACT. This module helps users
 * identify what truly matters to them and take aligned action.
 *
 * PHILOSOPHY:
 * Values aren't goals—they're directions. You don't "achieve" being a
 * loving parent; you orient your life toward it. This shift from
 * goal-obsession to values-alignment is transformative.
 *
 * @module TherapeuticFrameworks/ACTValues
 */
import type { ACTValue, CommittedAction, ValueDomain } from './types.js';
/**
 * Questions to help surface values in different life domains.
 */
export declare const VALUES_QUESTIONS: Record<ValueDomain, string[]>;
/**
 * Domain-specific value examples to help clarify.
 */
export declare const VALUE_EXAMPLES: Record<ValueDomain, string[]>;
/**
 * Detect values being expressed in user speech.
 */
export declare function detectValuesInSpeech(text: string, context?: {
    topic?: string;
    emotion?: string;
}): DetectedValue[];
export interface DetectedValue {
    value: string;
    domain: ValueDomain;
    confidence: number;
    sourcePhrase: string;
}
/**
 * Record a value that a user has identified.
 */
export declare function recordValue(userId: string, value: string, domain: ValueDomain, options?: {
    meaning?: string;
    currentAlignment?: number;
    importance?: number;
}): ACTValue;
/**
 * Get all values for a user.
 */
export declare function getUserValues(userId: string): ACTValue[];
/**
 * Get values by domain.
 */
export declare function getValuesByDomain(userId: string, domain: ValueDomain): ACTValue[];
/**
 * Get a user's most important values.
 */
export declare function getTopValues(userId: string, limit?: number): ACTValue[];
/**
 * Record a committed action toward a value.
 */
export declare function recordCommittedAction(userId: string, valueId: string, action: string, targetDate?: Date): CommittedAction;
/**
 * Mark a committed action as complete.
 */
export declare function completeAction(userId: string, action: string, reflection?: string, alignmentRating?: number): void;
/**
 * Get pending committed actions.
 */
export declare function getPendingActions(userId: string): CommittedAction[];
/**
 * Check if a proposed action aligns with user's values.
 * Uses semantic similarity with keyword fallback for fast, accurate alignment detection.
 */
export declare function checkValuesAlignment(userId: string, proposedAction: string): ValuesAlignment;
export interface ValuesAlignment {
    hasValues: boolean;
    alignedValues: string[];
    misalignedValues: string[];
    alignmentScore: number | null;
    suggestion?: string;
}
/**
 * Get a values exploration question for a domain.
 */
export declare function getValuesQuestion(domain: ValueDomain): string;
/**
 * Get a random value example for a domain.
 */
export declare function getValueExamples(domain: ValueDomain, count?: number): string[];
/**
 * Generate a values clarification prompt.
 */
export declare function generateValuesPrompt(userId: string, context?: {
    currentTopic?: string;
    emotion?: string;
}): string;
/**
 * Build values context for the LLM.
 */
export declare function buildValuesContext(userId: string): string | null;
//# sourceMappingURL=act-values.d.ts.map