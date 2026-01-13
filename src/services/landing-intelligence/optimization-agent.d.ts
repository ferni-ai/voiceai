/**
 * Landing Optimization Agent
 *
 * An AI-powered agent that automatically optimizes the landing page.
 * Uses Ferni's team personas to handle different aspects:
 *
 * - **Ferni**: Overall coordination, tone consistency
 * - **Peter**: Data analysis, pattern recognition
 * - **Alex**: Copy generation, A/B variant creation
 * - **Maya**: User behavior patterns, conversion habits
 * - **Jordan**: Experiment scheduling, campaign planning
 *
 * @module services/landing-intelligence/optimization-agent
 */
export interface OptimizationInsight {
    id: string;
    persona: 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan';
    type: 'observation' | 'recommendation' | 'experiment' | 'alert';
    title: string;
    description: string;
    confidence: number;
    actionable: boolean;
    suggestedAction?: string;
    data?: Record<string, unknown>;
    createdAt: Date;
}
export interface ExperimentSuggestion {
    id: string;
    name: string;
    hypothesis: string;
    variants: {
        control: Record<string, string>;
        treatment: Record<string, string>;
    };
    targetMetric: string;
    suggestedDuration: number;
    estimatedImpact: 'low' | 'medium' | 'high';
    persona: string;
    reasoning: string;
}
export interface LandingMetrics {
    period: 'day' | 'week' | 'month';
    visitors: number;
    uniqueVisitors: number;
    returningVisitors: number;
    avgTimeOnPage: number;
    avgScrollDepth: number;
    ctaClicks: number;
    conversions: number;
    conversionRate: number;
    topSections: Array<{
        section: string;
        avgTime: number;
    }>;
    topIntents: Array<{
        intent: string;
        count: number;
    }>;
    timeDistribution: Record<string, number>;
}
export interface AgentReport {
    id: string;
    generatedAt: Date;
    period: string;
    metrics: LandingMetrics;
    insights: OptimizationInsight[];
    experiments: ExperimentSuggestion[];
    summary: string;
}
export declare function collectLandingMetrics(period?: 'day' | 'week' | 'month'): Promise<LandingMetrics>;
declare const PERSONA_PROMPTS: {
    peter: string;
    alex: string;
    maya: string;
    jordan: string;
    ferni: string;
};
declare function getPersonaInsights(persona: keyof typeof PERSONA_PROMPTS, metrics: LandingMetrics): Promise<OptimizationInsight[]>;
declare function generateExperimentSuggestions(metrics: LandingMetrics, insights: OptimizationInsight[]): Promise<ExperimentSuggestion[]>;
export declare function generateOptimizationReport(period?: 'day' | 'week' | 'month'): Promise<AgentReport>;
export interface AutomationConfig {
    autoApproveExperiments: boolean;
    minConfidenceForAction: number;
    notifyOnAlerts: boolean;
    slackWebhook?: string;
}
export declare function runAutomatedOptimization(config?: AutomationConfig): Promise<{
    report: AgentReport;
    actionsExecuted: string[];
}>;
export declare function dailyOptimizationCheck(): Promise<void>;
export declare function weeklyOptimizationReport(): Promise<AgentReport>;
export { getPersonaInsights, generateExperimentSuggestions };
//# sourceMappingURL=optimization-agent.d.ts.map