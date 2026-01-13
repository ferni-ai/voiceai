/**
 * Semantic Intelligence System - Better Than Human v3
 *
 * Six new superhuman capabilities that leverage semantic understanding
 * to provide insights no human friend could offer:
 *
 * 1. **Correlation Mining** - Connect dots across domains
 * 2. **Emotional Trajectories** - See journeys, not moments
 * 3. **Relational Semantics** - Know who brings joy vs. drains energy
 * 4. **Counter-Factual Memory** - Learn from paths taken/not taken
 * 5. **Growth Fingerprint** - Show how they've evolved
 * 6. **Cross-Session Threading** - Find hidden connections
 *
 * @module services/superhuman/semantic-intelligence
 */
import { recordObservation, buildCorrelationContext, getRelevantCorrelations } from './correlation-mining.js';
import { recordEmotionalWaypoint, buildEmotionalTrajectoryContext, getActiveArcs } from './emotional-trajectories.js';
import { recordPersonMention, buildRelationalContext, getImpactfulRelationships } from './relational-semantics.js';
import { recordDecisionPoint, buildCounterfactualContext, getPendingFollowUps } from './counterfactual-memory.js';
import { recordConversationData, buildGrowthContext, getGrowthFingerprint } from './growth-fingerprint.js';
import { recordMoment, buildThreadingContext, getUnconsciousConnections } from './cross-session-threading.js';
import type { SemanticIntelligenceContext } from './types.js';
/**
 * Get metrics summary for a specific metric.
 */
export declare function getMetricsSummary(name: string): {
    count: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    lastValue: number;
} | null;
/**
 * Get all performance metrics for semantic intelligence.
 */
export declare function getAllMetrics(): Record<string, ReturnType<typeof getMetricsSummary>>;
/**
 * Clear all metrics (useful for testing).
 */
