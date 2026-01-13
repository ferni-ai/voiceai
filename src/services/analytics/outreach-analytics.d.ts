/**
 * Outreach Analytics Service
 *
 * Tracks and analyzes proactive outreach effectiveness:
 * - Delivery and response rates
 * - Best times to reach users
 * - Message effectiveness by type
 * - User engagement patterns
 *
 * Used to optimize outreach timing and messaging.
 *
 * PERSISTENCE: Uses Firestore for event storage with in-memory caching.
 */
import type { OutreachTrigger } from '../outreach-intelligence.js';
export interface OutreachEvent {
    id: string;
    userId: string;
    timestamp: Date;
    trigger: OutreachTrigger;
    method: 'sms' | 'email' | 'call';
    status: 'sent' | 'delivered' | 'failed' | 'responded';
    message: string;
    dayOfWeek: number;
    hourOfDay: number;
    responseTime?: number;
    responseType?: 'conversation' | 'reply' | 'action';
}
export interface UserAnalytics {
    userId: string;
    totalSent: number;
    totalDelivered: number;
    totalResponded: number;
    responseRate: number;
    averageResponseTime: number;
    bestDays: number[];
    bestHours: number[];
    preferredMethod: 'sms' | 'email' | 'call';
    triggerEffectiveness: Record<OutreachTrigger, number>;
    lastUpdated: Date;
}
export interface GlobalAnalytics {
    totalOutreach: number;
    overallResponseRate: number;
    responseRateByTrigger: Record<string, number>;
    responseRateByMethod: Record<string, number>;
    responseRateByHour: number[];
    responseRateByDay: number[];
    topPerformingMessages: Array<{
        trigger: OutreachTrigger;
        messagePattern: string;
        responseRate: number;
        sampleSize: number;
    }>;
}
/**
 * Log an outreach event
 */
export declare function logOutreachEvent(event: Omit<OutreachEvent, 'id' | 'dayOfWeek' | 'hourOfDay'>): string;
/**
 * Update event status (e.g., when user responds)
 */
export declare function updateEventStatus(eventId: string, status: OutreachEvent['status'], responseTime?: number, responseType?: OutreachEvent['responseType']): void;
/**
 * Log a response to outreach
 */
export declare function logResponse(userId: string, trigger: OutreachTrigger, responseType: OutreachEvent['responseType']): void;
/**
 * Get analytics for a specific user
 */
export declare function getUserAnalytics(userId: string): Promise<UserAnalytics>;
/**
 * Get global analytics across all users
 */
export declare function getGlobalAnalytics(): GlobalAnalytics;
/**
 * Get recommendations for optimizing outreach to a user
 */
export declare function getOptimizationRecommendations(userId: string): Promise<string[]>;
/**
 * Generate a summary report
 */
export declare function generateSummaryReport(): string;
declare const _default: {
    logOutreachEvent: typeof logOutreachEvent;
    updateEventStatus: typeof updateEventStatus;
    logResponse: typeof logResponse;
    getUserAnalytics: typeof getUserAnalytics;
    getGlobalAnalytics: typeof getGlobalAnalytics;
    getOptimizationRecommendations: typeof getOptimizationRecommendations;
    generateSummaryReport: typeof generateSummaryReport;
};
export default _default;
//# sourceMappingURL=outreach-analytics.d.ts.map