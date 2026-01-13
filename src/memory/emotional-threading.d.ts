/**
 * Emotional Threading
 *
 * Tracks emotional continuity across sessions.
 * Ensures that emotional topics are followed up appropriately.
 *
 * Philosophy: When you reconnect with a friend after they shared something heavy,
 * you don't just start chatting about the weather. You acknowledge what they
 * were going through. This module tracks emotional threads so Ferni can do the same.
 *
 * @module memory/emotional-threading
 */
import type { EmotionalThreadingService, EmotionalThread, SessionEmotionalContext } from './interfaces/index.js';
interface ThreadingConfig {
    /** Days before an unresolved thread becomes stale (default: 30) */
    staleThreadDays: number;
    /** Maximum threads to track per user (default: 10) */
    maxThreadsPerUser: number;
    /** Minimum intensity to create a thread (default: 0.4) */
    minIntensityForThread: number;
    /** Sessions to consider for trajectory (default: 5) */
    trajectorySessionCount: number;
}
interface UserEmotionalData {
    threads: EmotionalThread[];
    sessionHistory: Array<{
        sessionId: string;
        timestamp: Date;
        dominantEmotion: string;
        endState: SessionEmotionalContext['lastSessionEndState'];
        intensity: number;
    }>;
    lastSessionEndState: SessionEmotionalContext['lastSessionEndState'];
    lastSessionTimestamp: Date;
}
export declare class EmotionalThreading implements EmotionalThreadingService {
    private config;
    private userData;
    constructor(config?: Partial<ThreadingConfig>);
    /**
     * Record session end state and any unresolved emotions
     */
    recordSessionEnd(context: {
        userId: string;
        sessionId: string;
        dominantEmotion: string;
        endState: SessionEmotionalContext['lastSessionEndState'];
        unresolvedTopics: string[];
        intensity?: number;
    }): Promise<void>;
    /**
     * Get session emotional context for a user
     */
    getSessionContext(userId: string): Promise<SessionEmotionalContext>;
    /**
     * Update a thread's status or add progress notes
     */
    updateThread(userId: string, threadId: string, update: Partial<EmotionalThread>): Promise<void>;
    /**
     * Mark a thread as resolved
     */
    resolveThread(userId: string, threadId: string, resolution: string): Promise<void>;
    /**
     * Get or create user data
     */
    private getOrCreateUserData;
    /**
     * Create or update an emotional thread
     */
    private createOrUpdateThread;
    /**
     * Get active (non-stale, non-resolved) threads
     */
    private getActiveThreads;
    /**
     * Calculate emotional trajectory from session history
     */
    private calculateTrajectory;
    /**
     * Determine suggested approach based on context
     */
    private determineSuggestedApproach;
    /**
     * Get default context for new users
     */
    private getDefaultContext;
    export(): Array<[string, UserEmotionalData]>;
    import(data: Array<[string, UserEmotionalData]>): void;
    /**
     * Get stats for a user
     */
    getStats(userId: string): {
        activeThreads: number;
        resolvedThreads: number;
        sessionCount: number;
        trajectory: SessionEmotionalContext['recentTrajectory'];
    };
}
export declare function getEmotionalThreading(): EmotionalThreading;
export declare function resetEmotionalThreading(): void;
declare const _default: {
    EmotionalThreading: typeof EmotionalThreading;
    getEmotionalThreading: typeof getEmotionalThreading;
    resetEmotionalThreading: typeof resetEmotionalThreading;
};
export default _default;
//# sourceMappingURL=emotional-threading.d.ts.map