/**
 * Emotional Data Collection
 *
 * Records and manages emotional data points from conversations.
 * This data feeds into pattern analysis for superhuman observations.
 *
 * @module personality/emotional-data
 */
/**
 * Configuration constants for emotional data collection
 */
export declare const EMOTIONAL_DATA_CONFIG: {
    /** Maximum emotional data points to keep per user */
    readonly MAX_DATA_POINTS_PER_USER: 100;
    /** Minimum history needed for pattern analysis */
    readonly MIN_HISTORY_FOR_PATTERNS: 5;
};
export type EmotionalTrend = 'improving' | 'declining' | 'cyclical' | 'triggered' | 'stable';
export interface EmotionalDataPoint {
    timestamp: Date;
    emotion: string;
    intensity: number;
    topics: string[];
    context?: string;
}
/**
 * In-memory emotional history per user
 * Used for fast pattern detection; also persisted to Firestore
 */
declare const emotionalHistory: Map<string, EmotionalDataPoint[]>;
/**
 * Record an emotional data point from a conversation
 */
export declare function recordEmotionalDataPoint(userId: string, emotion: string, intensity: number, topics: string[], context?: string): void;
/**
 * Get emotional history for a user
 */
export declare function getEmotionalHistory(userId: string): EmotionalDataPoint[];
/**
 * Check if user has enough history for pattern analysis
 */
export declare function hasEnoughHistoryForPatterns(userId: string): boolean;
/**
 * Clear emotional data for a specific user
 * Call this on session end to prevent memory leaks
 */
export declare function clearUserEmotionalData(userId: string): void;
/**
 * Clear all emotional data (for testing or server restart)
 */
export declare function clearAllEmotionalData(): void;
/**
 * Get memory stats for monitoring
 */
export declare function getEmotionalDataStats(): {
    userCount: number;
    totalDataPoints: number;
    averagePointsPerUser: number;
};
export { emotionalHistory };
//# sourceMappingURL=emotional-data.d.ts.map