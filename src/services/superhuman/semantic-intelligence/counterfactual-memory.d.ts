/**
 * Counter-Factual Memory - Better Than Human Service
 *
 * "Learn from paths taken and not taken"
 *
 * Tracks when advice was given, whether it was followed,
 * and what outcomes resulted:
 *   - "You said you'd set boundaries at work. You didn't.
 *     Three weeks later you hit burnout."
 *   - Enables: "Last time this pattern started, you didn't rest.
 *     Want to try something different?"
 *
 * @module services/superhuman/semantic-intelligence/counterfactual-memory
 */
import type { DecisionPoint, CounterfactualPattern } from './types.js';
/**
 * Record a decision point where advice/suggestion was given.
 *
 * Call this whenever Ferni gives actionable advice:
 * - "You should set boundaries"
 * - "Try getting more sleep"
 * - "Consider talking to them about it"
 */
export declare function recordDecisionPoint(userId: string, decision: {
    advice: string;
    context: string;
    urgency?: 'low' | 'medium' | 'high';
    domain?: string;
}): Promise<DecisionPoint>;
/**
 * Record follow-up on a decision point.
 *
 * Call this when we detect the user did/didn't follow advice:
 * - User mentions they tried the advice
 * - User mentions they didn't do it
 * - We detect the situation recurring
 */
export declare function recordFollowUp(userId: string, followUp: {
    originalAdvice?: string;
    decisionPointId?: string;
    pathTaken: 'followed' | 'ignored' | 'modified';
    reflection?: string;
}): Promise<DecisionPoint | null>;
/**
 * Record the outcome of a decision.
 *
 * Call this when we can assess what happened:
 * - User reports feeling better/worse
 * - Situation resolved/escalated
 * - Time has passed and we can reflect
 */
export declare function recordOutcome(userId: string, outcome: {
    decisionPointId: string;
    result: 'positive' | 'negative' | 'neutral' | 'mixed';
    description: string;
    emotionalImpact?: number;
    userReflection?: string;
}): Promise<void>;
/**
 * Get pending decisions that need follow-up.
 */
export declare function getPendingFollowUps(userId: string): Promise<DecisionPoint[]>;
/**
 * Get relevant patterns for current context.
 */
export declare function getRelevantPatterns(userId: string, context: {
    currentTopic?: string;
    currentSituation?: string;
}): Promise<CounterfactualPattern[]>;
/**
 * Find similar past decisions for current situation.
 */
export declare function findSimilarPastDecisions(userId: string, currentSituation: string): Promise<DecisionPoint[]>;
/**
 * Build context string for LLM injection.
 */
export declare function buildCounterfactualContext(userId: string, currentContext?: {
    topic?: string;
    situation?: string;
}): Promise<string>;
/**
 * Clear counterfactual cache for a user.
 */
export declare function clearCounterfactualCache(userId?: string): void;
export declare const counterfactualMemory: {
    recordDecision: typeof recordDecisionPoint;
    recordFollowUp: typeof recordFollowUp;
    recordOutcome: typeof recordOutcome;
    getPendingFollowUps: typeof getPendingFollowUps;
    getRelevantPatterns: typeof getRelevantPatterns;
    findSimilar: typeof findSimilarPastDecisions;
    buildContext: typeof buildCounterfactualContext;
    clearCache: typeof clearCounterfactualCache;
};
//# sourceMappingURL=counterfactual-memory.d.ts.map