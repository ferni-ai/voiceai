/**
 * Better Than Human Telemetry
 *
 * Tracks activation and effectiveness of all "Better Than Human" features:
 * - Memory surfacing
 * - Celebration engine
 * - Growth visibility
 * - Pattern surfacing
 * - EQ features (micro-expressions, active listening, etc.)
 * - Proactive outreach
 *
 * This helps us understand if our superhuman capabilities are actually
 * being used and making a difference.
 *
 * @module BetterThanHumanTelemetry
 */
export type FeatureType = 'proactive_memory_surfaced' | 'cross_session_reflection' | 'quoted_memory_recalled' | 'celebration_triggered' | 'celebration_goal_completed' | 'celebration_streak' | 'celebration_breakthrough' | 'growth_insight_detected' | 'growth_insight_surfaced' | 'growth_insight_resonated' | 'pattern_detected' | 'pattern_surfaced' | 'pattern_resonated' | 'micro_expression_played' | 'active_listening_triggered' | 'breath_sync_activated' | 'concern_detected' | 'anticipation_triggered' | 'outreach_thinking_of_you' | 'outreach_celebration' | 'outreach_growth' | 'outreach_commitment_check' | 'outreach_response' | 'user_reaction_positive' | 'user_reaction_neutral' | 'user_reaction_negative';
export interface TelemetryEvent {
    id: string;
    feature: FeatureType;
    userId: string;
    personaId: string;
    sessionId?: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
export interface FeatureStats {
    totalActivations: number;
    uniqueUsers: Set<string>;
    lastActivation?: Date;
    successRate?: number;
}
export interface TelemetrySummary {
    period: {
        start: Date;
        end: Date;
    };
    memory: {
        proactiveMemoriesSurfaced: number;
        crossSessionReflections: number;
        quotedMemoriesRecalled: number;
    };
    celebration: {
        totalCelebrations: number;
        byType: Record<string, number>;
    };
    growth: {
        insightsDetected: number;
        insightsSurfaced: number;
        resonanceRate: number;
    };
    patterns: {
        patternsDetected: number;
        patternsSurfaced: number;
        resonanceRate: number;
    };
    eq: {
        microExpressions: number;
        activeListening: number;
        breathSync: number;
        concernDetections: number;
        anticipations: number;
    };
    outreach: {
        thinkingOfYou: number;
        celebrations: number;
        growth: number;
        commitmentChecks: number;
        totalSent: number;
        responseRate: number;
    };
    userReactions: {
        positive: number;
        neutral: number;
        negative: number;
        positiveRate: number;
    };
}
declare class BetterThanHumanTelemetry {
    private events;
    private featureStats;
    private maxEvents;
    constructor();
    private initializeStats;
    /**
     * Track a feature activation
     */
    track(feature: FeatureType, userId: string, personaId: string, sessionId?: string, metadata?: Record<string, unknown>): void;
    /**
     * Convenience methods for specific features
     */
    trackProactiveMemory(userId: string, personaId: string, sessionId: string): void;
    trackCrossSessionReflection(userId: string, personaId: string): void;
    trackQuotedMemory(userId: string, personaId: string): void;
    trackCelebration(type: 'goal_completed' | 'streak' | 'breakthrough' | 'generic', userId: string, personaId: string, metadata?: Record<string, unknown>): void;
    trackGrowthInsightDetected(userId: string, personaId: string, insightType: string): void;
    trackGrowthInsightSurfaced(userId: string, personaId: string, insightId: string): void;
    trackGrowthInsightResonated(userId: string, personaId: string, insightId: string): void;
    trackPatternDetected(userId: string, personaId: string, patternType: string): void;
    trackPatternSurfaced(userId: string, personaId: string, patternId: string): void;
    trackPatternResonated(userId: string, personaId: string, patternId: string): void;
    trackMicroExpression(userId: string, personaId: string, expressionType: string): void;
    trackActiveListening(userId: string, personaId: string): void;
    trackBreathSync(userId: string, personaId: string): void;
    trackConcernDetected(userId: string, personaId: string, concernLevel: string): void;
    trackAnticipation(userId: string, personaId: string): void;
    trackOutreach(type: 'thinking_of_you' | 'celebration' | 'growth' | 'commitment_check', userId: string, personaId: string, metadata?: Record<string, unknown>): void;
    trackOutreachResponse(options: {
        userId: string;
        outreachId: string;
        responseType: string;
        personaId?: string;
        sentiment?: 'positive' | 'neutral' | 'negative';
    }): void;
    trackUserReaction(reaction: 'positive' | 'neutral' | 'negative', userId: string, featureContext?: string): void;
    /**
     * Get stats for a specific feature
     */
    getFeatureStats(feature: FeatureType): FeatureStats | undefined;
    /**
     * Get summary of all features
     */
    getSummary(periodDays?: number): TelemetrySummary;
    /**
     * Get activation rate for a feature (per session)
     */
    getActivationRate(feature: FeatureType, totalSessions: number): number;
    /**
     * Get unique user count for a feature
     */
    getUniqueUsers(feature: FeatureType): number;
    /**
     * Log summary to console (for debugging)
     */
    logSummary(): void;
    /**
     * Export events for external analytics
     */
    exportEvents(since?: Date): TelemetryEvent[];
    /**
     * Clear all telemetry (for testing)
     */
    reset(): void;
}
export declare function getBetterThanHumanTelemetry(): BetterThanHumanTelemetry;
export { BetterThanHumanTelemetry };
export default BetterThanHumanTelemetry;
//# sourceMappingURL=better-than-human-telemetry.d.ts.map