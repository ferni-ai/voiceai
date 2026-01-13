/**
 * Insights & Analysis Tools
 *
 * Cross-domain analysis capabilities:
 * - Synthesize insights across all team domains
 * - Identify behavioral patterns and correlations
 * - Surface proactive discoveries
 * - Connect insights to actionable goals
 * - Generate behavior-change recommendations
 *
 * NOTE: For new code, use `tools/domains/research/index.ts` instead.
 *
 * INTEGRATIONS:
 * - Financial Store (spending, habits, triggers)
 * - Goal tracking data
 * - Calendar patterns (via context)
 * - Portfolio behavior (via context)
 */
import { llm } from '@livekit/agents';
export interface SpendingSignal {
    category: string;
    amount: number;
    trend: 'up' | 'down' | 'stable';
    anomaly: boolean;
    triggerPattern?: string;
}
export interface TimeSignal {
    calendarDensity: 'light' | 'moderate' | 'heavy' | 'overloaded';
    productiveHoursRatio: number;
    meetingHeavyDays: number;
    freeTimeBlocks: number;
}
export interface HabitSignal {
    activeHabits: number;
    averageStreak: number;
    consistencyScore: number;
    recentSetbacks: string[];
    keystoneHabitActive: boolean;
}
export interface GoalSignal {
    activeGoals: number;
    onTrackGoals: number;
    stalledGoals: number;
    upcomingMilestones: string[];
}
export interface WealthSignal {
    checkFrequency: 'healthy' | 'elevated' | 'anxious';
    recentTrades: number;
    portfolioHealthScore: number;
    riskBehaviorMatch: boolean;
}
export interface CrossDomainSnapshot {
    spending: SpendingSignal[];
    time: TimeSignal;
    habits: HabitSignal;
    goals: GoalSignal;
    wealth: WealthSignal;
    correlations: CorrelationInsight[];
    timestamp: string;
}
export interface CorrelationInsight {
    domains: string[];
    pattern: string;
    confidence: 'high' | 'medium' | 'low';
    actionable: boolean;
    recommendation?: string;
}
export interface ProactiveInsight {
    type: 'anomaly' | 'correlation' | 'prediction' | 'opportunity' | 'warning';
    severity: 'info' | 'attention' | 'urgent';
    title: string;
    insight: string;
    evidence: string[];
    recommendation: string;
    connectedDomains: string[];
}
export declare function createInsightsAnalysisTools(): {
    /**
     * Full cross-domain analysis - Peter's signature capability
     */
    synthesizeInsights: llm.FunctionTool<{
        focusDomains: ("habits" | "spending" | "all" | "goals" | "time" | "wealth")[];
        timeframe: "month" | "week" | "quarter";
    }, unknown, string>;
    /**
     * Spot specific patterns or anomalies
     */
    spotAnomalies: llm.FunctionTool<{
        domain: "habits" | "spending" | "all" | "goals" | "time" | "wealth";
    }, unknown, string>;
    /**
     * Find specific correlations between two domains
     */
    findCorrelation: llm.FunctionTool<{
        domain1: "habits" | "spending" | "goals" | "time" | "wealth";
        domain2: "habits" | "spending" | "goals" | "time" | "wealth";
    }, unknown, string>;
    /**
     * Predict what's likely to happen based on patterns
     */
    projectTrends: llm.FunctionTool<{
        domain: "habits" | "spending" | "goals" | "overall";
        timeframe: "month" | "week" | "quarter";
    }, unknown, string>;
    /**
     * Generate a behavioral insight from specific data
     */
    generateBehavioralInsight: llm.FunctionTool<{
        behavior: string;
        context?: string | undefined;
    }, unknown, string>;
    /**
     * Create an insight briefing
     */
    createInsightBriefing: llm.FunctionTool<{
        topic: string;
        depth: "standard" | "deep" | "quick";
    }, unknown, string>;
    /**
     * The Lever Finder - identify the highest-impact change
     */
    findTheLever: llm.FunctionTool<{
        currentChallenges: string[];
    }, unknown, string>;
    /**
     * Proactive Insight Scanner - surfaces insights before being asked
     */
    runProactiveInsightScan: llm.FunctionTool<{
        scanDepth: "standard" | "deep" | "quick";
    }, unknown, string>;
    /**
     * Pattern Journal - help users build pattern recognition skills
     */
    logPatternObservation: llm.FunctionTool<{
        observation: string;
        domain: "habits" | "relationships" | "health" | "spending" | "energy" | "other" | "work" | "time";
        potentialPattern?: string | undefined;
        triggerContext?: string | undefined;
    }, unknown, string>;
    /**
     * Behavioral Bias Detector
     */
    detectBehavioralBias: llm.FunctionTool<{
        situation: string;
        context?: string | undefined;
        recentHistory?: string | undefined;
    }, unknown, string>;
    /**
     * Cross-Domain Dashboard
     */
    generateInsightsDashboard: llm.FunctionTool<{
        includeRecommendations: boolean;
    }, unknown, string>;
};
export default createInsightsAnalysisTools;
//# sourceMappingURL=insights-analysis.d.ts.map