/**
 * Trigger Effectiveness Calculator
 *
 * Phase 4: Effectiveness Learning
 *
 * Calculates and manages trigger effectiveness scores that personalize
 * which triggers work best for each user. This is the "learning" component
 * that makes triggers genuinely adaptive.
 *
 * Key capabilities:
 * - Weighted effectiveness scoring (engagement rate, sentiment shift, session impact)
 * - Rolling window for relevance (last 30 days by default)
 * - Dynamic confidence adjustment (0.5x to 1.5x multiplier)
 * - Feedback loop protection (minimum floor, exploration)
 *
 * @module EffectivenessCalculator
 */
import type { TriggerEffectiveness, UserTriggerProfile } from './user-trigger-profile.types.js';
export interface EffectivenessConfig {
    /** Weight for engagement rate in score (0-1) */
    engagementWeight: number;
    /** Weight for sentiment shift in score (0-1) */
    sentimentWeight: number;
    /** Weight for session duration impact in score (0-1) */
    sessionImpactWeight: number;
    /** Rolling window in days (only consider recent data) */
    rollingWindowDays: number;
    /** Minimum observations before calculating effectiveness */
    minObservations: number;
    /** Minimum effectiveness multiplier (floor) */
    minMultiplier: number;
    /** Maximum effectiveness multiplier (ceiling) */
    maxMultiplier: number;
    /** Exploration rate for suppressed triggers (0-1) */
    explorationRate: number;
    /** Effectiveness threshold below which to suppress (0-1) */
    suppressionThreshold: number;
    /** Effectiveness threshold above which to boost (0-1) */
    boostThreshold: number;
}
export declare const DEFAULT_EFFECTIVENESS_CONFIG: EffectivenessConfig;
/**
 * Extended outcome data for richer effectiveness learning
 */
export interface TriggerOutcomeEvent {
    /** Trigger that fired */
    triggerName: string;
    /** Trigger category */
    triggerCategory: string;
    /** When the trigger fired */
    timestamp: Date;
    /** User's response classification */
    response: 'engaged' | 'deflected' | 'neutral' | 'appreciated';
    /** Engagement signals detected */
    engagementSignals: EngagementSignal[];
    /** Deflection signals detected */
    deflectionSignals: DeflectionSignal[];
    /** Sentiment before trigger (0-1) */
    sentimentBefore?: number;
    /** Sentiment after trigger (0-1) */
    sentimentAfter?: number;
    /** Session duration before trigger (minutes) */
    sessionDurationBefore?: number;
    /** Session duration after trigger (minutes) - only known at session end */
    sessionDurationAfter?: number;
    /** Context tags (time of day, day of week, topic) */
    contextTags: string[];
}
/**
 * Signals indicating positive engagement
 */
export type EngagementSignal = 'longer_response' | 'deeper_topic' | 'emotional_expression' | 'question_asked' | 'gratitude_expressed' | 'vulnerability_shared' | 'continuation_requested';
/**
 * Signals indicating deflection or disengagement
 */
export type DeflectionSignal = 'topic_change' | 'short_response' | 'minimization' | 'deflection_phrase' | 'dismissive_tone' | 'closed_body_language' | 'session_ended';
/**
 * Calculated effectiveness result for a single trigger
 */
export interface EffectivenessResult {
    /** Trigger name */
    triggerName: string;
    /** Raw effectiveness score (0-1) */
    rawScore: number;
    /** Confidence in this score based on data quantity */
    confidence: number;
    /** Multiplier to apply to trigger confidence (0.5-1.5) */
    multiplier: number;
    /** Whether this trigger should be explored (feedback loop protection) */
    shouldExplore: boolean;
    /** Contexts where this trigger is most effective */
    bestContexts: string[];
    /** Contexts where this trigger is least effective */
    worstContexts: string[];
    /** Component scores for debugging */
    components: {
        engagementRate: number;
        avgSentimentShift: number;
        avgSessionImpact: number;
    };
    /** Number of observations in rolling window */
    observationsInWindow: number;
}
/**
 * Overall effectiveness analysis for a user
 */
export interface UserEffectivenessAnalysis {
    userId: string;
    analyzedAt: Date;
    /** Per-trigger effectiveness */
    triggerResults: EffectivenessResult[];
    /** Triggers that should be boosted */
    triggersToBoost: string[];
    /** Triggers that should be suppressed */
    triggersToSuppress: string[];
    /** Triggers to explore (despite low effectiveness) */
    triggersToExplore: string[];
    /** Overall learning confidence */
    overallConfidence: number;
}
/**
 * Record a trigger outcome event during a session
 */
export declare function recordOutcomeEvent(sessionId: string, event: TriggerOutcomeEvent): void;
/**
 * Get outcome events for a session
 */
export declare function getSessionOutcomes(sessionId: string): TriggerOutcomeEvent[];
/**
 * Clear session outcomes (call at session end after persisting)
 */
export declare function clearSessionOutcomes(sessionId: string): void;
/**
 * Detect engagement signals from user response
 */
export declare function detectEngagementSignals(userResponse: string, averageResponseLength: number, previousTopics: string[], currentTopic: string): EngagementSignal[];
/**
 * Detect deflection signals from user response
 */
export declare function detectDeflectionSignals(userResponse: string, averageResponseLength: number, previousTopic: string, currentTopic: string, sessionEndedWithin: number | null): DeflectionSignal[];
/**
 * Calculate effectiveness score from outcome events
 */
export declare function calculateEffectivenessFromEvents(triggerName: string, events: TriggerOutcomeEvent[], config?: EffectivenessConfig): EffectivenessResult;
/**
 * Calculate effectiveness from existing TriggerEffectiveness records
 * (For backward compatibility with Phase 2 data)
 */
export declare function calculateEffectivenessFromRecord(record: TriggerEffectiveness, config?: EffectivenessConfig): EffectivenessResult;
/**
 * Analyze effectiveness of all triggers for a user
 */
export declare function analyzeUserEffectiveness(profile: UserTriggerProfile, config?: EffectivenessConfig): UserEffectivenessAnalysis;
/**
 * Get effectiveness multiplier for a trigger
 * Used during trigger matching to adjust confidence
 */
export declare function getEffectivenessMultiplier(triggerName: string, profile: UserTriggerProfile, config?: EffectivenessConfig): {
    multiplier: number;
    shouldExplore: boolean;
    confidence: number;
};
/**
 * Apply effectiveness learning to a trigger match score
 */
export declare function applyEffectivenessToScore(originalScore: number, triggerName: string, profile: UserTriggerProfile, config?: EffectivenessConfig): {
    adjustedScore: number;
    wasExplored: boolean;
    multiplierApplied: number;
};
export interface EffectivenessAnalytics {
    totalUsersAnalyzed: number;
    totalTriggersTracked: number;
    avgEffectivenessScore: number;
    triggersAboveBoostThreshold: number;
    triggersBelowSuppressionThreshold: number;
    explorationEventsTriggered: number;
    topPerformingTriggers: Array<{
        name: string;
        score: number;
        observations: number;
    }>;
    worstPerformingTriggers: Array<{
        name: string;
        score: number;
        observations: number;
    }>;
}
/**
 * Record analytics from a user analysis
 */
export declare function recordEffectivenessAnalytics(analysis: UserEffectivenessAnalysis): void;
/**
 * Get effectiveness analytics
 */
export declare function getEffectivenessAnalytics(): EffectivenessAnalytics;
/**
 * Reset effectiveness analytics (for testing)
 */
export declare function resetEffectivenessAnalytics(): void;
//# sourceMappingURL=effectiveness-calculator.d.ts.map