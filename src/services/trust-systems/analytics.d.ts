/**
 * Trust Systems Analytics
 *
 * Tracks usage and effectiveness of trust-building features.
 * Measures what actually works for building connection.
 *
 * Philosophy: We can't improve what we don't measure. But we measure
 * what matters - genuine connection, not just engagement metrics.
 *
 * @module TrustAnalytics
 */
export interface TrustEvent {
    id: string;
    userId: string;
    timestamp: Date;
    /** Which trust system generated this */
    system: 'reading_between_lines' | 'boundary_memory' | 'growth_reflection' | 'inside_jokes' | 'small_wins' | 'thinking_of_you';
    /** What happened */
    eventType: 'detected' | 'surfaced' | 'acted_on' | 'user_response' | 'positive_outcome';
    /** Details about the event */
    details: Record<string, unknown>;
    /** Persona involved */
    personaId?: string;
}
export interface TrustMetrics {
    userId: string;
    period: 'day' | 'week' | 'month';
    startDate: Date;
    /** Detection counts */
    detections: Record<string, number>;
    /** Surface counts (how often we showed context to LLM) */
    surfaced: Record<string, number>;
    /** Action counts (how often AI used the context) */
    actedOn: Record<string, number>;
    /** Positive response counts */
    positiveResponses: Record<string, number>;
    /** Calculated effectiveness (actedOn / surfaced) */
    effectiveness: Record<string, number>;
    /** User engagement metrics */
    engagement: {
        returnRate: number;
        averageSessionLength: number;
        conversationDepth: number;
    };
}
export interface ABTestConfig {
    id: string;
    name: string;
    description: string;
    /** Which system is being tested */
    system: TrustEvent['system'];
    /** Control vs treatment split (0-1) */
    treatmentPercentage: number;
    /** What we're measuring */
    primaryMetric: string;
    /** Start/end dates */
    startDate: Date;
    endDate?: Date;
    /** Current results */
    results?: {
        controlCount: number;
        treatmentCount: number;
        controlMetric: number;
        treatmentMetric: number;
        pValue?: number;
        significant?: boolean;
    };
}
/**
 * Track a trust system event
 */
export declare function trackEvent(event: Omit<TrustEvent, 'id' | 'timestamp'>): TrustEvent;
/**
 * Track when a signal is detected
 */
export declare function trackDetection(userId: string, system: TrustEvent['system'], details?: Record<string, unknown>): void;
/**
 * Track when context is surfaced to LLM
 */
export declare function trackSurfaced(userId: string, system: TrustEvent['system'], personaId?: string, details?: Record<string, unknown>): void;
/**
 * Track when AI acts on the context
 */
export declare function trackActedOn(userId: string, system: TrustEvent['system'], personaId?: string, details?: Record<string, unknown>): void;
/**
 * Track user response to trust action
 */
export declare function trackUserResponse(userId: string, system: TrustEvent['system'], response: 'positive' | 'neutral' | 'negative', details?: Record<string, unknown>): void;
/**
 * Calculate metrics for a user over a period
 */
export declare function calculateUserMetrics(userId: string, startDate: Date, endDate?: Date): Partial<TrustMetrics>;
/**
 * Get aggregate metrics across all users
 */
export declare function getAggregateMetrics(startDate: Date, endDate?: Date): {
    totalEvents: number;
    bySystem: Record<string, Record<string, number>>;
    topPerformers: Array<{
        system: string;
        effectiveness: number;
    }>;
};
/**
 * Create an A/B test
 */
export declare function createABTest(config: Omit<ABTestConfig, 'results'>): void;
/**
 * Get user's test assignment
 */
export declare function getTestAssignment(userId: string, testId: string): 'control' | 'treatment' | null;
/**
 * Check if feature is enabled for user (for A/B tests)
 */
export declare function isFeatureEnabled(userId: string, testId: string): boolean;
/**
 * Get daily summary for a date
 */
export declare function getDailySummary(date: Date): Record<string, number>;
/**
 * Get trust system health check
 */
export declare function getHealthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    systems: Record<string, {
        active: boolean;
        lastEvent?: Date;
    }>;
    recentEventCount: number;
};
/**
 * Export analytics data for external analysis
 */
export declare function exportAnalytics(startDate: Date, endDate?: Date): {
    events: TrustEvent[];
    metrics: ReturnType<typeof getAggregateMetrics>;
    health: ReturnType<typeof getHealthCheck>;
};
declare const _default: {
    trackEvent: typeof trackEvent;
    trackDetection: typeof trackDetection;
    trackSurfaced: typeof trackSurfaced;
    trackActedOn: typeof trackActedOn;
    trackUserResponse: typeof trackUserResponse;
    calculateUserMetrics: typeof calculateUserMetrics;
    getAggregateMetrics: typeof getAggregateMetrics;
    createABTest: typeof createABTest;
    getTestAssignment: typeof getTestAssignment;
    isFeatureEnabled: typeof isFeatureEnabled;
    getDailySummary: typeof getDailySummary;
    getHealthCheck: typeof getHealthCheck;
    exportAnalytics: typeof exportAnalytics;
};
export default _default;
//# sourceMappingURL=analytics.d.ts.map