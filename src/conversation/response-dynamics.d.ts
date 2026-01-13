/**
 * Response Dynamics
 *
 * Dynamically adapts response characteristics based on user behavior.
 *
 * Features:
 * - Response length adaptation (mirror user verbosity)
 * - Topic transition phrases (smooth topic changes)
 * - Pacing detection (rushed vs relaxed user)
 * - Turn-taking optimization
 */
export interface UserEngagementMetrics {
    avgWordCount: number;
    recentWordCounts: number[];
    avgResponseTimeMs: number;
    questionsAsked: number;
    detailedResponses: number;
    shortResponses: number;
    isRushed: boolean;
    isRelaxed: boolean;
    interruptions: number;
    longestTurnWords: number;
}
export interface ResponseLengthRecommendation {
    targetWordCount: number;
    range: {
        min: number;
        max: number;
    };
    rationale: string;
    shouldAbbreviate: boolean;
    shouldElaborate: boolean;
}
export interface TopicTransition {
    type: 'smooth' | 'acknowledgment' | 'redirect' | 'callback';
    phrase: string;
    fromTopic?: string;
    toTopic?: string;
}
export interface PacingAnalysis {
    userPacing: 'rushed' | 'normal' | 'relaxed' | 'unknown';
    confidence: number;
    suggestedAgentPacing: 'faster' | 'normal' | 'slower';
    timeOfDayFactor: 'morning' | 'afternoon' | 'evening' | 'night';
}
export declare class ResponseDynamicsEngine {
    private messageHistory;
    private interruptionCount;
    private readonly maxHistory;
    constructor();
    /**
     * Record a message for analysis
     */
    recordMessage(role: 'user' | 'agent', text: string, topics?: string[]): void;
    /**
     * Record an interruption
     */
    recordInterruption(): void;
    /**
     * Get response length recommendation
     */
    getResponseLengthRecommendation(): ResponseLengthRecommendation;
    /**
     * Get a topic transition phrase
     */
    getTopicTransition(fromTopic: string | null, toTopic: string | null, transitionType?: TopicTransition['type']): TopicTransition;
    /**
     * Get pacing analysis
     */
    getPacingAnalysis(): PacingAnalysis;
    /**
     * Get engagement metrics
     */
    getEngagementMetrics(): UserEngagementMetrics;
    /**
     * Get length guidance string for LLM prompt
     */
    getLengthGuidance(): string;
    /**
     * Reset for new session
     */
    reset(): void;
    private calculateTrend;
    private calculateAvgResponseTime;
    private generateLengthRationale;
    private determineTransitionType;
    private generateTransitionPhrase;
    private getTimeOfDay;
}
export declare function getResponseDynamicsEngine(): ResponseDynamicsEngine;
export declare function resetResponseDynamicsEngine(): void;
export default ResponseDynamicsEngine;
//# sourceMappingURL=response-dynamics.d.ts.map