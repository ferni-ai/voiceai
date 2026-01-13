/**
 * Calendar Busy Detection Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates with Google Calendar to detect when users are busy,
 * enabling smarter outreach timing. A good friend doesn't call
 * when you're in a meeting.
 *
 * Features:
 * - Free/busy time detection
 * - Upcoming event awareness
 * - Auto-detection of "never during" times
 * - Caching to minimize API calls
 */
import { type NeverDuringRule } from '../outreach/timing-intelligence.js';
export interface BusySlot {
    start: Date;
    end: Date;
    eventTitle?: string;
    isAllDay: boolean;
}
export interface CalendarBusyProfile {
    userId: string;
    /** Current busy status */
    currentlyBusy: boolean;
    currentEvent?: string;
    busyUntil?: Date;
    /** Today's remaining busy slots */
    todayBusySlots: BusySlot[];
    /** Detected patterns (e.g., recurring meetings) */
    recurringBusyTimes: NeverDuringRule[];
    /** Next window for outreach */
    nextFreeWindow?: {
        start: Date;
        end: Date;
        duration: number;
    };
    /** Last sync time */
    lastSynced: Date;
}
/**
 * Check if the user is currently busy
 */
export declare function isUserBusy(userId: string): Promise<{
    isBusy: boolean;
    reason?: string;
    busyUntil?: Date;
}>;
/**
 * Get the next good time for outreach
 */
export declare function getNextOutreachWindow(userId: string, minDurationMinutes?: number): Promise<{
    start: Date;
    end: Date;
} | null>;
/**
 * Get full calendar busy profile
 */
export declare function getCalendarBusyProfile(userId: string): Promise<CalendarBusyProfile>;
/**
 * Sync user's recurring calendar patterns to outreach timing
 */
export declare function syncCalendarToOutreach(userId: string): Promise<{
    busyPeriodsAdded: number;
    rulesAdded: number;
}>;
/**
 * Clear cached profile for a user
 */
export declare function clearBusyProfileCache(userId: string): void;
/**
 * Clear all cached profiles
 */
export declare function clearAllBusyProfileCaches(): void;
declare const _default: {
    isUserBusy: typeof isUserBusy;
    getNextOutreachWindow: typeof getNextOutreachWindow;
    getCalendarBusyProfile: typeof getCalendarBusyProfile;
    syncCalendarToOutreach: typeof syncCalendarToOutreach;
    clearBusyProfileCache: typeof clearBusyProfileCache;
    clearAllBusyProfileCaches: typeof clearAllBusyProfileCaches;
};
export default _default;
//# sourceMappingURL=calendar-busy-detection.d.ts.map