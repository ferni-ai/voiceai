/**
 * Pattern Detection
 *
 * Detects patterns in user behavior that humans would miss:
 * - Weekly emotional patterns
 * - Relationship patterns
 * - Seasonal patterns
 * - Emotional cycles
 *
 * @module conversation/proactive-memory/pattern-detection
 */
import type { PatternDetection } from './types.js';
export declare class PatternDetector {
    private patterns;
    private topicsByDay;
    private topicsByHour;
    private topicsByMonth;
    private emotionsByDay;
    private peopleByTopic;
    private emotionHistory;
    /**
     * Track topic for pattern detection
     */
    trackTopic(topic: string, timestamp: Date): void;
    /**
     * Track emotion for pattern detection
     */
    trackEmotion(emotion: string, timestamp: Date): void;
    /**
     * Track people mentioned with topic
     */
    trackPeopleWithTopic(topic: string, people: string[]): void;
    /**
     * Run all pattern detection
     */
    detectPatterns(): void;
    /**
     * Detect day-of-week topic patterns
     */
    private detectDayOfWeekPatterns;
    /**
     * Detect weekly emotional patterns
     */
    private detectWeeklyEmotionalPatterns;
    /**
     * Detect relationship patterns
     */
    private detectRelationshipPatterns;
    /**
     * Detect seasonal patterns
     */
    private detectSeasonalPatterns;
    /**
     * Detect emotional cycles
     */
    private detectEmotionalCycles;
    /**
     * Get all patterns
     */
    getPatterns(): PatternDetection[];
    /**
     * Acknowledge a pattern
     */
    acknowledgePattern(type: PatternDetection['type']): void;
    /**
     * Import patterns
     */
    importPatterns(patterns: PatternDetection[]): void;
    /**
     * Export patterns
     */
    exportPatterns(): PatternDetection[];
    /**
     * Clear all data
     */
    clear(): void;
}
//# sourceMappingURL=pattern-detection.d.ts.map