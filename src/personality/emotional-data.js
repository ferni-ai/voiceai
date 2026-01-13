/**
 * Emotional Data Collection
 *
 * Records and manages emotional data points from conversations.
 * This data feeds into pattern analysis for superhuman observations.
 *
 * @module personality/emotional-data
 */
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'EmotionalData' });
// ============================================================================
// CONFIGURATION
// ============================================================================
/**
 * Configuration constants for emotional data collection
 */
export const EMOTIONAL_DATA_CONFIG = {
    /** Maximum emotional data points to keep per user */
    MAX_DATA_POINTS_PER_USER: 100,
    /** Minimum history needed for pattern analysis */
    MIN_HISTORY_FOR_PATTERNS: 5,
};
// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================
/**
 * In-memory emotional history per user
 * Used for fast pattern detection; also persisted to Firestore
 */
const emotionalHistory = new Map();
// ============================================================================
// DATA COLLECTION
// ============================================================================
/**
 * Record an emotional data point from a conversation
 */
export function recordEmotionalDataPoint(userId, emotion, intensity, topics, context) {
    const dataPoint = {
        timestamp: new Date(),
        emotion,
        intensity,
        topics,
        context,
    };
    const history = emotionalHistory.get(userId) || [];
    history.push(dataPoint);
    // Keep last N data points per user
    if (history.length > EMOTIONAL_DATA_CONFIG.MAX_DATA_POINTS_PER_USER) {
        history.shift();
    }
    emotionalHistory.set(userId, history);
    log.debug({ userId, emotion, topics }, 'Recorded emotional data point');
}
/**
 * Get emotional history for a user
 */
export function getEmotionalHistory(userId) {
    return emotionalHistory.get(userId) || [];
}
/**
 * Check if user has enough history for pattern analysis
 */
export function hasEnoughHistoryForPatterns(userId) {
    const history = emotionalHistory.get(userId);
    return !!history && history.length >= EMOTIONAL_DATA_CONFIG.MIN_HISTORY_FOR_PATTERNS;
}
// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================
/**
 * Clear emotional data for a specific user
 * Call this on session end to prevent memory leaks
 */
export function clearUserEmotionalData(userId) {
    emotionalHistory.delete(userId);
    log.debug({ userId }, 'Cleared emotional data for user');
}
/**
 * Clear all emotional data (for testing or server restart)
 */
export function clearAllEmotionalData() {
    emotionalHistory.clear();
    log.info('Cleared all emotional data');
}
/**
 * Get memory stats for monitoring
 */
export function getEmotionalDataStats() {
    let totalDataPoints = 0;
    for (const history of emotionalHistory.values()) {
        totalDataPoints += history.length;
    }
    const userCount = emotionalHistory.size;
    return {
        userCount,
        totalDataPoints,
        averagePointsPerUser: userCount > 0 ? totalDataPoints / userCount : 0,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export { emotionalHistory };
//# sourceMappingURL=emotional-data.js.map