/**
 * Learning Engine
 *
 * Tracks user reactions to surfaced memories and adapts future behavior.
 * The engine learns WHAT each user finds helpful vs. intrusive.
 *
 * Philosophy: "Better than human" means learning from every interaction.
 * A human friend slowly learns what topics to bring up and when.
 * We learn faster, with perfect recall of what worked.
 *
 * NOTE: Also delegates to the unified ConversationFeedbackStore for
 * cross-system analytics.
 */
import type { MemoryItem } from './advanced-retrieval.js';
/**
 * User reaction to a surfaced memory
 */
export type MemoryReaction = 'engaged' | 'acknowledged' | 'ignored' | 'negative' | 'grateful';
/**
 * A recorded memory surfacing event and user's reaction
 */
export interface SurfacingEvent {
    id: string;
    userId: string;
    memoryId: string;
    memoryType: string;
    memoryTopics: string[];
    emotionalWeight: number;
    /** How the memory was surfaced */
    surfacingMethod: 'proactive' | 'query_response' | 'association';
    /** Context when surfaced */
    conversationPhase: 'opening' | 'mid' | 'closing';
    userEmotionalState: 'positive' | 'neutral' | 'negative' | 'vulnerable';
    timeSinceSessionStart: number;
    /** User's reaction */
    reaction: MemoryReaction;
    /** Timing */
    surfacedAt: Date;
    reactedAt?: Date;
}
/**
 * Learned preferences for a user
 */
export interface UserLearnings {
    userId: string;
    /** Overall stats */
    totalSurfacings: number;
    positiveReactions: number;
    negativeReactions: number;
    /** Topic preferences (topic → engagement score 0-1) */
    topicReceptivity: Map<string, number>;
    /** Memory type preferences (type → engagement score 0-1) */
    typeReceptivity: Map<string, number>;
    /** Best conversation phases for proactive surfacing */
    preferredPhases: Map<string, number>;
    /** Emotional states where proactive surfacing worked */
    emotionalReceptivity: Map<string, number>;
    /** Timing patterns */
    averageTimeToEngage: number;
    /** Adjusted thresholds based on learning */
    adjustedThresholds: {
        minConfidence: number;
        maxProactivePerSession: number;
        emotionalSensitivity: number;
    };
    lastUpdated: Date;
}
/**
 * Learning Engine configuration
 */
export interface LearningConfig {
    /** Minimum events before adjusting thresholds */
    minEventsForLearning: number;
    /** How much each event adjusts scores (0-1) */
    learningRate: number;
    /** Decay rate for old learnings (per day) */
    learningDecay: number;
    /** Maximum adjustment to thresholds */
    maxThresholdAdjustment: number;
}
export declare class LearningEngine {
    private config;
    private userLearnings;
    private pendingEvents;
    /** Pending events older than this are auto-cleaned (30 minutes) */
    private static readonly PENDING_EVENT_TTL_MS;
    /** Cleanup interval (every 5 minutes) */
    private static readonly CLEANUP_INTERVAL_MS;
    /** Cleanup interval handle */
    private cleanupInterval;
    constructor(config?: Partial<LearningConfig>);
    /**
     * Record that a memory was surfaced (call when showing memory to user)
     * Returns event ID for later recording reaction
     */
    recordSurfacing(userId: string, memory: MemoryItem, context: {
        surfacingMethod: SurfacingEvent['surfacingMethod'];
        conversationPhase: SurfacingEvent['conversationPhase'];
        userEmotionalState: SurfacingEvent['userEmotionalState'];
        timeSinceSessionStart: number;
    }): string;
    /**
     * Record user's reaction to a surfaced memory
     */
    recordReaction(eventId: string, reaction: MemoryReaction): Promise<void>;
    /**
     * Map memory reaction to unified feedback reaction
     */
    private mapToFeedbackReaction;
    /**
     * Delegate to the unified ConversationFeedbackStore
     */
    private delegateToUnifiedStore;
    /**
     * Infer reaction from user's response
     * Called by the turn handler with user's response after memory surfacing
     */
    inferReaction(userResponse: string, changedTopic: boolean, expressedGratitude: boolean, expressedDiscomfort: boolean): MemoryReaction;
    /**
     * Update user learnings based on a surfacing event
     */
    private updateLearnings;
    /**
     * Adjust a score based on reaction
     */
    private adjustScore;
    /**
     * Adjust user's thresholds based on overall patterns
     */
    private adjustThresholds;
    /**
     * Get user's adjusted timing thresholds
     */
    getThresholds(userId: string): Promise<UserLearnings['adjustedThresholds']>;
    /**
     * Score a potential memory surfacing based on user learnings
     * Returns 0-1 score (higher = more likely to be well-received)
     */
    scoreProposedSurfacing(userId: string, memory: MemoryItem, context: {
        conversationPhase: SurfacingEvent['conversationPhase'];
        userEmotionalState: SurfacingEvent['userEmotionalState'];
    }): Promise<{
        score: number;
        factors: Record<string, number>;
        recommendation: 'surface' | 'skip' | 'defer';
    }>;
    /**
     * Get summary of what we've learned about a user
     */
    getLearningsSummary(userId: string): Promise<{
        hasLearnings: boolean;
        totalInteractions: number;
        successRate: number;
        topTopics: string[];
        avoidTopics: string[];
        bestPhase: string | null;
        thresholds: UserLearnings['adjustedThresholds'];
    }>;
    /**
     * Reinforce a memory after positive interaction
     * Called when user engages positively with a surfaced memory
     */
    reinforceMemory(userId: string, memoryId: string, reactionStrength?: number): Promise<{
        previousStrength: number;
        newStrength: number;
        boostApplied: number;
    }>;
    /**
     * Load user learnings from Firestore
     */
    private loadLearnings;
    /**
     * Persist user learnings to Firestore
     */
    private persistLearnings;
    /**
     * Persist a surfacing event for analytics
     */
    private persistEvent;
    /**
     * Start automatic cleanup of stale pending events
     */
    private startPendingEventsCleanup;
    /**
     * Stop automatic cleanup (call on shutdown)
     */
    stopPendingEventsCleanup(): void;
    /**
     * Cleanup pending events older than PENDING_EVENT_TTL_MS
     * Treats unreacted events as "ignored" for learning purposes
     */
    private cleanupStalePendingEvents;
    /**
     * Clear all pending events for a user (call on session end)
     */
    clearPendingEventsForUser(userId: string): void;
    /**
     * Apply decay to learnings (should run periodically)
     */
    decayLearnings(userId: string): Promise<void>;
    /**
     * Clear learnings for a user (for testing or user request)
     */
    clearLearnings(userId: string): Promise<void>;
}
/**
 * Get the default learning engine
 */
export declare function getLearningEngine(config?: Partial<LearningConfig>): LearningEngine;
/**
 * Reset the learning engine (for testing)
 */
export declare function resetLearningEngine(): void;
declare const _default: {
    LearningEngine: typeof LearningEngine;
    getLearningEngine: typeof getLearningEngine;
    resetLearningEngine: typeof resetLearningEngine;
};
export default _default;
//# sourceMappingURL=learning-engine.d.ts.map