/**
 * Topic Tracking Service
 *
 * Tracks topics discussed with each persona for memory callbacks
 * and proactive memory surfacing.
 *
 * Persists to user profile for cross-session continuity.
 */
export interface TrackedTopic {
    topic: string;
    discussedAt: Date;
    emotionalContext?: string;
    significance: 'casual' | 'important' | 'breakthrough';
    resolved?: boolean;
}
export interface TopicTrackingContext {
    userId: string;
    personaId: string;
}
/**
 * Track a topic discussed in conversation
 * Persists to Firestore for cross-session memory
 */
export declare function trackTopic(userId: string, personaId: string, topic: string, options?: {
    emotionalContext?: string;
    significance?: 'casual' | 'important' | 'breakthrough';
    resolved?: boolean;
}): Promise<void>;
/**
 * Get recent topics for a user-persona pair
 * Loads from profile if not in cache
 */
export declare function getRecentTopics(userId: string, personaId: string, limit?: number): Promise<TrackedTopic[]>;
/**
 * Get the last topic discussed
 */
export declare function getLastTopic(userId: string, personaId: string): Promise<TrackedTopic | null>;
/**
 * Get unresolved/open topics
 */
export declare function getOpenTopics(userId: string, personaId: string): Promise<TrackedTopic[]>;
/**
 * Get important topics (for memory callbacks)
 */
export declare function getImportantTopics(userId: string, personaId: string): Promise<TrackedTopic[]>;
/**
 * Find topics by keyword
 */
export declare function findTopicsByKeyword(userId: string, personaId: string, keyword: string): Promise<TrackedTopic[]>;
/**
 * Mark a topic as resolved
 */
export declare function markTopicResolved(userId: string, personaId: string, topic: string): Promise<void>;
/**
 * Get topic for proactive memory surfacing
 * Returns an old topic worth bringing up
 */
export declare function getTopicForProactiveMemory(userId: string, personaId: string): Promise<TrackedTopic | null>;
/**
 * Load topics from user profile (for initialization)
 */
export declare function loadTopicsFromProfile(userId: string, personaId: string, topics: TrackedTopic[]): void;
/**
 * Get all topics for saving to profile
 */
export declare function getTopicsForSaving(userId: string, personaId: string): TrackedTopic[];
/**
 * Clear topic history
 */
export declare function clearTopicHistory(userId: string, personaId?: string): Promise<void>;
/**
 * Force immediate persistence (for graceful shutdown)
 */
export declare function flushTopicPersistence(): Promise<void>;
/**
 * Get cache statistics for monitoring.
 */
export declare function getTopicTrackingStats(): {
    users: number;
    entries: number;
};
/**
 * Clear ALL cached data (for shutdown).
 */
export declare function clearAllTopicHistory(): void;
/**
 * Register with SessionDataManager (call during initialization).
 */
export declare function registerTopicTrackingWithSessionManager(): Promise<void>;
export declare const TopicTrackingService: {
    track: typeof trackTopic;
    getRecent: typeof getRecentTopics;
    getLast: typeof getLastTopic;
    getOpen: typeof getOpenTopics;
    getImportant: typeof getImportantTopics;
    findByKeyword: typeof findTopicsByKeyword;
    markResolved: typeof markTopicResolved;
    getProactiveMemory: typeof getTopicForProactiveMemory;
    loadFromProfile: typeof loadTopicsFromProfile;
    getForSaving: typeof getTopicsForSaving;
    clear: typeof clearTopicHistory;
    flush: typeof flushTopicPersistence;
    getStats: typeof getTopicTrackingStats;
    clearAll: typeof clearAllTopicHistory;
    registerWithSessionManager: typeof registerTopicTrackingWithSessionManager;
};
export default TopicTrackingService;
//# sourceMappingURL=topic-tracking.d.ts.map