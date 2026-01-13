/**
 * Sentiment Timeline
 *
 * Tracks emotional journey over time, creating a visual
 * history of mood patterns, peaks, valleys, and growth.
 *
 * Philosophy: Seeing your emotional journey helps you
 * understand yourself. Patterns become visible over time.
 *
 * Features:
 * - Daily emotional snapshots
 * - Trend detection (improving, stable, declining)
 * - Peak/valley identification
 * - Correlation with life events
 * - Exportable for therapy/coaching
 *
 * @module SentimentTimeline
 */
export type EmotionCategory = 'joy' | 'sadness' | 'anxiety' | 'anger' | 'fear' | 'surprise' | 'disgust' | 'trust' | 'anticipation' | 'neutral';
export interface EmotionalSnapshot {
    id: string;
    timestamp: Date;
    primaryEmotion: EmotionCategory;
    secondaryEmotions: EmotionCategory[];
    intensity: number;
    valence: number;
    arousal: number;
    context?: {
        topic?: string;
        trigger?: string;
        lifeEventId?: string;
    };
    source: 'detected' | 'self_reported' | 'voice_analysis';
}
export interface DailyMoodSummary {
    date: Date;
    avgValence: number;
    avgArousal: number;
    dominantEmotion: EmotionCategory;
    emotionDistribution: Record<EmotionCategory, number>;
    snapshotCount: number;
    notable?: string;
}
export interface TimelineTrend {
    period: 'week' | 'month' | 'quarter';
    startValence: number;
    endValence: number;
    change: number;
    direction: 'improving' | 'stable' | 'declining';
    volatility: number;
}
export interface EmotionalPeak {
    type: 'peak' | 'valley';
    date: Date;
    valence: number;
    emotion: EmotionCategory;
    context?: string;
    duration: number;
    recovery?: number;
}
export interface SentimentTimeline {
    userId: string;
    snapshots: EmotionalSnapshot[];
    dailySummaries: DailyMoodSummary[];
    trends: TimelineTrend[];
    peaks: EmotionalPeak[];
    currentMood: EmotionalSnapshot | null;
    baselineValence: number;
    baselineArousal: number;
    patterns: EmotionalPattern[];
    lastUpdated: Date;
}
export interface EmotionalPattern {
    id: string;
    type: 'recurring' | 'cyclical' | 'triggered' | 'growth';
    description: string;
    frequency?: string;
    trigger?: string;
    confidence: number;
}
/**
 * Record an emotional snapshot
 */
export declare function recordEmotionalSnapshot(userId: string, snapshot: Omit<EmotionalSnapshot, 'id' | 'timestamp' | 'valence' | 'arousal'>): EmotionalSnapshot;
/**
 * Get timeline
 */
export declare function getTimeline(userId: string): SentimentTimeline | null;
/**
 * Get current mood context
 */
export declare function getCurrentMoodContext(userId: string): string | null;
/**
 * Get recent peaks and valleys
 */
export declare function getRecentPeaksValleys(userId: string, limit?: number): EmotionalPeak[];
/**
 * Get patterns for sharing
 */
export declare function getInsightfulPatterns(userId: string): EmotionalPattern[];
/**
 * Export timeline for therapy/coaching
 */
export declare function exportTimelineData(userId: string, period?: 'week' | 'month' | 'quarter' | 'all'): {
    summaries: DailyMoodSummary[];
    trends: TimelineTrend[];
    peaks: EmotionalPeak[];
    patterns: EmotionalPattern[];
} | null;
/**
 * Generate timeline summary for context injection
 */
export declare function generateTimelineSummary(userId: string): string | null;
declare const _default: {
    recordEmotionalSnapshot: typeof recordEmotionalSnapshot;
    getTimeline: typeof getTimeline;
    getCurrentMoodContext: typeof getCurrentMoodContext;
    getRecentPeaksValleys: typeof getRecentPeaksValleys;
    getInsightfulPatterns: typeof getInsightfulPatterns;
    exportTimelineData: typeof exportTimelineData;
    generateTimelineSummary: typeof generateTimelineSummary;
};
export default _default;
//# sourceMappingURL=sentiment-timeline.d.ts.map