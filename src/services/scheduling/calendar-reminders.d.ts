/**
 * Calendar Reminders Service
 *
 * Proactively reminds users about upcoming calendar events:
 * - Morning digest of today's schedule
 * - Pre-event reminders (1 hour, 15 minutes)
 * - Smart contextual reminders ("Your interview is tomorrow - get rest!")
 *
 * Integrates with Google Calendar OAuth and proactive outreach.
 *
 * PERSISTENCE: Calendar events and reminder logs are persisted to Firestore.
 */
export interface CalendarEvent {
    id: string;
    userId: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    isAllDay: boolean;
    attendees?: string[];
    reminders: EventReminder[];
    source: 'google' | 'manual' | 'scheduled';
}
export interface EventReminder {
    id: string;
    eventId: string;
    type: 'digest' | 'pre_event' | 'contextual';
    minutesBefore: number;
    sent: boolean;
    sentAt?: Date;
}
export interface CalendarDigest {
    userId: string;
    date: Date;
    events: CalendarEvent[];
    message: string;
}
/**
 * Flush calendar reminder persistence
 */
export declare function flushCalendarPersistence(): Promise<void>;
/**
 * Shutdown calendar reminders service
 */
export declare function shutdownCalendarReminders(): Promise<void>;
/**
 * Add or update a calendar event
 */
export declare function upsertEvent(event: CalendarEvent): Promise<CalendarEvent>;
/**
 * Get events for a user on a specific date
 */
export declare function getEventsForDate(userId: string, date: Date): CalendarEvent[];
/**
 * Get upcoming events within hours
 */
export declare function getUpcomingEvents(userId: string, withinHours?: number): CalendarEvent[];
/**
 * Generate morning digest message
 */
export declare function generateMorningDigest(userId: string): CalendarDigest | null;
/**
 * Check and send due reminders
 */
export declare function checkAndSendReminders(): Promise<{
    digestsSent: number;
    remindersSent: number;
}>;
/**
 * Sync events from Google Calendar using OAuth tokens
 * Fetches upcoming events and adds them to the local event store
 */
export declare function syncFromGoogleCalendar(userId: string, accessToken?: string): Promise<number>;
/**
 * Start the reminder checking background job
 */
export declare function startCalendarReminders(intervalMs?: number): void;
/**
 * Stop the reminder checking background job
 */
export declare function stopCalendarReminders(): void;
/**
 * Clear all calendar data for a specific user.
 */
export declare function clearUserCalendarData(userId: string): void;
/**
 * Clear all calendar data.
 */
export declare function clearAllCalendarData(): void;
/**
 * Get memory usage statistics for monitoring.
 */
export declare function getCalendarMemoryStats(): {
    usersWithEvents: number;
    totalEvents: number;
    reminderLogsTracked: number;
};
/**
 * Prune old events and reminder logs.
 * @param olderThanDays - Remove events older than this many days (default: 30)
 */
export declare function pruneOldCalendarData(olderThanDays?: number): number;
declare const _default: {
    upsertEvent: typeof upsertEvent;
    getEventsForDate: typeof getEventsForDate;
    getUpcomingEvents: typeof getUpcomingEvents;
    generateMorningDigest: typeof generateMorningDigest;
    checkAndSendReminders: typeof checkAndSendReminders;
    syncFromGoogleCalendar: typeof syncFromGoogleCalendar;
    startCalendarReminders: typeof startCalendarReminders;
    stopCalendarReminders: typeof stopCalendarReminders;
    clearUserData: typeof clearUserCalendarData;
    clearAll: typeof clearAllCalendarData;
    getMemoryStats: typeof getCalendarMemoryStats;
    pruneOld: typeof pruneOldCalendarData;
    flushCalendarPersistence: typeof flushCalendarPersistence;
};
export default _default;
//# sourceMappingURL=calendar-reminders.d.ts.map