/**
 * Admin Activity Log Service
 *
 * Persists admin activity events to Firestore for durability.
 * Falls back to in-memory storage when Firestore is unavailable.
 *
 * Collection: admin_activity_log
 * TTL: 7 days (events older than 7 days are not returned)
 *
 * @module AdminActivityService
 */
export interface ActivityEvent {
    id: string;
    type: 'handoff' | 'evalops' | 'trust' | 'agent' | 'flag' | 'user' | 'system';
    action: string;
    description: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
}
/**
 * Initialize Firestore for activity logging
 */
export declare function initializeActivityLog(): Promise<boolean>;
/**
 * Record an activity event
 */
export declare function recordActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'>): Promise<void>;
/**
 * Get recent activity events
 */
export declare function getRecentActivity(limit?: number): Promise<ActivityEvent[]>;
/**
 * Get activity events by type
 */
export declare function getActivityByType(type: ActivityEvent['type'], limit?: number): Promise<ActivityEvent[]>;
/**
 * Get activity count by type (for analytics)
 */
export declare function getActivityCounts(): Promise<Record<ActivityEvent['type'], number>>;
/**
 * Clean up old events (can be run periodically)
 * Now loops until all old events are cleaned to handle >500 events
 */
export declare function cleanupOldEvents(): Promise<number>;
declare const _default: {
    initializeActivityLog: typeof initializeActivityLog;
    recordActivity: typeof recordActivity;
    getRecentActivity: typeof getRecentActivity;
    getActivityByType: typeof getActivityByType;
    getActivityCounts: typeof getActivityCounts;
    cleanupOldEvents: typeof cleanupOldEvents;
};
export default _default;
//# sourceMappingURL=admin-activity.d.ts.map