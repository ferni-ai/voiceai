/**
 * User Engagement Detection
 *
 * Detects user engagement level from conversation patterns.
 *
 * @module intelligence/human-behaviors/engagement-detection
 */
export interface EngagementSignals {
    level: 'highly_engaged' | 'engaged' | 'neutral' | 'disengaged' | 'checked_out';
    indicators: string[];
    suggestions: string[];
}
/**
 * Detect user engagement level from conversation patterns
 */
export declare function detectUserEngagement(recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    lengthMs?: number;
}>, _averageResponseTime?: number): EngagementSignals;
export default detectUserEngagement;
//# sourceMappingURL=engagement-detection.d.ts.map