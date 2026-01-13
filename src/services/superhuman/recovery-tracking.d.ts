/**
 * Recovery Time Tracking - Better Than Human Post-Event Support
 *
 * Tracks how long users need to recover after different emotional events:
 * - After conflicts
 * - After bad news
 * - After intense work
 * - After social events
 * - After emotional conversations
 *
 * WHY IT'S SUPERHUMAN: Friends often check in too soon or too late.
 * Ferni waits exactly the right amount of time for THIS person.
 *
 * @module services/superhuman/recovery-tracking
 */
export type RecoveryEventType = 'conflict' | 'bad_news' | 'rejection' | 'loss' | 'betrayal' | 'failure' | 'intense_work' | 'burnout' | 'social_event' | 'emotional_conversation' | 'medical_procedure' | 'high_stress' | 'disappointment' | 'embarrassment' | 'anxiety_peak' | 'trauma';
export interface RecoveryEvent {
    userId: string;
    eventType: RecoveryEventType;
    /** When the event occurred */
    eventTimestamp: number;
    /** Initial intensity 0-1 */
    initialIntensity: number;
    /** When they felt recovered */
    recoveredTimestamp?: number;
    /** Recovery time in hours */
    recoveryHours?: number;
    /** What helped */
    helpfulActions?: string[];
    /** Context */
    context?: string;
}
export interface RecoveryProfile {
    userId: string;
    /** Recovery times by event type */
    recoveryTimes: Record<RecoveryEventType, {
        minHours: number;
        avgHours: number;
        maxHours: number;
        sampleSize: number;
    }>;
    /** Actions that help recovery */
    helpfulActions: string[];
    /** Times when they recover faster */
    optimalRecoveryTimes: {
        dayOfWeek: number;
        hourRange: string;
    }[];
    /** Last updated */
    lastUpdated: number;
}
export interface RecoveryCheckIn {
    isReadyForCheckIn: boolean;
    recommendedWaitHours: number;
    confidence: number;
    message: string;
}
/**
 * Record a recovery event start.
 */
export declare function startRecoveryTracking(userId: string, eventType: RecoveryEventType, intensity: number, context?: string): Promise<string | null>;
/**
 * Mark recovery complete.
 */
export declare function markRecovered(userId: string, eventId: string, helpfulActions?: string[]): Promise<void>;
/**
 * Load recovery history.
 */
export declare function loadRecoveryHistory(userId: string, daysBack?: number): Promise<RecoveryEvent[]>;
/**
 * Get active (not yet recovered) events.
 */
export declare function getActiveRecoveryEvents(userId: string): Promise<RecoveryEvent[]>;
/**
 * Build recovery profile from history.
 */
export declare function buildRecoveryProfile(userId: string): Promise<RecoveryProfile>;
/**
 * Determine if it's a good time to check in after an event.
 */
export declare function getCheckInRecommendation(userId: string, eventType: RecoveryEventType, eventTimestamp: number): Promise<RecoveryCheckIn>;
/**
 * Build context for LLM injection about active recovery events.
 */
export declare function buildRecoveryContext(userId: string): Promise<string>;
export declare const recoveryTracking: {
    start: typeof startRecoveryTracking;
    markRecovered: typeof markRecovered;
    loadHistory: typeof loadRecoveryHistory;
    getActive: typeof getActiveRecoveryEvents;
    buildProfile: typeof buildRecoveryProfile;
    getCheckInRecommendation: typeof getCheckInRecommendation;
    buildContext: typeof buildRecoveryContext;
};
//# sourceMappingURL=recovery-tracking.d.ts.map