export declare function clearMetrics(): void;
export type * from './types.js';
export { correlationMining } from './correlation-mining.js';
export { emotionalTrajectories } from './emotional-trajectories.js';
export { relationalSemantics } from './relational-semantics.js';
export { counterfactualMemory } from './counterfactual-memory.js';
export { growthFingerprint } from './growth-fingerprint.js';
export { crossSessionThreading } from './cross-session-threading.js';
export { processSemanticIntelligence, recordAgentAdvice, recordAdviceOutcome, detectAdviceOutcome, warmupSemanticIntelligence, type TurnSemanticData, type AgentAdviceContext, } from './integration.js';
export { detectAdvice, trackAdviceInResponse, type AdviceDetectionResult, } from './advice-detector.js';
export { extractPersons, getPrimaryPerson, getPrimaryPersonName, type ExtractedPerson, type PersonRelationship, } from './person-extractor.js';
export { findMatchingAdvice, precomputeAdviceEmbeddings, clearAdviceEmbeddingCache, type PastAdvice, type AdviceMatch, } from './advice-matcher.js';
export { detectAdviceWithLLM, extractPersonsWithLLM, detectAdviceOutcomeWithLLM, detectAdviceHybrid, extractPersonsHybrid, clearLLMDetectorCache, resetLLMDetectorClient, getLLMDetectorStats, type LLMAdviceResult, type LLMPersonResult, type LLMOutcomeResult, } from './llm-detector.js';
export { insightBroker, createInsight, getInsightsToSurface, markInsightSurfaced, dismissInsight, getPendingInsightCount, formatInsightsForPrompt, generateCorrelationInsight, generateTrajectoryInsight, generateCounterfactualInsight, generateGrowthInsight, generateThreadingInsight, clearInsightCache, type ProactiveInsight, type InsightSource, type InsightPriority, type InsightTrigger, } from './insight-broker.js';
export { openLoops, createOpenLoop, getLoopsReadyForFollowUp, markFollowedUp, resolveLoop, dismissLoop, getAllOpenLoops, getLoopsByType, detectOpenLoops, processUserTextForLoops, clearLoopCache, type OpenLoop, type OpenLoopType, type OpenLoopStatus, } from './open-loops.js';
export { ferniCommitments, createCommitment, fulfillCommitment, checkAvoidanceViolation, getPendingCommitments, getRememberedThings, getAvoidanceTopics, getAllCommitments, detectCommitmentsInResponse, trackCommitmentsInResponse, formatCommitmentsForContext, clearCommitmentCache, type FerniCommitment, type CommitmentType, } from './ferni-commitments.js';
export { relationshipGraph, upsertPerson, findPersonByName, getAllPeople, getPeopleByRelationship, getPeopleByImpact, getMostMentioned, getRecentlyMentioned, recordConnection, getConnectionsForPerson, getConflicts, updateSupportScore, getTopSupporters, getGraphSummary, formatGraphForContext, clearGraphCache, type PersonNode, type PersonConnection, type RelationshipType, type ConnectionType, type RelationshipGraphSummary, } from './relationship-graph.js';
export { temporalPatterns, recordSnapshot as recordTemporalSnapshot, getHourlyPattern, getDayPattern, getSeasonalPattern, getTemporalContext, detectAnomaly as detectTemporalAnomaly, formatTemporalContext, clearTemporalCache, type HourlyPattern, type DayOfWeekPattern, type SeasonalPattern, type TemporalContext, type TemporalSnapshot, } from './temporal-patterns.js';
export { behavioralIntelligence, recordPotentialSabotage, getSabotagePatterns, getUnsurfacedPatterns, markPatternSurfaced, updateBaseline, getBaseline, checkBaselineDeviation, recordTrigger, getTriggers, checkForTriggers, formatBehavioralContext, clearBehavioralCache, type SelfSabotagePattern, type EmotionalBaseline, type Trigger, type BehavioralCycle, } from './behavioral-intelligence.js';
export { coachingIntelligence, recordAdviceOutcome as recordCoachingOutcome, getEffectivenessProfile, getBestApproach, detectLearningStyleFromText, updateLearningStyle, getLearningStyle, recordDeflection, recordPushback, getResistancePattern, isTopicSensitive, getCoachingRecommendations, formatCoachingContext, clearCoachingCache, type AdviceEffectivenessProfile, type LearningStyle, type ResistancePattern, type CoachingRecommendation, } from './coaching-intelligence.js';
export { selfAwareness, recordBlindSpotEvidence, getBlindSpots, getUnsurfacedBlindSpots, markBlindSpotSurfaced, recordSelfPerception, recordBehavior, getGaps, recordStatedValue, recordValueBehavior, getValuesAlignment, getMisalignedValues, detectDistortions, recordDistortions, getDistortionProfile, formatSelfAwarenessContext, clearSelfAwarenessCache, type BlindSpot, type SelfPerceptionGap, type ValuesBehaviorAlignment, type CognitiveDistortionProfile, type CognitiveDistortion, } from './self-awareness.js';
/**
 * Record a conversation turn for all semantic intelligence systems.
 *
 * This is the main entry point - call this after each meaningful
 * user turn to feed all six systems.
 */
export declare function recordSemanticData(userId: string, data: {
    content: string;
    topics?: string[];
    emotion?: string;
    emotionIntensity?: number;
    emotionValence?: number;
    personMentioned?: string;
    personRelationship?: string;
    personSentiment?: number;
    adviceGiven?: string;
    adviceContext?: string;
    cognitivePattern?: 'problem_solving' | 'catastrophizing' | 'growth' | 'self_compassion';
    significance?: 'low' | 'medium' | 'high';
}): Promise<void>;
/**
 * Build complete semantic intelligence context for LLM injection.
 *
 * Use this to get all relevant semantic insights for the current
 * conversation context.
 */
export declare function buildSemanticIntelligenceContext(userId: string, currentContext?: {
    content?: string;
    topics?: string[];
    emotion?: string;
    personMentioned?: string;
    isSessionStart?: boolean;
}): Promise<SemanticIntelligenceContext>;
/**
 * Format semantic intelligence context as a single string for LLM injection.
 */
