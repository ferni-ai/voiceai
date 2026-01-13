/**
 * Humanization Analytics
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Track and analyze humanization feature performance:
 * - Which features are applied most/least
 * - User response to humanization (engagement metrics)
 * - A/B testing for fine-tuning
 * - Quality metrics for each feature
 *
 * @module @ferni/humanization/analytics
 */
export interface HumanizationEvent {
    type: HumanizationEventType;
    feature: HumanizationFeature;
    sessionId: string;
    userId?: string;
    timestamp: Date;
    data?: Record<string, unknown>;
    turnCount?: number;
    comfortLevel?: number;
    emotionalContext?: string;
}
export type HumanizationEventType = 'applied' | 'skipped' | 'triggered' | 'acknowledged';
export type HumanizationFeature = 'voice_print_detection' | 'cross_session_acknowledgment' | 'breathing_sync' | 'emotional_leading' | 'ambient_acknowledgment' | 'self_correction' | 'disfluency' | 'filler_words' | 'hedging' | 'catching_yourself' | 'phonetic_mirroring' | 'vocal_fatigue' | 'comfort_progression';
export interface FeatureStats {
    feature: HumanizationFeature;
    totalApplied: number;
    totalSkipped: number;
    totalTriggered: number;
    totalAcknowledged: number;
    applicationRate: number;
    acknowledgmentRate: number;
    avgTimeBetweenApplications: number;
    lastApplied: Date | null;
    byEmotionalContext: Record<string, number>;
    byComfortLevel: Record<string, number>;
}
export interface SessionAnalytics {
    sessionId: string;
    userId?: string;
    startTime: Date;
    endTime?: Date;
    totalHumanizations: number;
    uniqueFeaturesUsed: number;
    avgHumanizationsPerTurn: number;
    featureStats: Map<HumanizationFeature, FeatureStats>;
    userEngagementScore: number;
    conversationLengthFactor: number;
    breathingSyncQuality: number[];
    avgBreathingSyncQuality: number;
    voicePrintCalibrated: boolean;
    voiceStateInsightsGiven: number;
    crossSessionAcknowledgmentsGiven: number;
}
export interface GlobalAnalytics {
    totalSessions: number;
    totalHumanizations: number;
    featureUsage: Map<HumanizationFeature, number>;
    topFeatures: HumanizationFeature[];
    underutilizedFeatures: HumanizationFeature[];
    avgEngagementScore: number;
    avgBreathingSyncQuality: number;
    voicePrintCalibrationRate: number;
    humanizationsPerHour: number;
    peakHours: number[];
}
declare class HumanizationAnalyticsEngine {
    private events;
    private sessionStats;
    private maxEventsInMemory;
    constructor();
    /**
     * Record a humanization event
     */
    recordEvent(event: Omit<HumanizationEvent, 'timestamp'>): void;
    /**
     * Record that a feature was applied
     */
    recordApplied(sessionId: string, feature: HumanizationFeature, data?: Record<string, unknown>, context?: {
        turnCount?: number;
        comfortLevel?: number;
        emotionalContext?: string;
    }): void;
    /**
     * Record that a feature was skipped
     */
    recordSkipped(sessionId: string, feature: HumanizationFeature, reason?: string): void;
    /**
     * Record that a feature was triggered (for detection features)
     */
    recordTriggered(sessionId: string, feature: HumanizationFeature, data?: Record<string, unknown>): void;
    /**
     * Record that user acknowledged a humanization
     */
    recordAcknowledged(sessionId: string, feature: HumanizationFeature, data?: Record<string, unknown>): void;
    /**
     * Start tracking a new session
     */
    startSession(sessionId: string, userId?: string): void;
    /**
     * End session tracking and get final stats
     */
    endSession(sessionId: string): SessionAnalytics | null;
    /**
     * Get stats for a specific session
     */
    getSessionStats(sessionId: string): SessionAnalytics | null;
    /**
     * Get feature stats across all sessions
     */
    getFeatureStats(feature: HumanizationFeature): FeatureStats;
    /**
     * Get global analytics summary
     */
    getGlobalAnalytics(): GlobalAnalytics;
    /**
     * Get recent events for debugging
     */
    getRecentEvents(count?: number): HumanizationEvent[];
    private updateSessionStats;
    private createEmptyFeatureStats;
    /**
     * Mark voice print as calibrated for session
     */
    markVoicePrintCalibrated(sessionId: string): void;
    /**
     * Update engagement score for session
     */
    updateEngagementScore(sessionId: string, score: number): void;
    /**
     * Reset all analytics (for testing)
     */
    reset(): void;
}
export declare function getHumanizationAnalytics(): HumanizationAnalyticsEngine;
export declare function resetHumanizationAnalytics(): void;
export declare const humanizationAnalytics: {
    recordApplied: (sessionId: string, feature: HumanizationFeature, data?: Record<string, unknown>, context?: {
        turnCount?: number;
        comfortLevel?: number;
        emotionalContext?: string;
    }) => void;
    recordSkipped: (sessionId: string, feature: HumanizationFeature, reason?: string) => void;
    recordTriggered: (sessionId: string, feature: HumanizationFeature, data?: Record<string, unknown>) => void;
    recordAcknowledged: (sessionId: string, feature: HumanizationFeature, data?: Record<string, unknown>) => void;
    startSession: (sessionId: string, userId?: string) => void;
    endSession: (sessionId: string) => SessionAnalytics | null;
    getStats: () => GlobalAnalytics;
};
export type { HumanizationAnalyticsEngine };
//# sourceMappingURL=analytics.d.ts.map