/**
 * Proactive Insight Engine
 *
 * Analyzes user data to generate proactive suggestions and insights.
 * Jack doesn't just respond - he notices patterns and proactively helps.
 *
 * Examples:
 * - "You always check the market on Monday mornings - want me to summarize?"
 * - "You've mentioned Sarah's college fund 3 times - shall we make a plan?"
 * - "Based on your spending, you could save $200/month on subscriptions"
 * - "It's been 2 weeks since we talked - just checking in!"
 */
import type { UserProfile } from '../types/user-profile.js';
import type { LearnedConversationPatterns } from './conversation-pattern-analyzer.js';
import type { LearnedResponsePreferences } from './response-quality-tracker.js';
/**
 * Type of proactive insight
 */
export type InsightType = 'pattern_noticed' | 'goal_check_in' | 'milestone_approaching' | 'concern_follow_up' | 'spending_observation' | 'relationship_milestone' | 'market_context' | 'seasonal_reminder' | 'behavior_suggestion' | 'opportunity_spotted' | 'overdue_check_in' | 'celebration';
/**
 * Priority level for insight
 */
export type InsightPriority = 'high' | 'medium' | 'low';
/**
 * A single proactive insight
 */
export interface ProactiveInsight {
    id: string;
    type: InsightType;
    priority: InsightPriority;
    title: string;
    message: string;
    context: string;
    generatedAt: Date;
    expiresAt?: Date;
    relatedGoalId?: string;
    relatedTopics: string[];
    delivered: boolean;
    deliveredAt?: Date;
    userReaction?: 'positive' | 'neutral' | 'dismissed' | 'negative';
}
/**
 * Insight generation result
 */
export interface InsightGenerationResult {
    insights: ProactiveInsight[];
    highPriorityCount: number;
    suggestedConversationStarter?: string;
}
export declare class ProactiveInsightEngine {
    private userId;
    private generatedInsights;
    private deliveredInsightIds;
    constructor(userId: string, existingInsights?: ProactiveInsight[]);
    /**
     * Generate all applicable insights for a user
     */
    generateInsights(profile: UserProfile, patterns?: LearnedConversationPatterns, responsePrefs?: LearnedResponsePreferences): InsightGenerationResult;
    /**
     * Check if it's been too long since last conversation
     */
    private checkOverdueConversation;
    /**
     * Check goals for insights
     */
    private checkGoals;
    /**
     * Check key moments that need follow-up
     */
    private checkKeyMoments;
    /**
     * Check conversation patterns for insights
     */
    private checkPatterns;
    /**
     * Check for seasonal opportunities
     */
    private checkSeasonalOpportunities;
    /**
     * Check relationship milestones
     */
    private checkRelationshipMilestones;
    /**
     * Check behavior patterns for suggestions
     */
    private checkBehaviorPatterns;
    /**
     * Mark an insight as delivered
     */
    markDelivered(insightId: string, reaction?: 'positive' | 'neutral' | 'dismissed' | 'negative'): void;
    /**
     * Get undelivered insights
     */
    getUndeliveredInsights(): ProactiveInsight[];
    /**
     * Get the next best insight to deliver
     */
    getNextInsight(): ProactiveInsight | null;
    /**
     * Get all insights for persistence
     */
    getAllInsights(): ProactiveInsight[];
    /**
     * Get insight stats
     */
    getStats(): {
        total: number;
        delivered: number;
        pending: number;
        positiveReactions: number;
        negativeReactions: number;
    };
}
export declare function getProactiveInsightEngine(userId: string, existingInsights?: ProactiveInsight[]): ProactiveInsightEngine;
export declare function removeProactiveInsightEngine(userId: string): void;
export default ProactiveInsightEngine;
//# sourceMappingURL=proactive-insight-engine.d.ts.map