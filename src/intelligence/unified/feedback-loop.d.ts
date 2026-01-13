/**
 * Naturalness Feedback Loop
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module creates a feedback loop that helps us learn what makes
 * responses feel natural and human. It:
 * 1. Tracks which context builders contributed to each response
 * 2. Monitors user reactions (engagement, emotional shift, continuation)
 * 3. Adjusts builder weights based on what works
 *
 * Over time, this helps Ferni get better at being human.
 *
 * @module intelligence/unified/feedback-loop
 */
import type { UnifiedAnalysisResult } from './unified-analyzer.js';
import type { HumanizationResult } from './humanization-orchestrator.js';
export interface ResponseContext {
    /** Unique ID for this turn */
    turnId: string;
    /** Session ID */
    sessionId: string;
    /** User ID */
    userId: string;
    /** The unified analysis that informed this response */
    analysis: UnifiedAnalysisResult;
    /** The humanization applied */
    humanization: HumanizationResult;
    /** Which context builders contributed */
    buildersUsed: string[];
    /** The final response generated */
    response: string;
    /** Timestamp */
    timestamp: Date;
}
export interface UserReaction {
    /** Did the user continue the conversation? */
    continuedConversation: boolean;
    /** Did the user's emotional state improve? */
    emotionalShift: 'improved' | 'stable' | 'declined' | 'unknown';
    /** Did the user open up more? */
    openedUpMore: boolean;
    /** Did the user ask a follow-up question? */
    askedFollowUp: boolean;
    /** Was there a topic shift (might indicate disengagement)? */
    topicShift: boolean;
    /** Response length (short might indicate disengagement) */
    responseLength: 'short' | 'medium' | 'long';
    /** Time to respond (long might indicate thinking or disengagement) */
    responseTimeMs: number;
}
export interface NaturalnessSignal {
    /** The turn this signal is about */
    turnId: string;
    /** Context that was used */
    context: ResponseContext;
    /** User reaction */
    reaction: UserReaction;
    /** Computed naturalness score (0-1) */
    naturalnessScore: number;
    /** What worked well */
    positiveSignals: string[];
    /** What might have been better */
    negativeSignals: string[];
}
export interface BuilderEffectiveness {
    /** Builder name */
    builderName: string;
    /** Number of times used */
    usageCount: number;
    /** Average naturalness score when used */
    avgNaturalnessScore: number;
    /** Correlation with positive reactions */
    positiveCorrelation: number;
    /** Recommended weight adjustment */
    weightAdjustment: 'increase' | 'maintain' | 'decrease' | 'unknown';
}
export declare class NaturalnessFeedbackLoop {
    private static instance;
    private recentSignals;
    private builderStats;
    static getInstance(): NaturalnessFeedbackLoop;
    /**
     * Record a response context for later feedback
     */
    recordResponseContext(context: ResponseContext): void;
    /**
     * Record user reaction to a response
     */
    recordUserReaction(turnId: string, reaction: UserReaction): NaturalnessSignal | null;
    /**
     * Get effectiveness report for all builders
     */
    getBuilderEffectiveness(): BuilderEffectiveness[];
    /**
     * Get recommendations for improving naturalness
     */
    getRecommendations(): string[];
    private computeNaturalnessScore;
    private analyzeSignals;
    private updateBuilderStats;
}
/**
 * Record response context for feedback
 */
export declare function recordResponse(context: ResponseContext): void;
/**
 * Record user reaction
 */
export declare function recordReaction(turnId: string, reaction: UserReaction): NaturalnessSignal | null;
/**
 * Get builder effectiveness report
 */
export declare function getEffectivenessReport(): BuilderEffectiveness[];
/**
 * Get recommendations for improvement
 */
export declare function getRecommendations(): string[];
export default NaturalnessFeedbackLoop;
//# sourceMappingURL=feedback-loop.d.ts.map