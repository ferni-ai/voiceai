/**
 * Mood Tracker
 *
 * Tracks the agent's mood throughout a conversation.
 * Mood influences which humanization effects are appropriate.
 *
 * Now with Firestore persistence for emotional trajectory analysis.
 *
 * @module @ferni/conversation/deep-humanization/mood-tracker
 */
import type { ConversationMood } from './types.js';
/**
 * Per-turn emotional snapshot
 */
export interface EmotionalSnapshot {
    turn: number;
    timestamp: string;
    energy: number;
    engagement: number;
    emotionalLoad: number;
    inEmotionalMoment: boolean;
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
}
/**
 * Session emotional trajectory
 */
export interface EmotionalTrajectory {
    sessionId: string;
    userId: string;
    personaId: string;
    startedAt: string;
    endedAt?: string;
    snapshots: EmotionalSnapshot[];
    summary?: {
        peakEnergy: number;
        lowestEnergy: number;
        peakEmotionalLoad: number;
        emotionalMomentCount: number;
        dominantEmotion?: string;
        trend: 'improving' | 'declining' | 'stable';
    };
}
export declare class MoodTracker {
    private mood;
    private turnCount;
    private sessionId?;
    private userId?;
    private personaId?;
    private startedAt;
    private snapshots;
    private emotionCounts;
    constructor();
    /**
     * Initialize with session metadata for persistence
     */
    initializeSession(sessionId: string, userId: string, personaId: string): void;
    private getInitialMood;
    /**
     * Update mood based on conversation dynamics
     */
    update(context: {
        userEmotion?: string;
        topicWeight?: 'light' | 'medium' | 'heavy';
        userEngagement?: 'low' | 'medium' | 'high';
        turnCount: number;
    }): void;
    /**
     * Record per-turn emotional snapshot
     */
    private recordSnapshot;
    /**
     * Get current mood state
     */
    getMood(): ConversationMood;
    /**
     * Check if mood suggests we should be playful
     */
    canBePlayful(): boolean;
    /**
     * Check if mood suggests we should be supportive
     */
    needsSupport(): boolean;
    /**
     * Check if energy is high enough for enthusiastic reactions
     */
    hasHighEnergy(): boolean;
    /**
     * Check if we're in late session (energy naturally lower)
     */
    isLateSession(): boolean;
    /**
     * Reset for new session
     */
    reset(): void;
    /**
     * Get emotional trajectory for this session
     */
    getTrajectory(): EmotionalTrajectory | null;
    /**
     * Calculate summary statistics from snapshots
     */
    private calculateSummary;
    /**
     * Persist emotional trajectory to Firestore
     */
    persistTrajectory(): Promise<boolean>;
    /**
     * Get snapshots for debugging/analysis
     */
    getSnapshots(): EmotionalSnapshot[];
}
export declare function getMoodTracker(personaId: string): MoodTracker;
/**
 * Initialize mood tracker with session metadata
 */
export declare function initializeMoodTracker(personaId: string, sessionId: string, userId: string): MoodTracker;
/**
 * Reset mood tracker and persist trajectory to Firestore
 */
export declare function resetMoodTrackerWithPersistence(personaId: string): Promise<void>;
/**
 * Reset mood tracker without persistence (for quick cleanup)
 */
export declare function resetMoodTracker(personaId: string): void;
/**
 * Reset all mood trackers (with optional persistence)
 */
export declare function resetAllMoodTrackers(persist?: boolean): Promise<void>;
/**
 * Get recent emotional trajectories for a user
 */
export declare function getRecentTrajectories(userId: string, limit?: number): Promise<EmotionalTrajectory[]>;
//# sourceMappingURL=mood-tracker.d.ts.map