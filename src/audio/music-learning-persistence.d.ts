/**
 * Music Learning Persistence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Persists music learning data to Firestore so it survives server restarts:
 * - User transition profiles (Thompson Sampling arms)
 * - Music memories (what music helped in what situations)
 * - Analytics data (optional - can be too large for Firestore)
 *
 * Storage Strategy:
 * - bogle_users/{userId}/music_learning/profile - User transition profile
 * - bogle_users/{userId}/music_learning/memories - Music memories
 *
 * @module MusicLearningPersistence
 */
/**
 * Ensure user's transition profile is loaded from persistence
 */
export declare function ensureProfileLoaded(userId: string): Promise<void>;
/**
 * Ensure user's music memories are loaded from persistence
 */
export declare function ensureMemoriesLoaded(userId: string): Promise<void>;
/**
 * Ensure all music learning data is loaded for a user
 */
export declare function ensureMusicLearningLoaded(userId: string): Promise<void>;
/**
 * Check if music learning data is already loaded for a user (sync check)
 *
 * Use this to check before using learned preferences - if not loaded yet,
 * the transition system will fall back to base behavior.
 */
export declare function isMusicLearningLoaded(userId: string): boolean;
/**
 * Save user's transition profile (queued for batch write)
 */
export declare function saveProfile(userId: string): void;
/**
 * Save user's music memories (queued for batch write)
 */
export declare function saveMemories(userId: string): void;
/**
 * Save all music learning data for a user
 */
export declare function saveMusicLearning(userId: string): void;
/**
 * Save and flush immediately (use on session end)
 */
export declare function flushMusicLearning(userId: string): Promise<void>;
/**
 * Flush all pending changes
 */
export declare function flushAllMusicLearning(): Promise<void>;
/**
 * Clear cached data for a user (for testing)
 */
export declare function clearUserCache(userId: string): void;
/**
 * Shutdown persistence (call on server shutdown)
 */
export declare function shutdownMusicLearningPersistence(): Promise<void>;
/**
 * Get persistence stats
 */
export declare function getMusicLearningStats(): {
    profiles: {
        cached: number;
        dirty: number;
    };
    memories: {
        cached: number;
        dirty: number;
    };
    loadedUsers: {
        profiles: number;
        memories: number;
    };
};
/**
 * Hook to call after recording transition feedback
 * This ensures the updated Thompson Sampling state is persisted
 */
export declare function onTransitionFeedbackRecorded(userId: string): void;
/**
 * Hook to call after storing a music memory
 */
export declare function onMusicMemoryStored(userId: string): void;
declare const _default: {
    ensureProfileLoaded: typeof ensureProfileLoaded;
    ensureMemoriesLoaded: typeof ensureMemoriesLoaded;
    ensureMusicLearningLoaded: typeof ensureMusicLearningLoaded;
    saveProfile: typeof saveProfile;
    saveMemories: typeof saveMemories;
    saveMusicLearning: typeof saveMusicLearning;
    flushMusicLearning: typeof flushMusicLearning;
    flushAllMusicLearning: typeof flushAllMusicLearning;
    clearUserCache: typeof clearUserCache;
    shutdownMusicLearningPersistence: typeof shutdownMusicLearningPersistence;
    getMusicLearningStats: typeof getMusicLearningStats;
    onTransitionFeedbackRecorded: typeof onTransitionFeedbackRecorded;
    onMusicMemoryStored: typeof onMusicMemoryStored;
};
export default _default;
//# sourceMappingURL=music-learning-persistence.d.ts.map