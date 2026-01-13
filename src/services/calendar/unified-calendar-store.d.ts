/**
 * Unified Calendar Store
 *
 * The canonical source of truth for all calendar events in Ferni.
 * External providers (Google, Apple, Outlook) sync INTO this store.
 *
 * Architecture:
 * - All events stored in Firestore under users/{userId}/calendar_events
 * - Provider connections stored in users/{userId}/calendar_providers
 * - Events track their source and sync status
 * - Works fully offline - sync happens when providers are available
 *
 * @module calendar/unified-calendar-store
 */
import type { CalendarEvent, CalendarProvider, CreateEventInput, UpdateEventInput, ProviderConnection, TimeSlot, DayOverview, WeekOverview } from './types.js';
/**
 * Get all events for a user within a date range
 */
export declare function getEvents(userId: string, startDate: Date, endDate: Date): Promise<CalendarEvent[]>;
/**
 * Get events for a specific day
 */
export declare function getEventsForDay(userId: string, date: Date): Promise<CalendarEvent[]>;
/**
 * Get events for the current week
 */
export declare function getEventsForWeek(userId: string, referenceDate?: Date): Promise<CalendarEvent[]>;
/**
 * Get a single event by ID
 */
export declare function getEventById(userId: string, eventId: string): Promise<CalendarEvent | null>;
/**
 * Create a new event
 */
export declare function createEvent(userId: string, input: CreateEventInput, source?: CalendarProvider): Promise<CalendarEvent>;
/**
 * Update an existing event
 */
export declare function updateEvent(userId: string, eventId: string, updates: UpdateEventInput): Promise<CalendarEvent | null>;
/**
 * Delete an event
 */
export declare function deleteEvent(userId: string, eventId: string): Promise<boolean>;
/**
 * Import an event from an external provider
 */
export declare function importExternalEvent(userId: string, provider: CalendarProvider, externalId: string, externalCalendarId: string, eventData: Omit<CreateEventInput, 'syncTo'>, etag?: string): Promise<CalendarEvent>;
/**
 * Import multiple events from an external provider
 * Used by webhooks and batch sync operations
 */
export declare function importEventsFromProvider(userId: string, provider: CalendarProvider, events: Array<Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>>): Promise<number>;
/**
 * Get all provider connections for a user
 */
export declare function getProviderConnections(userId: string): Promise<ProviderConnection[]>;
/**
 * Get a specific provider connection
 */
export declare function getProviderConnection(userId: string, provider: CalendarProvider): Promise<ProviderConnection | null>;
/**
 * Check if any provider is connected
 */
export declare function hasAnyProviderConnected(userId: string): Promise<boolean>;
/**
 * Update provider connection
 */
export declare function updateProviderConnection(userId: string, connection: ProviderConnection): Promise<void>;
/**
 * Remove provider connection
 */
export declare function removeProviderConnection(userId: string, provider: CalendarProvider): Promise<void>;
/**
 * Find free time slots on a given day
 */
export declare function findFreeTimeSlots(userId: string, date: Date, options?: {
    minDurationMinutes?: number;
    workDayOnly?: boolean;
}): Promise<TimeSlot[]>;
/**
 * Check if a specific time slot is available
 */
export declare function isTimeSlotAvailable(userId: string, startTime: Date, endTime: Date): Promise<boolean>;
/**
 * Get day overview
 */
export declare function getDayOverview(userId: string, date: Date): Promise<DayOverview>;
/**
 * Get week overview
 */
export declare function getWeekOverview(userId: string, referenceDate?: Date): Promise<WeekOverview>;
/**
 * Clear cache for a user (useful after sync)
 */
export declare function clearUserCache(userId: string): void;
/**
 * Mark events as pending sync
 */
export declare function markEventsForSync(userId: string, eventIds: string[]): Promise<void>;
/**
 * Get events that need syncing
 */
export declare function getEventsNeedingSync(userId: string): Promise<CalendarEvent[]>;
/**
 * Per-calendar preferences stored by the user
 */
export interface CalendarPreference {
    /** Calendar ID (provider-specific) */
    calendarId: string;
    /** Provider this calendar belongs to */
    provider: CalendarProvider;
    /** Whether this calendar should be synced */
    enabled: boolean;
    /** User-defined nickname for the calendar */
    nickname?: string;
    /** Color override (if user wants to change from provider color) */
    colorOverride?: string;
    /** Show in "busy" calculation */
    includeInBusy: boolean;
    /** Include events from this calendar in briefings */
    includeInBriefings: boolean;
    /** Last updated timestamp */
    updatedAt: string;
}
/**
 * Get all calendar preferences for a user
 */
export declare function getCalendarPreferences(userId: string): Promise<CalendarPreference[]>;
/**
 * Get preference for a specific calendar
 */
export declare function getCalendarPreference(userId: string, calendarId: string): Promise<CalendarPreference | null>;
/**
 * Set preference for a calendar
 */
export declare function setCalendarPreference(userId: string, preference: CalendarPreference): Promise<void>;
/**
 * Check if a calendar is enabled for sync
 */
export declare function isCalendarEnabled(userId: string, calendarId: string): Promise<boolean>;
/**
 * Get all enabled calendar IDs for a user
 */
export declare function getEnabledCalendarIds(userId: string): Promise<string[]>;
/**
 * Batch update calendar preferences
 */
export declare function setCalendarPreferences(userId: string, preferences: CalendarPreference[]): Promise<void>;
/**
 * Clear preferences cache for a user
 */
export declare function clearPreferencesCache(userId: string): void;
declare const _default: {
    getEvents: typeof getEvents;
    getEventsForDay: typeof getEventsForDay;
    getEventsForWeek: typeof getEventsForWeek;
    getEventById: typeof getEventById;
    createEvent: typeof createEvent;
    updateEvent: typeof updateEvent;
    deleteEvent: typeof deleteEvent;
    importExternalEvent: typeof importExternalEvent;
    importEventsFromProvider: typeof importEventsFromProvider;
    getProviderConnections: typeof getProviderConnections;
    getProviderConnection: typeof getProviderConnection;
    hasAnyProviderConnected: typeof hasAnyProviderConnected;
    updateProviderConnection: typeof updateProviderConnection;
    removeProviderConnection: typeof removeProviderConnection;
    findFreeTimeSlots: typeof findFreeTimeSlots;
    isTimeSlotAvailable: typeof isTimeSlotAvailable;
    getDayOverview: typeof getDayOverview;
    getWeekOverview: typeof getWeekOverview;
    getCalendarPreferences: typeof getCalendarPreferences;
    getCalendarPreference: typeof getCalendarPreference;
    setCalendarPreference: typeof setCalendarPreference;
    setCalendarPreferences: typeof setCalendarPreferences;
    isCalendarEnabled: typeof isCalendarEnabled;
    getEnabledCalendarIds: typeof getEnabledCalendarIds;
    clearPreferencesCache: typeof clearPreferencesCache;
    clearUserCache: typeof clearUserCache;
    markEventsForSync: typeof markEventsForSync;
    getEventsNeedingSync: typeof getEventsNeedingSync;
};
export default _default;
//# sourceMappingURL=unified-calendar-store.d.ts.map