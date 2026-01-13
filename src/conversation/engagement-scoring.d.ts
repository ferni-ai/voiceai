/**
 * Real-Time Engagement Scoring
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks whether the user is present and engaged, or becoming distracted.
 * Real humans notice when someone's attention drifts. This module gives
 * Ferni that awareness to adjust accordingly.
 *
 * Engagement signals:
 * - Response latency (faster = more engaged)
 * - Response length trends
 * - Question asking (engaged users ask questions)
 * - Topic continuity
 * - Backchanneling responsiveness
 *
 * @module EngagementScoring
 */
export type EngagementLevel = 'high' | 'medium' | 'low' | 'distracted';
export type EngagementAction = 'continue' | 'check_in' | 'shift_topic' | 'wrap_up' | 'energize';
export interface EngagementObservation {
    timestamp: number;
    /** Response latency from agent's last message (ms) */
    responseLatencyMs: number;
    /** Word count in user's response */
    wordCount: number;
    /** Did user ask a question? */
    askedQuestion: boolean;
    /** Is response on-topic? */
    onTopic: boolean;
    /** Any engagement phrases ("interesting", "tell me more") */
    engagementPhrases: number;
    /** Disengagement phrases ("uh huh", "sure", "okay") */
    disengagementPhrases: number;
}
export interface EngagementSignals {
    /** Average response latency trend */
    latencyTrend: 'faster' | 'slower' | 'stable';
    /** Response length trend */
    lengthTrend: 'longer' | 'shorter' | 'stable';
    /** Question asking rate (per 5 turns) */
    questionRate: number;
    /** Topic continuity (0-1) */
    topicContinuity: number;
    /** Backchannel-only response rate */
    backchannelRate: number;
}
export interface EngagementScoringResult {
    /** Current engagement level */
    level: EngagementLevel;
    /** Numeric score (0-1) */
    score: number;
    /** Underlying signals */
    signals: EngagementSignals;
    /** Is engagement declining? */
    declining: boolean;
    /** Suggested action */
    suggestedAction: EngagementAction;
    /** Specific guidance for agent */
    actionGuidance: string;
    /** Confidence (0-1) */
    confidence: number;
}
export declare class EngagementScorer {
    private observations;
    private readonly maxObservations;
    private lastAgentMessageTime;
    private topicKeywords;
    constructor();
    /**
     * Record an observation when user responds
     */
    recordResponse(text: string, options?: {
        lastAgentMessageTime?: number;
        currentTopic?: string;
    }): EngagementScoringResult;
    /**
     * Record when agent sends a message (for latency calculation)
     */
    recordAgentMessage(): void;
    /**
     * Get current engagement state without new observation
     */
    getCurrentEngagement(): EngagementScoringResult;
    /**
     * Reset scorer
     */
    reset(): void;
    private computeEngagement;
    private calculateSignals;
    private detectDecline;
    private calculateHalfScore;
    private determineAction;
    private checkTopicContinuity;
    private updateTopicKeywords;
    private getDefaultResult;
}
export declare function getEngagementScorer(sessionId: string): EngagementScorer;
export declare function resetEngagementScorer(sessionId: string): void;
export declare function resetAllEngagementScorers(): void;
export declare function getActiveEngagementScorerCount(): number;
export default EngagementScorer;
//# sourceMappingURL=engagement-scoring.d.ts.map