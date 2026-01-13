/**
 * Optimization Types - Shared types for feedback/recommendation systems
 *
 * This file contains shared types used by both:
 * - src/services/optimization-persistence.ts
 * - src/tools/feedback-collector.ts
 * - src/tools/recommendation-engine.ts
 *
 * Extracted to avoid circular dependencies between services and tools.
 */
export type FeedbackType = 'explicit_positive' | 'explicit_negative' | 'explicit_rating' | 'implicit_success' | 'implicit_failure' | 'implicit_retry' | 'implicit_abandon' | 'implicit_followup' | 'feature_request';
export interface FeedbackRecord {
    id: string;
    timestamp: Date;
    userId: string;
    sessionId: string;
    agentId: string;
    toolId: string | null;
    domain: string | null;
    type: FeedbackType;
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    userMessage: string;
    toolResult?: string;
    requestedCapability?: string;
    turnNumber: number;
    conversationLength: number;
}
export interface FeedbackSummary {
    toolId: string;
    totalFeedback: number;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    averageScore: number;
    retryRate: number;
    abandonRate: number;
    featureRequests: string[];
}
export type RecommendationType = 'create_tool' | 'consolidate_tools' | 'deprecate_tool' | 'run_experiment' | 'improve_tool' | 'add_domain' | 'modify_loading';
export interface Evidence {
    type: 'usage_data' | 'feedback' | 'pattern' | 'experiment_result';
    summary: string;
    dataPoints: number;
    confidence: number;
}
export interface ImpactAssessment {
    userExperience: 'positive' | 'neutral' | 'negative';
    toolCount: number;
    complexity: 'low' | 'medium' | 'high';
    riskLevel: 'low' | 'medium' | 'high';
    estimatedBenefit: string;
}
export interface ImplementationGuide {
    steps: string[];
    estimatedEffort: 'hours' | 'days' | 'weeks';
    requiredChanges: string[];
    testingStrategy: string;
}
export interface Recommendation {
    id: string;
    type: RecommendationType;
    priority: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    rationale: string;
    evidence: Evidence[];
    impact: ImpactAssessment;
    implementation: ImplementationGuide;
    createdAt: Date;
    status: 'pending' | 'approved' | 'rejected' | 'implemented';
}
export interface ToolCoOccurrence {
    toolA: string;
    toolB: string;
    count: number;
    avgGap: number;
    correlation: number;
}
export interface ToolSequence {
    sequence: string[];
    count: number;
    avgDuration: number;
    successRate: number;
}
export interface UserJourney {
    name: string;
    description: string;
    tools: string[];
    frequency: number;
    avgSuccess: number;
}
export interface GapAnalysis {
    description: string;
    requestCount: number;
    examples: string[];
    suggestedDomain: string;
    suggestedToolName: string;
    priority: 'high' | 'medium' | 'low';
}
export interface ConsolidationOpportunity {
    tools: string[];
    reason: string;
    suggestedName: string;
    expectedBenefit: string;
    confidence: number;
}
export interface UserSegment {
    name: string;
    description: string;
    userCount: number;
    topTools: string[];
    avgSessionLength: number;
    characteristics: string[];
}
export interface SessionData {
    sessionId: string;
    userId: string;
    agentId: string;
    startTime: Date;
    endTime?: Date;
    toolCalls: Array<{
        toolId: string;
        timestamp: Date;
        success: boolean;
        latencyMs: number;
    }>;
    feedback: FeedbackRecord[];
}
//# sourceMappingURL=optimization-types.d.ts.map