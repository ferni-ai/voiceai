/**
 * Calendar Types
 *
 * Unified calendar types for the provider-agnostic calendar system.
 * Ferni's calendar is the canonical source of truth - external providers
 * are just sync integrations.
 *
 * @module calendar/types
 */

// ============================================================================
// CALENDAR PROVIDERS
// ============================================================================

/**
 * Supported calendar providers
 */
export type CalendarProvider = 'ferni' | 'google' | 'apple' | 'outlook';

/**
 * Provider connection status
 */
export interface ProviderConnection {
  provider: CalendarProvider;
  connected: boolean;
  email?: string;
  displayName?: string;
  lastSyncedAt?: Date;
  syncEnabled: boolean;
  syncDirection: 'one-way-in' | 'one-way-out' | 'two-way';
  error?: string;
}

// ============================================================================
// CALENDAR EVENTS
// ============================================================================

/**
 * Sync status for an event
 */
export type SyncStatus =
  | 'local' // Only in Ferni, not synced
  | 'synced' // Successfully synced to provider
  | 'pending' // Waiting to sync
  | 'conflict' // Has conflicts with provider
  | 'deleted' // Marked for deletion
  | 'external'; // From provider, not yet confirmed

/**
 * A calendar event in the unified Ferni calendar
 */
export interface CalendarEvent {
  /** Unique Ferni event ID */
  id: string;

  /** User who owns this event */
  userId: string;

  /** Event title */
  title: string;

  /** Event description/notes */
  description?: string;

  /** Location (address, video link, etc.) */
  location?: string;

  /** Start time */
  startTime: Date;

  /** End time */
  endTime: Date;

  /** Is this an all-day event? */
  isAllDay: boolean;

  /** Attendee email addresses */
  attendees: string[];

  /** Event status */
  status: 'confirmed' | 'tentative' | 'cancelled';

  /** Where this event originated */
  source: CalendarProvider;

  /** External provider ID (for synced events) */
  externalId?: string;

  /** External calendar ID (e.g., 'primary' for Google) */
  externalCalendarId?: string;

  /** Current sync status */
  syncStatus: SyncStatus;

  /** Last sync attempt timestamp */
  lastSyncAttempt?: Date;

  /** Sync error message if any */
  syncError?: string;

  /** Event color/category */
  color?: string;

  /** Recurrence rule (iCal RRULE format) */
  recurrence?: string;

  /** Parent event ID (for recurring event instances) */
  recurringEventId?: string;

  /** Reminders */
  reminders: EventReminder[];

  /** Created timestamp */
  createdAt: Date;

  /** Last updated timestamp */
  updatedAt: Date;

  /** ETag for optimistic concurrency (from providers) */
  etag?: string;
}

/**
 * Event reminder
 */
export interface EventReminder {
  method: 'email' | 'popup' | 'push';
  minutesBefore: number;
}

/**
 * Input for creating a new event
 */
export interface CreateEventInput {
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
  isAllDay?: boolean;
  attendees?: string[];
  reminders?: EventReminder[];
  color?: string;
  recurrence?: string;
  /** Which provider to sync to (defaults to all connected) */
  syncTo?: CalendarProvider[];
}

/**
 * Input for updating an event
 */
export interface UpdateEventInput {
  title?: string;
  description?: string;
  location?: string;
  startTime?: Date;
  endTime?: Date;
  isAllDay?: boolean;
  attendees?: string[];
  reminders?: EventReminder[];
  color?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

// ============================================================================
// SYNC TYPES
// ============================================================================

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  provider: CalendarProvider;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  conflicts: SyncConflict[];
  errors: SyncError[];
  syncedAt: Date;
}

/**
 * A sync conflict that needs resolution
 */
export interface SyncConflict {
  eventId: string;
  ferniEvent: CalendarEvent;
  providerEvent: Partial<CalendarEvent>;
  conflictType: 'time' | 'title' | 'location' | 'deleted' | 'both-modified';
  detectedAt: Date;
}

/**
 * A sync error
 */
export interface SyncError {
  eventId?: string;
  message: string;
  code: string;
  provider: CalendarProvider;
  timestamp: Date;
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolution =
  | 'ferni-wins' // Always use Ferni's version
  | 'provider-wins' // Always use provider's version
  | 'newest-wins' // Use whichever was modified most recently
  | 'manual'; // Require user to resolve

// ============================================================================
// CALENDAR OVERVIEW TYPES
// ============================================================================

/**
 * Overview of a single day
 */
export interface DayOverview {
  date: Date;
  events: CalendarEvent[];
  totalMeetings: number;
  totalMeetingMinutes: number;
  freeTimeMinutes: number;
  firstEvent?: CalendarEvent;
  lastEvent?: CalendarEvent;
  isOverloaded: boolean;
  hasBackToBack: boolean;
}

/**
 * Overview of a week
 */
export interface WeekOverview {
  startDate: Date;
  endDate: Date;
  days: DayOverview[];
  totalMeetings: number;
  busiestDay: { day: string; meetings: number } | null;
  lightestDay: { day: string; meetings: number } | null;
  backToBackDays: string[];
  averageMeetingsPerDay: number;
}

/**
 * Available time slot
 */
export interface TimeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

// ============================================================================
// PROVIDER ADAPTER INTERFACE
// ============================================================================

/**
 * Interface that all calendar providers must implement
 */
export interface CalendarProviderAdapter {
  /** Provider identifier */
  readonly provider: CalendarProvider;

  /** Check if provider is configured (has credentials) */
  isConfigured(): boolean;

  /** Check if user is connected to this provider */
  isConnected(userId: string): Promise<boolean>;

  /** Get authorization URL for OAuth providers */
  getAuthUrl?(userId: string, redirectUri: string): string;

  /** Handle OAuth callback */
  handleAuthCallback?(userId: string, code: string): Promise<boolean>;

  /** Disconnect user from this provider */
  disconnect(userId: string): Promise<void>;

  /** Fetch events from provider */
  fetchEvents(
    userId: string,
    startDate: Date,
    endDate: Date,
    calendarId?: string
  ): Promise<CalendarEvent[]>;

  /** Create event in provider */
  createEvent(userId: string, event: CalendarEvent): Promise<string | null>;

  /** Update event in provider */
  updateEvent(userId: string, event: CalendarEvent): Promise<boolean>;

  /** Delete event from provider */
  deleteEvent(userId: string, eventId: string, calendarId?: string): Promise<boolean>;

  /** Get list of user's calendars */
  getCalendars?(userId: string): Promise<Array<{ id: string; name: string; primary: boolean }>>;
}

// ============================================================================
// FIRESTORE SCHEMA
// ============================================================================

/**
 * Firestore document for calendar event
 * Stored in: users/{userId}/calendar_events/{eventId}
 */
export interface StoredCalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  isAllDay: boolean;
  attendees: string[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  source: CalendarProvider;
  externalId?: string;
  externalCalendarId?: string;
  syncStatus: SyncStatus;
  lastSyncAttempt?: string;
  syncError?: string;
  color?: string;
  recurrence?: string;
  recurringEventId?: string;
  reminders: EventReminder[];
  createdAt: string;
  updatedAt: string;
  etag?: string;
}

/**
 * Firestore document for provider connection
 * Stored in: users/{userId}/calendar_providers/{provider}
 */
export interface StoredProviderConnection {
  provider: CalendarProvider;
  connected: boolean;
  email?: string;
  displayName?: string;
  lastSyncedAt?: string;
  syncEnabled: boolean;
  syncDirection: 'one-way-in' | 'one-way-out' | 'two-way';
  error?: string;
  // OAuth tokens (encrypted)
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
}

