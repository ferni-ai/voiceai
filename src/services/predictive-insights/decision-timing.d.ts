/**
 * Decision Timing Optimizer
 *
 * > "You've been mulling over the job change for 6 weeks now.
 * > Your best decisions historically happen after you sleep on them twice.
 * > This one might be ready."
 *
 * Tracks decision incubation periods to predict when
 * a decision is "ready" to be made.
 *
 * Signals:
 * - Time since first mention
 * - Mention frequency
 * - Sentiment stability
 * - Pro/con exploration completeness
 * - Historical decision patterns
 *
 * @module PredictiveInsights/DecisionTiming
 */
import type { HistoricalDecisionPattern } from './types.js';
export interface DecisionReadiness {
    userId: string;
    decisionId: string;
    topic: string;
    /** Is the decision ready to be made */
    isReady: boolean;
    /** Days spent mulling this over */
    incubationDays: number;
    /** Number of times mentioned */
    mentionCount: number;
    /** Has sentiment stabilized */
    sentimentStability: number;
    /** Historical pattern for this user */
    historicalPattern?: HistoricalDecisionPattern;
    /** Human-friendly message */
    message: string;
    /** Suggestion */
    suggestion: string;
    /** Confidence in this assessment (0-1) */
    confidence: number;
    /** Should surface */
    shouldSurface: boolean;
}
interface DecisionMention {
    timestamp: Date;
    sentiment: number;
    themes: string[];
    consideredOptions: string[];
    expressedConcerns: string[];
}
interface TrackedDecision {
    id: string;
    topic: string;
    category: 'career' | 'relationship' | 'financial' | 'health' | 'lifestyle' | 'other';
    firstMentioned: Date;
    mentions: DecisionMention[];
    resolved: boolean;
    resolvedAt?: Date;
    outcome?: 'positive' | 'negative' | 'neutral';
}
/**
 * Assess readiness of all pending decisions for a user
 */
export declare function assessDecisionReadiness(userId: string): Promise<DecisionReadiness[]>;
/**
 * Record a decision mention
 */
export declare function recordDecisionMention(userId: string, topic: string, category: TrackedDecision['category'], sentiment: number, themes?: string[], consideredOptions?: string[], expressedConcerns?: string[]): void;
/**
 * Mark a decision as resolved
 */
export declare function resolveDecision(userId: string, topic: string, outcome: 'positive' | 'negative' | 'neutral'): void;
/**
 * Get active decisions for a user
 */
export declare function getActiveDecisions(userId: string): string[];
/**
 * Clear decision data for a user
 */
export declare function clearDecisionData(userId: string): void;
declare const _default: {
    assessDecisionReadiness: typeof assessDecisionReadiness;
    recordDecisionMention: typeof recordDecisionMention;
    resolveDecision: typeof resolveDecision;
    getActiveDecisions: typeof getActiveDecisions;
    clearDecisionData: typeof clearDecisionData;
};
export default _default;
//# sourceMappingURL=decision-timing.d.ts.map