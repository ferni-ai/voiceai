/**
 * Outreach Analytics & Learning
 *
 * Tracks outreach effectiveness and learns optimal patterns:
 * - Which channels get responses
 * - Best times to reach each user
 * - Which trigger types are effective
 * - Message style that resonates
 */
import type { OutreachDecision, OutreachTriggerType } from './decision-engine.js';
export interface OutreachEvent {
    id: string;
    userId: string;
    triggerId: string;
    triggerType: OutreachTriggerType;
    channel: 'sms' | 'email' | 'call';
    personaId: string;
    timestamp: Date;
    decision: 'send' | 'skip' | 'defer';
    skipReason?: string;
}
export interface ResponseEvent {
    outreachId: string;
    userId: string;
    responseType: 'reply' | 'click' | 'open' | 'call_answered' | 'call_completed' | 'no_response';
    responseTime?: number;
    sentiment?: 'positive' | 'neutral' | 'negative';
    engagementScore?: number;
    timestamp: Date;
}
export interface UserAnalytics {
    userId: string;
    totalOutreach: number;
    responseRate: number;
    avgResponseTime: number;
    preferredChannel: 'sms' | 'email' | 'call';
    bestTimeSlots: Array<{
        hour: number;
        dayOfWeek: number;
        responseRate: number;
    }>;
    effectiveTriggers: Array<{
        type: OutreachTriggerType;
        rate: number;
    }>;
    preferredPersona: string;
    lastUpdated: Date;
}
export interface GlobalAnalytics {
    totalOutreach: number;
    overallResponseRate: number;
    channelPerformance: Record<string, {
        sent: number;
        responded: number;
        rate: number;
    }>;
    triggerPerformance: Record<string, {
        sent: number;
        responded: number;
        rate: number;
    }>;
    personaPerformance: Record<string, {
        sent: number;
        responded: number;
        rate: number;
    }>;
    timeSlotPerformance: Record<string, {
        sent: number;
        responded: number;
        rate: number;
    }>;
    lastUpdated: Date;
}
export interface PeriodAnalytics {
    periodDays: number;
    totalOutreach: number;
    responseRate: number;
    byChannel: Record<string, {
        sent: number;
        responded: number;
        rate: number;
    }>;
    byTrigger: Record<string, {
        sent: number;
        responded: number;
        rate: number;
    }>;
    byPersona: Record<string, {
        sent: number;
        responded: number;
        rate: number;
    }>;
}
/**
 * Record an outreach event
 */
export declare function recordOutreachEvent(decision: OutreachDecision, channel: 'sms' | 'email' | 'call'): string;
/**
 * Record a response to outreach
 */
export declare function recordResponseEvent(params: {
    outreachId: string;
    userId: string;
    responseType: ResponseEvent['responseType'];
    responseTime?: number;
    sentiment?: ResponseEvent['sentiment'];
    engagementScore?: number;
}): void;
export declare function calculatePeriodAnalytics(periodDays: number): PeriodAnalytics;
/**
 * Calculate analytics for a specific user
 */
export declare function calculateUserAnalytics(userId: string): UserAnalytics;
/**
 * Calculate global analytics across all users
 */
export declare function calculateGlobalAnalytics(): GlobalAnalytics;
/**
 * Get recommendations for a user based on analytics
 */
export declare function getRecommendations(userId: string): {
    suggestedChannel: 'sms' | 'email' | 'call';
    suggestedTime: {
        hour: number;
        dayOfWeek: number;
    };
    suggestedTriggers: OutreachTriggerType[];
    suggestedPersona: string;
    confidence: number;
};
/**
 * Predict likelihood of response for a given outreach configuration
 */
export declare function predictResponseLikelihood(params: {
    userId: string;
    channel: 'sms' | 'email' | 'call';
    triggerType: OutreachTriggerType;
    personaId: string;
    time: Date;
}): number;
/**
 * Export analytics data for external analysis
 */
export declare function exportAnalyticsData(userId?: string): {
    events: OutreachEvent[];
    responses: ResponseEvent[];
    userAnalytics: UserAnalytics[];
    globalAnalytics: GlobalAnalytics;
};
/**
 * Prune old analytics data
 */
export declare function pruneOldAnalyticsData(maxAgeDays?: number): number;
/**
 * Clear all analytics data for a user (GDPR)
 */
export declare function clearUserAnalyticsData(userId: string): void;
export declare const analytics: {
    recordOutreach: typeof recordOutreachEvent;
    recordResponse: typeof recordResponseEvent;
    getUserAnalytics: typeof calculateUserAnalytics;
    getGlobalAnalytics: typeof calculateGlobalAnalytics;
    getRecommendations: typeof getRecommendations;
    predictResponse: typeof predictResponseLikelihood;
    exportData: typeof exportAnalyticsData;
    pruneOldData: typeof pruneOldAnalyticsData;
    clearUserData: typeof clearUserAnalyticsData;
};
export default analytics;
//# sourceMappingURL=analytics.d.ts.map