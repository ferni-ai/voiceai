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

// ============================================================================
// TYPES
// ============================================================================

export type {
  CalendarEvent,
  CalendarProvider,
  ProviderConnection,
  CreateEventInput,
  UpdateEventInput,
  SyncResult,
  SyncConflict,
  SyncError,
  ConflictResolution,
  DayOverview,
  WeekOverview,
  TimeSlot,
  EventReminder,
  SyncStatus,
  CalendarProviderAdapter,
} from './types.js';

// ============================================================================
// UNIFIED CALENDAR STORE (Primary API)
// ============================================================================

export {
  // Event operations
  getEvents,
  getEventsForDay,
  getEventsForWeek,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  importExternalEvent,

  // Provider connections
  getProviderConnections,
  getProviderConnection,
  hasAnyProviderConnected,
  updateProviderConnection,
  removeProviderConnection,

  // Availability
  findFreeTimeSlots,
  isTimeSlotAvailable,
  getDayOverview,
  getWeekOverview,

  // Cache management
  clearUserCache,
  markEventsForSync,
  getEventsNeedingSync,
} from './unified-calendar-store.js';

// ============================================================================
// SYNC ENGINE
// ============================================================================

export {
  CalendarSyncEngine,
  getSyncEngine,
  syncAllProviders,
  syncProvider,
} from './sync-engine.js';

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

export {
  getProvider,
  getAllProviders,
  getConfiguredProviders,
  getProviderInfo,
  getAllProviderInfo,
} from './providers/provider-registry.js';

// ============================================================================
// INDIVIDUAL PROVIDERS
// ============================================================================

export { GoogleCalendarProvider } from './providers/google-provider.js';
export { AppleCalendarProvider } from './providers/apple-provider.js';
export { OutlookCalendarProvider } from './providers/outlook-provider.js';

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

/**
 * Check if calendar is "connected" (backward compatible)
 *
 * In the new architecture, the calendar is ALWAYS available.
 * This function now returns true if the user has any events OR
 * has any provider connected.
 *
 * @deprecated Use hasAnyProviderConnected() to check provider status
 */
export async function isConnected(userId: string): Promise<boolean> {
  // Calendar is always "connected" now - Ferni calendar is native
  // This returns true to maintain backward compatibility with existing tools
  return true;
}

// ============================================================================
// LEGACY EXPORTS (for gradual migration)
// ============================================================================

// Re-export the old calendar-service functions for gradual migration
// These will be deprecated once all tools are updated
export {
  formatEventForSpeech,
  formatDayOverviewForSpeech,
} from './calendar-service.js';
