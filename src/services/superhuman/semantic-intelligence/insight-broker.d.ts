/**
 * Insight Broker - Proactive Intelligence V3.2
 *
 * The brain that monitors all semantic systems and surfaces insights
 * at the right moment. This is what makes Ferni say "I noticed..." and
 * "Remember when you mentioned...?"
 *
 * Key capabilities:
 * - Monitor all 6 semantic systems for high-priority insights
 * - Push relevant insights to agent at the right moment
 * - Respect timing intelligence (no heavy stuff late at night)
 * - Track which insights have been surfaced (don't repeat)
 *
 * @module services/superhuman/semantic-intelligence/insight-broker
 */
export type InsightSource = 'correlation' | 'trajectory' | 'relational' | 'counterfactual' | 'growth' | 'threading' | 'open_loop' | 'commitment' | 'temporal' | 'behavioral';
export type InsightPriority = 'critical' | 'high' | 'medium' | 'low';
export interface InsightTrigger {
    type: 'topic' | 'person' | 'emotion' | 'time' | 'keyword' | 'session_start' | 'silence';
    value?: string;
    condition?: 'equals' | 'contains' | 'after' | 'before';
}
export interface ProactiveInsight {
    id: string;
    userId: string;
    source: InsightSource;
    priority: InsightPriority;
    insight: string;
    context: string;
    surfaceWhen: InsightTrigger[];
    surfaceAfter?: Date;
    expiresAt?: Date;
    created: Date;
    surfaced: boolean;
    surfacedAt?: Date;
    dismissed: boolean;
    relatedEntities?: string[];
    confidence: number;
}
export interface InsightBatch {
    userId: string;
    insights: ProactiveInsight[];
    fetchedAt: Date;
}
/**
 * Create a new proactive insight.
 *
 * Call this when any semantic system detects something worth surfacing.
 */
export declare function createInsight(userId: string, insight: {
    source: InsightSource;
    priority: InsightPriority;
    insight: string;
    context: string;
    surfaceWhen: InsightTrigger[];
    surfaceAfter?: Date;
    expiresAt?: Date;
    relatedEntities?: string[];
    confidence?: number;
}): Promise<ProactiveInsight>;
/**
 * Get insights to surface for the current context.
 *
 * Call this at session start or when context changes significantly.
 */
export declare function getInsightsToSurface(userId: string, context: {
    currentTopic?: string;
    currentPerson?: string;
    currentEmotion?: string;
    isSessionStart?: boolean;
    hourOfDay?: number;
}): Promise<ProactiveInsight[]>;
/**
 * Mark an insight as surfaced.
 */
export declare function markInsightSurfaced(userId: string, insightId: string): Promise<void>;
/**
 * Dismiss an insight (user indicated not interested).
 */
export declare function dismissInsight(userId: string, insightId: string): Promise<void>;
/**
 * Get pending insights count for a user.
 */
export declare function getPendingInsightCount(userId: string): Promise<number>;
/**
 * Generate insight from correlation discovery.
 */
export declare function generateCorrelationInsight(userId: string, correlation: {
    pattern1: string;
    pattern2: string;
    strength: number;
    description: string;
}): Promise<ProactiveInsight | null>;
/**
 * Generate insight from emotional trajectory.
 */
export declare function generateTrajectoryInsight(userId: string, trajectory: {
    emotion: string;
    trend: 'rising' | 'falling' | 'stable';
    duration: string;
    trigger?: string;
}): Promise<ProactiveInsight | null>;
/**
 * Generate insight from advice outcome.
 */
export declare function generateCounterfactualInsight(userId: string, outcome: {
    advice: string;
    followed: boolean;
    result: 'positive' | 'negative' | 'neutral';
    lesson: string;
}): Promise<ProactiveInsight | null>;
/**
 * Generate insight from growth observation.
 */
export declare function generateGrowthInsight(userId: string, growth: {
    area: string;
    change: string;
    timeframe: string;
}): Promise<ProactiveInsight | null>;
/**
 * Generate insight from cross-session connection.
 */
export declare function generateThreadingInsight(userId: string, thread: {
    topic1: string;
    topic2: string;
    connection: string;
    sessionGap: number;
}): Promise<ProactiveInsight | null>;
/**
 * Format insights for LLM injection.
 */
export declare function formatInsightsForPrompt(insights: ProactiveInsight[]): string;
/**
 * Clear session-scoped data.
 */
export declare function clearSessionInsights(userId: string): void;
/**
 * Clear cache for a user.
 */
export declare function clearInsightCache(userId?: string): void;
export declare const insightBroker: {
    create: typeof createInsight;
    getToSurface: typeof getInsightsToSurface;
    markSurfaced: typeof markInsightSurfaced;
    dismiss: typeof dismissInsight;
    getPendingCount: typeof getPendingInsightCount;
    format: typeof formatInsightsForPrompt;
    clearSession: typeof clearSessionInsights;
    clearCache: typeof clearInsightCache;
    fromCorrelation: typeof generateCorrelationInsight;
    fromTrajectory: typeof generateTrajectoryInsight;
    fromCounterfactual: typeof generateCounterfactualInsight;
    fromGrowth: typeof generateGrowthInsight;
    fromThreading: typeof generateThreadingInsight;
};
export default insightBroker;
//# sourceMappingURL=insight-broker.d.ts.map