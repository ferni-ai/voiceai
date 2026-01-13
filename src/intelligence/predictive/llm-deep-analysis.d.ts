/**
 * LLM Deep Analysis - Gemini-Powered Predictive Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module implements THREE-TIER PREDICTIVE INTELLIGENCE:
 *
 * TIER 1: STATISTICAL (Real-time, <10ms)
 *   - Markov chains: Behavioral sequence prediction
 *   - Time-series: Mood/energy forecasting
 *   - Thompson Sampling: Optimal timing
 *   → Used for: Real-time turn decisions
 *
 * TIER 2: HYBRID (Per-turn, ~50ms)
 *   - Multi-signal fusion: Combines statistical signals
 *   - Pattern matching: Known pattern detection
 *   → Used for: Context injection, tool selection
 *
 * TIER 3: DEEP ANALYSIS (Batch, scheduled)
 *   - Gemini semantic analysis: What patterns mean
 *   - Cross-conversation reasoning: Long-arc patterns
 *   - Hypothesis generation: "They might be..." predictions
 *   → Used for: Proactive outreach, breakthrough insights
 *
 * WHY THREE TIERS?
 * - Real-time: Can't wait for LLM during conversation
 * - Scheduled: LLM can take time to think deeply
 * - Both feed each other: Statistical patterns trigger deep analysis,
 *   deep insights calibrate statistical models
 *
 * @module intelligence/predictive/llm-deep-analysis
 */
export interface DeepAnalysisInput {
    userId: string;
    /** Last N conversation summaries to analyze */
    conversationSummaries: ConversationSummary[];
    /** Statistical patterns already detected */
    statisticalPatterns: StatisticalPattern[];
    /** User profile for context */
    userProfile: UserContext;
    /** What we want to understand */
    analysisGoals: AnalysisGoal[];
}
export interface ConversationSummary {
    sessionId: string;
    date: Date;
    topics: string[];
    emotionalArc: string;
    keyMoments: string[];
    unresolvedThreads: string[];
}
export interface StatisticalPattern {
    type: 'markov' | 'time-series' | 'fusion';
    description: string;
    confidence: number;
    rawData?: unknown;
}
export interface UserContext {
    name?: string;
    relationshipStage: string;
    knownConcerns: string[];
    knownGoals: string[];
    communicationStyle: string;
}
export type AnalysisGoal = 'identify_unspoken_concerns' | 'predict_upcoming_challenge' | 'find_breakthrough_opportunity' | 'understand_deflection_patterns' | 'detect_emotional_trajectory' | 'identify_support_gaps';
export interface DeepAnalysisResult {
    /** Unique ID for this analysis */
    analysisId: string;
    /** When the analysis was performed */
    timestamp: Date;
    /** Semantic insights from LLM */
    insights: SemanticInsight[];
    /** Predictive hypotheses */
    hypotheses: PredictiveHypothesis[];
    /** Suggested proactive outreach */
    outreachSuggestions: OutreachSuggestion[];
    /** Coaching guidance for next conversation */
    coachingGuidance: string[];
    /** Model used for analysis */
    model: string;
    /** Token usage */
    tokenUsage: {
        input: number;
        output: number;
    };
}
export interface SemanticInsight {
    /** What we noticed */
    observation: string;
    /** Why it matters */
    significance: string;
    /** How confident we are (0-1) */
    confidence: number;
    /** Evidence from conversations */
    evidence: string[];
    /** When to surface this insight */
    surfacingContext: 'proactive' | 'when_relevant' | 'crisis_only';
}
export interface PredictiveHypothesis {
    /** What we predict */
    prediction: string;
    /** Why we think this */
    reasoning: string;
    /** How likely (0-1) */
    probability: number;
    /** When this might happen */
    timeframe: 'immediate' | 'this_week' | 'this_month' | 'eventual';
    /** What would confirm/deny this hypothesis */
    testableSignals: string[];
}
export interface OutreachSuggestion {
    /** What to say */
    message: string;
    /** When to send it */
    timing: 'morning' | 'afternoon' | 'evening' | 'specific_trigger';
    /** Why this outreach */
    rationale: string;
    /** Priority (1-10) */
    priority: number;
}
/**
 * Run deep analysis using Gemini
 *
 * This is a BATCH operation - not for real-time use.
 * Schedule via Cloud Scheduler for users with enough history.
 */
export declare function runDeepAnalysis(input: DeepAnalysisInput): Promise<DeepAnalysisResult>;
/**
 * Get the latest deep analysis for a user
 */
export declare function getLatestDeepAnalysis(userId: string): Promise<DeepAnalysisResult | null>;
/**
 * Get deep analysis context for injection into real-time conversation
 *
 * This takes the pre-computed deep analysis and formats it for turn injection.
 * The LLM doesn't re-analyze - it uses cached insights.
 */
export declare function getDeepAnalysisContextForTurn(userId: string): Promise<string>;
/**
 * Run deep analysis for a batch of users
 *
 * Called by Cloud Scheduler daily or weekly.
 * Only analyzes users with sufficient new conversation history.
 */
export declare function runBatchDeepAnalysis(options: {
    maxUsers?: number;
    minConversationsSinceLastAnalysis?: number;
}): Promise<{
    processed: number;
    skipped: number;
}>;
/**
 * Record when an insight or hypothesis was validated or invalidated
 *
 * This feeds back to calibrate both the LLM analysis and statistical models.
 */
export declare function recordDeepAnalysisFeedback(userId: string, feedback: {
    analysisId: string;
    type: 'insight' | 'hypothesis';
    index: number;
    validated: boolean;
    userResponse?: string;
}): Promise<void>;
export declare const deepAnalysis: {
    run: typeof runDeepAnalysis;
    getLatest: typeof getLatestDeepAnalysis;
    getContext: typeof getDeepAnalysisContextForTurn;
    runBatch: typeof runBatchDeepAnalysis;
    recordFeedback: typeof recordDeepAnalysisFeedback;
};
export default deepAnalysis;
//# sourceMappingURL=llm-deep-analysis.d.ts.map