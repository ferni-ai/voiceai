/**
 * Interaction Pattern Analyzer
 *
 * Analyzes user interaction patterns to discover:
 * - Tool co-occurrence (which tools are used together)
 * - User journeys (common sequences of tool usage)
 * - Gaps (what users try to do but can't)
 * - Consolidation opportunities (tools that should be merged)
 * - User segments (different usage patterns by user type)
 *
 * This powers the automated recommendation and experimentation system.
 */
import type { FeedbackRecord } from './feedback-collector.js';
export type { ToolCoOccurrence, ToolSequence, UserJourney, GapAnalysis, ConsolidationOpportunity, UserSegment, SessionData, } from '../../types/optimization-types.js';
import type { ToolCoOccurrence, ToolSequence, UserJourney, GapAnalysis, ConsolidationOpportunity } from '../../types/optimization-types.js';
export declare class PatternAnalyzer {
    private sessions;
    private completedSessions;
    private coOccurrenceMatrix;
    private sequenceCache;
    private lastAnalysisTime;
    private readonly ANALYSIS_CACHE_TTL;
    /**
     * Start tracking a session
     */
    startSession(sessionId: string, userId: string, agentId: string): void;
    /**
     * Record a tool call in a session
     */
    recordToolCall(sessionId: string, toolId: string, success: boolean, latencyMs: number): void;
    /**
     * Add feedback to a session
     */
    addFeedback(sessionId: string, feedback: FeedbackRecord): void;
    /**
     * End a session
     */
    endSession(sessionId: string): void;
    /**
     * Update co-occurrence matrix when tools are used in same session
     */
    private updateCoOccurrence;
    /**
     * Get tool co-occurrences above threshold
     */
    getCoOccurrences(minCount?: number): ToolCoOccurrence[];
    private calculateAvgGap;
    private calculateCorrelation;
    /**
     * Discover common tool sequences
     */
    discoverSequences(minLength?: number, maxLength?: number, minCount?: number): ToolSequence[];
    /**
     * Identify common user journeys
     */
    identifyJourneys(): UserJourney[];
    private clusterSequences;
    private generateJourneyName;
    /**
     * Identify gaps in tool coverage
     */
    analyzeGaps(featureRequests: Array<{
        capability: string;
        count: number;
        examples: string[];
    }>): GapAnalysis[];
    private categorizeGap;
    private suggestToolName;
    /**
     * Find tools that should be consolidated
     */
    findConsolidationOpportunities(): ConsolidationOpportunity[];
    private suggestConsolidatedName;
    /**
     * Generate comprehensive pattern report
     */
    generateReport(): string;
}
export declare const patternAnalyzer: PatternAnalyzer;
export default patternAnalyzer;
//# sourceMappingURL=pattern-analyzer.d.ts.map