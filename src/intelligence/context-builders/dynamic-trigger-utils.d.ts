/**
 * Dynamic Trigger Utilities
 *
 * Shared utilities for checking proactive_triggers from behavior JSON files.
 * This powers the "Better than Human" dynamic behavior system across all context builders.
 *
 * Pattern: Define CONDITIONS for when to act, not just scripts of what to say.
 *
 * @module DynamicTriggerUtils
 */
interface TriggerAnalytics {
    totalTriggersChecked: number;
    totalTriggersMatched: number;
    totalTriggersFired: number;
    byTriggerName: Map<string, {
        checked: number;
        matched: number;
        fired: number;
    }>;
    byBuilderSource: Map<string, {
        checked: number;
        matched: number;
        fired: number;
    }>;
    recentActivations: Array<{
        triggerName: string;
        builderSource: string;
        confidence: number;
        timestamp: Date;
        userId?: string;
        fired: boolean;
    }>;
}
/**
 * Record a trigger check for analytics
 */
export declare function recordTriggerCheck(builderSource: string): void;
/**
 * Record a trigger match for analytics
 */
export declare function recordTriggerMatch(triggerName: string, builderSource: string, confidence: number, userId?: string): void;
/**
 * Record when a trigger actually fires (passed probability gate)
 */
export declare function recordTriggerFired(triggerName: string, builderSource: string): void;
/**
 * Get analytics summary for debug panel
 */
export declare function getTriggerAnalytics(): {
    summary: {
        totalChecked: number;
        totalMatched: number;
        totalFired: number;
        matchRate: number;
        fireRate: number;
    };
    byTrigger: Array<{
        name: string;
        checked: number;
        matched: number;
        fired: number;
        fireRate: number;
    }>;
    byBuilder: Array<{
        name: string;
        checked: number;
        matched: number;
        fired: number;
        fireRate: number;
    }>;
    recentActivations: TriggerAnalytics['recentActivations'];
};
/**
 * Reset analytics (for testing)
 */
export declare function resetTriggerAnalytics(): void;
export interface ProactiveTrigger {
    trigger: string;
    behavior: string;
}
export interface TriggerContext {
    userId?: string;
    userText?: string;
    emotion?: string;
    emotionIntensity?: number;
    turnCount?: number;
    relationshipStage?: string;
    isLateNight?: boolean;
    recentTopics?: string[];
    daysSinceLastSession?: number;
    currentHour?: number;
    currentTime?: Date;
    isReturningUser?: boolean;
    userData?: Record<string, unknown>;
}
export interface MatchedTrigger {
    triggerName: string;
    trigger: string;
    behavior: string;
    confidence: number;
}
/**
 * Main trigger checking function
 * Matches proactive_triggers conditions against current context
 */
export declare function checkDynamicTriggers(triggers: Record<string, ProactiveTrigger> | undefined, context: TriggerContext): MatchedTrigger | null;
/**
 * Check "more_likely_when" conditions and return probability multiplier
 */
export declare function calculateProbabilityBoost(moreLikelyWhen: string[] | undefined, context: TriggerContext, matchedTrigger: MatchedTrigger | null): number;
/**
 * Check "never_when" conditions - returns true if we should skip
 */
export declare function shouldSkipDueToNeverWhen(neverWhen: string[] | undefined, context: TriggerContext): boolean;
/**
 * Build a context object from ContextBuilderInput
 */
export declare function buildTriggerContext(userText: string, analysis: {
    emotion?: {
        primary?: string;
        intensity?: number;
    };
    topics?: {
        primary?: string | null;
    };
} | undefined, userData: {
    turnCount?: number;
    recentTopics?: string[];
    relationshipStage?: string;
    lastSessionDate?: string;
} | undefined, additionalContext?: Partial<TriggerContext>): TriggerContext;
/**
 * Check triggers using hybrid semantic + pattern matching.
 * Falls back to pattern-only if semantic matching is unavailable.
 *
 * @param triggers - Proactive triggers from behavior JSON
 * @param context - Trigger context with user text, emotion, etc.
 * @param personaId - The persona ID for embedding lookup
 * @param options - Optional configuration
 * @returns The best matched trigger or null
 */
export declare function checkTriggersHybrid(triggers: Record<string, ProactiveTrigger> | undefined, context: TriggerContext, personaId: string, options?: {
    enableSemantic?: boolean;
    semanticThreshold?: number;
    patternThreshold?: number;
}): Promise<MatchedTrigger | null>;
declare const _default: {
    checkDynamicTriggers: typeof checkDynamicTriggers;
    checkTriggersHybrid: typeof checkTriggersHybrid;
    calculateProbabilityBoost: typeof calculateProbabilityBoost;
    shouldSkipDueToNeverWhen: typeof shouldSkipDueToNeverWhen;
    buildTriggerContext: typeof buildTriggerContext;
    recordTriggerCheck: typeof recordTriggerCheck;
    recordTriggerMatch: typeof recordTriggerMatch;
    recordTriggerFired: typeof recordTriggerFired;
    getTriggerAnalytics: typeof getTriggerAnalytics;
    resetTriggerAnalytics: typeof resetTriggerAnalytics;
};
export default _default;
//# sourceMappingURL=dynamic-trigger-utils.d.ts.map