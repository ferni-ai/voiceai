/**
 * Calendar Service - Unified Calendar System
 *
 * Provider-agnostic calendar where Ferni is the canonical source of truth.
 * External providers (Google, Apple, Outlook) are sync integrations.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    FERNI CALENDAR (Primary)                  │
 * │                    Firestore: users/{userId}/calendar_events │
 * └─────────────────────────────────────────────────────────────┘
 *                               │
 *            ┌──────────────────┼──────────────────┐
 *            │                  │                  │
 *            ▼                  ▼                  ▼
 *    ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
 *    │ Google Sync   │  │ Apple Sync    │  │ Outlook Sync  │
 *    │ (OAuth)       │  │ (CalDAV)      │  │ (Graph API)   │
 *    └───────────────┘  └───────────────┘  └───────────────┘
 *
 * Usage:
 * ```typescript
 * import {
 *   getEvents,
 *   createEvent,
 *   syncProvider,
 *   getProviderConnections,
 * } from './calendar';
 *
 * // Calendar always works, with or without external providers
 * const events = await getEvents(userId, startDate, endDate);
 *
 * // Create event in Ferni calendar (syncs to connected providers)
 * const event = await createEvent(userId, { title: 'Meeting', ... });
 *
 * // Sync with Google Calendar
 * await syncProvider(userId, 'google');
 * ```
 *
 * @module calendar
 */
export type { CalendarEvent, CalendarProvider, ProviderConnection, CreateEventInput, UpdateEventInput, SyncResult, SyncConflict, SyncError, ConflictResolution, DayOverview, WeekOverview, TimeSlot, EventReminder, SyncStatus, CalendarProviderAdapter, } from './types.js';
export { getEvents, getEventsForDay, getEventsForWeek, getEventById, createEvent, updateEvent, deleteEvent, importExternalEvent, getProviderConnections, getProviderConnection, hasAnyProviderConnected, updateProviderConnection, removeProviderConnection, findFreeTimeSlots, isTimeSlotAvailable, getDayOverview, getWeekOverview, clearUserCache, markEventsForSync, getEventsNeedingSync, } from './unified-calendar-store.js';
export { CalendarSyncEngine, getSyncEngine, syncAllProviders, syncProvider, } from './sync-engine.js';
export { getProvider, getAllProviders, getConfiguredProviders, getProviderInfo, getAllProviderInfo, } from './providers/provider-registry.js';
export { GoogleCalendarProvider } from './providers/google-provider.js';
export { AppleCalendarProvider } from './providers/apple-provider.js';
export { OutlookCalendarProvider } from './providers/outlook-provider.js';
/**
 * Check if calendar is "connected" (backward compatible)
 *
 * In the new architecture, the calendar is ALWAYS available.
 * This function now returns true if the user has any events OR
 * has any provider connected.
 *
 * @deprecated Use hasAnyProviderConnected() to check provider status
 */
export declare function isConnected(userId: string): Promise<boolean>;
export { formatEventForSpeech, formatDayOverviewForSpeech } from './calendar-service.js';
//# sourceMappingURL=index.d.ts.map