export declare function formatSemanticIntelligenceContext(context: SemanticIntelligenceContext): string;
/**
 * Get a quick summary of semantic intelligence state for a user.
 */
export declare function getSemanticIntelligenceSummary(userId: string): Promise<{
    correlationCount: number;
    activeArcs: number;
    trackedPeople: number;
    pendingDecisions: number;
    growthWeeks: number;
    hiddenThreads: number;
}>;
/**
 * Clear all semantic intelligence caches for a user.
 */
export declare function clearSemanticIntelligenceCache(userId?: string): void;
export declare const semanticIntelligence: {
    record: typeof recordSemanticData;
    buildContext: typeof buildSemanticIntelligenceContext;
    formatContext: typeof formatSemanticIntelligenceContext;
    getSummary: typeof getSemanticIntelligenceSummary;
    clearCache: typeof clearSemanticIntelligenceCache;
    correlations: {
        recordObservation: typeof recordObservation;
        getRelevantCorrelations: typeof getRelevantCorrelations;
        buildContext: typeof buildCorrelationContext;
        clearCache: typeof import("./correlation-mining.js").clearCorrelationCache;
    };
    trajectories: {
        recordWaypoint: typeof recordEmotionalWaypoint;
        getActiveArcs: typeof getActiveArcs;
        getRelevantArcs: typeof import("./emotional-trajectories.js").getRelevantArcs;
        buildContext: typeof buildEmotionalTrajectoryContext;
        clearCache: typeof import("./emotional-trajectories.js").clearArcCache;
        getEmotionalContext: typeof import("./emotional-trajectories.js").getEmotionalContext;
    };
    relationships: {
        recordMention: typeof recordPersonMention;
        recordConnection: typeof import("./relational-semantics.js").recordConnection;
        getGraph: typeof import("./relational-semantics.js").getRelationalGraph;
        getPersonInsights: typeof import("./relational-semantics.js").getPersonInsights;
        getPeopleByContext: typeof import("./relational-semantics.js").getPeopleByContext;
        getImpactfulRelationships: typeof getImpactfulRelationships;
        buildContext: typeof buildRelationalContext;
        clearCache: typeof import("./relational-semantics.js").clearRelationalCache;
    };
    counterfactual: {
        recordDecision: typeof recordDecisionPoint;
        recordFollowUp: typeof import("./counterfactual-memory.js").recordFollowUp;
        recordOutcome: typeof import("./counterfactual-memory.js").recordOutcome;
        getPendingFollowUps: typeof getPendingFollowUps;
        getRelevantPatterns: typeof import("./counterfactual-memory.js").getRelevantPatterns;
        findSimilar: typeof import("./counterfactual-memory.js").findSimilarPastDecisions;
        buildContext: typeof buildCounterfactualContext;
        clearCache: typeof import("./counterfactual-memory.js").clearCounterfactualCache;
    };
    growth: {
        recordData: typeof recordConversationData;
        getFingerprint: typeof getGrowthFingerprint;
        getComparison: typeof import("./growth-fingerprint.js").getGrowthComparison;
        buildContext: typeof buildGrowthContext;
        forceSnapshot: typeof import("./growth-fingerprint.js").forceCreateSnapshot;
        clearCache: typeof import("./growth-fingerprint.js").clearGrowthCache;
    };
    threading: {
        recordMoment: typeof recordMoment;
        getThreads: typeof import("./cross-session-threading.js").getThreads;
        getRelevantThreads: typeof import("./cross-session-threading.js").getRelevantThreads;
        getUnconsciousConnections: typeof getUnconsciousConnections;
        markSurfaced: typeof import("./cross-session-threading.js").markThreadSurfaced;
        buildContext: typeof buildThreadingContext;
        clearCache: typeof import("./cross-session-threading.js").clearThreadCache;
    };
};
export default semanticIntelligence;
//# sourceMappingURL=index.d.ts.map