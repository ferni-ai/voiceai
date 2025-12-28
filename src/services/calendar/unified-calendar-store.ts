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

import { getLogger } from '../../utils/safe-logger.js';
import type {
  CalendarEvent,
  CalendarProvider,
  CreateEventInput,
  UpdateEventInput,
  ProviderConnection,
  StoredCalendarEvent,
  StoredProviderConnection,
  SyncStatus,
  TimeSlot,
  DayOverview,
  WeekOverview,
} from './types.js';

const log = getLogger();

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Unified calendar Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for unified calendar');
    return null;
  }
}

// Collection paths
const EVENTS_COLLECTION = 'calendar_events';
const PROVIDERS_COLLECTION = 'calendar_providers';

function getUserEventsCollection(userId: string) {
  return `users/${userId}/${EVENTS_COLLECTION}`;
}

function getUserProvidersCollection(userId: string) {
  return `users/${userId}/${PROVIDERS_COLLECTION}`;
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const eventCache = new Map<string, Map<string, CalendarEvent>>();
const providerCache = new Map<string, Map<CalendarProvider, ProviderConnection>>();
const loadedUsers = new Set<string>();

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

function storedToEvent(stored: StoredCalendarEvent): CalendarEvent {
  return {
    ...stored,
    startTime: new Date(stored.startTime),
    endTime: new Date(stored.endTime),
    lastSyncAttempt: stored.lastSyncAttempt ? new Date(stored.lastSyncAttempt) : undefined,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
  };
}

function eventToStored(event: CalendarEvent): StoredCalendarEvent {
  return {
    ...event,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    lastSyncAttempt: event.lastSyncAttempt?.toISOString(),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function storedToProvider(stored: StoredProviderConnection): ProviderConnection {
  return {
    ...stored,
    lastSyncedAt: stored.lastSyncedAt ? new Date(stored.lastSyncedAt) : undefined,
  };
}

// ============================================================================
// LOAD USER DATA
// ============================================================================

async function loadUserData(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  const firestore = await getFirestore();
  if (!firestore) {
    loadedUsers.add(userId);
    eventCache.set(userId, new Map());
    providerCache.set(userId, new Map());
    return;
  }

  try {
    // Load events
    const eventsSnapshot = await firestore.collection(getUserEventsCollection(userId)).get();

    const events = new Map<string, CalendarEvent>();
    for (const doc of eventsSnapshot.docs) {
      const stored = doc.data() as StoredCalendarEvent;
      events.set(stored.id, storedToEvent(stored));
    }
    eventCache.set(userId, events);

    // Load provider connections
    const providersSnapshot = await firestore.collection(getUserProvidersCollection(userId)).get();

    const providers = new Map<CalendarProvider, ProviderConnection>();
    for (const doc of providersSnapshot.docs) {
      const stored = doc.data() as StoredProviderConnection;
      providers.set(stored.provider, storedToProvider(stored));
    }
    providerCache.set(userId, providers);

    loadedUsers.add(userId);
    log.debug(
      { userId, eventCount: events.size, providerCount: providers.size },
      'Loaded user calendar data'
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load user calendar data');
    loadedUsers.add(userId);
    eventCache.set(userId, new Map());
    providerCache.set(userId, new Map());
  }
}

// ============================================================================
// EVENT OPERATIONS
// ============================================================================

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get all events for a user within a date range
 */
export async function getEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  await loadUserData(userId);

  const events = eventCache.get(userId) || new Map();
  const results: CalendarEvent[] = [];

  for (const event of events.values()) {
    if (event.status === 'cancelled') continue;
    if (event.syncStatus === 'deleted') continue;

    // Check if event overlaps with date range
    if (event.endTime >= startDate && event.startTime <= endDate) {
      results.push(event);
    }
  }

  // Sort by start time
  results.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return results;
}

/**
 * Get events for a specific day
 */
export async function getEventsForDay(userId: string, date: Date): Promise<CalendarEvent[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return getEvents(userId, startOfDay, endOfDay);
}

/**
 * Get events for the current week
 */
export async function getEventsForWeek(
  userId: string,
  referenceDate: Date = new Date()
): Promise<CalendarEvent[]> {
  const startOfWeek = new Date(referenceDate);
  startOfWeek.setDate(referenceDate.getDate() - referenceDate.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return getEvents(userId, startOfWeek, endOfWeek);
}

/**
 * Get a single event by ID
 */
export async function getEventById(userId: string, eventId: string): Promise<CalendarEvent | null> {
  await loadUserData(userId);
  const events = eventCache.get(userId);
  return events?.get(eventId) || null;
}

/**
 * Create a new event
 */
export async function createEvent(
  userId: string,
  input: CreateEventInput,
  source: CalendarProvider = 'ferni'
): Promise<CalendarEvent> {
  await loadUserData(userId);

  const now = new Date();
  const endTime =
    input.endTime ||
    new Date(input.startTime.getTime() + (input.durationMinutes || 60) * 60 * 1000);

  const event: CalendarEvent = {
    id: generateEventId(),
    userId,
    title: input.title,
    description: input.description,
    location: input.location,
    startTime: input.startTime,
    endTime,
    isAllDay: input.isAllDay || false,
    attendees: input.attendees || [],
    status: 'confirmed',
    source,
    syncStatus: source === 'ferni' ? 'local' : 'synced',
    reminders: input.reminders || [{ method: 'popup', minutesBefore: 15 }],
    color: input.color,
    recurrence: input.recurrence,
    createdAt: now,
    updatedAt: now,
  };

  // Update cache
  const events = eventCache.get(userId) || new Map();
  events.set(event.id, event);
  eventCache.set(userId, events);

  // Persist to Firestore
  await persistEvent(userId, event);

  log.info({ userId, eventId: event.id, title: event.title, source }, 'Created calendar event');
  return event;
}

/**
 * Update an existing event
 */
export async function updateEvent(
  userId: string,
  eventId: string,
  updates: UpdateEventInput
): Promise<CalendarEvent | null> {
  await loadUserData(userId);

  const events = eventCache.get(userId);
  const event = events?.get(eventId);

  if (!event) {
    log.warn({ userId, eventId }, 'Event not found for update');
    return null;
  }

  // Apply updates
  const updated: CalendarEvent = {
    ...event,
    ...updates,
    updatedAt: new Date(),
    // Mark as needing sync if it was synced before
    syncStatus: event.syncStatus === 'synced' ? 'pending' : event.syncStatus,
  };

  if (events) {
    events.set(eventId, updated);
  }
  await persistEvent(userId, updated);

  log.info({ userId, eventId }, 'Updated calendar event');
  return updated;
}

/**
 * Delete an event
 */
export async function deleteEvent(userId: string, eventId: string): Promise<boolean> {
  await loadUserData(userId);

  const events = eventCache.get(userId);
  const event = events?.get(eventId);

  if (!event || !events) {
    return false;
  }

  // If synced, mark for deletion so sync engine can remove from provider
  if (event.syncStatus === 'synced' && event.externalId) {
    event.syncStatus = 'deleted';
    event.updatedAt = new Date();
    events.set(eventId, event);
    await persistEvent(userId, event);
    log.info({ userId, eventId }, 'Marked synced event for deletion');
  } else {
    // Local-only event, just delete it
    events.delete(eventId);
    await deletePersistedEvent(userId, eventId);
    log.info({ userId, eventId }, 'Deleted local calendar event');
  }

  return true;
}

/**
 * Import an event from an external provider
 */
export async function importExternalEvent(
  userId: string,
  provider: CalendarProvider,
  externalId: string,
  externalCalendarId: string,
  eventData: Omit<CreateEventInput, 'syncTo'>,
  etag?: string
): Promise<CalendarEvent> {
  await loadUserData(userId);

  // Check if we already have this event
  const events = eventCache.get(userId) || new Map();
  let existingEvent: CalendarEvent | undefined;

  for (const event of events.values()) {
    if (event.externalId === externalId && event.source === provider) {
      existingEvent = event;
      break;
    }
  }

  const now = new Date();

  if (existingEvent) {
    // Update existing event
    const updated: CalendarEvent = {
      ...existingEvent,
      title: eventData.title,
      description: eventData.description,
      location: eventData.location,
      startTime: eventData.startTime,
      endTime:
        eventData.endTime ||
        new Date(eventData.startTime.getTime() + (eventData.durationMinutes || 60) * 60 * 1000),
      isAllDay: eventData.isAllDay || false,
      attendees: eventData.attendees || [],
      reminders: eventData.reminders || [],
      syncStatus: 'synced',
      lastSyncAttempt: now,
      updatedAt: now,
      etag,
    };

    events.set(existingEvent.id, updated);
    await persistEvent(userId, updated);

    log.debug({ userId, eventId: existingEvent.id, provider }, 'Updated event from provider');
    return updated;
  }

  // Create new event from provider
  const event: CalendarEvent = {
    id: generateEventId(),
    userId,
    title: eventData.title,
    description: eventData.description,
    location: eventData.location,
    startTime: eventData.startTime,
    endTime:
      eventData.endTime ||
      new Date(eventData.startTime.getTime() + (eventData.durationMinutes || 60) * 60 * 1000),
    isAllDay: eventData.isAllDay || false,
    attendees: eventData.attendees || [],
    status: 'confirmed',
    source: provider,
    externalId,
    externalCalendarId,
    syncStatus: 'synced',
    lastSyncAttempt: now,
    reminders: eventData.reminders || [],
    color: eventData.color,
    createdAt: now,
    updatedAt: now,
    etag,
  };

  events.set(event.id, event);
  eventCache.set(userId, events);
  await persistEvent(userId, event);

  log.debug({ userId, eventId: event.id, provider, externalId }, 'Imported event from provider');
  return event;
}

/**
 * Import multiple events from an external provider
 * Used by webhooks and batch sync operations
 */
export async function importEventsFromProvider(
  userId: string,
  provider: CalendarProvider,
  events: Array<Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<number> {
  let imported = 0;

  for (const eventData of events) {
    try {
      await importExternalEvent(
        userId,
        provider,
        eventData.externalId || `${provider}_${Date.now()}_${imported}`,
        eventData.externalCalendarId || 'primary',
        {
          title: eventData.title,
          description: eventData.description,
          location: eventData.location,
          startTime: eventData.startTime,
          endTime: eventData.endTime,
          isAllDay: eventData.isAllDay,
          attendees: eventData.attendees,
          reminders: eventData.reminders,
          color: eventData.color,
        },
        eventData.etag
      );
      imported++;
    } catch (error) {
      log.warn({ error: String(error), userId, provider }, 'Failed to import event');
    }
  }

  log.info({ userId, provider, imported, total: events.length }, 'Imported events from provider');
  return imported;
}

// ============================================================================
// PROVIDER CONNECTION OPERATIONS
// ============================================================================

/**
 * Get all provider connections for a user
 */
export async function getProviderConnections(userId: string): Promise<ProviderConnection[]> {
  await loadUserData(userId);
  const providers = providerCache.get(userId) || new Map();
  return Array.from(providers.values());
}

/**
 * Get a specific provider connection
 */
export async function getProviderConnection(
  userId: string,
  provider: CalendarProvider
): Promise<ProviderConnection | null> {
  await loadUserData(userId);
  const providers = providerCache.get(userId);
  return providers?.get(provider) || null;
}

/**
 * Check if any provider is connected
 */
export async function hasAnyProviderConnected(userId: string): Promise<boolean> {
  const connections = await getProviderConnections(userId);
  return connections.some((c) => c.connected);
}

/**
 * Update provider connection
 */
export async function updateProviderConnection(
  userId: string,
  connection: ProviderConnection
): Promise<void> {
  await loadUserData(userId);

  const providers = providerCache.get(userId) || new Map();
  providers.set(connection.provider, connection);
  providerCache.set(userId, providers);

  await persistProviderConnection(userId, connection);
  log.info(
    { userId, provider: connection.provider, connected: connection.connected },
    'Updated provider connection'
  );
}

/**
 * Remove provider connection
 */
export async function removeProviderConnection(
  userId: string,
  provider: CalendarProvider
): Promise<void> {
  await loadUserData(userId);

  const providers = providerCache.get(userId);
  if (providers) {
    providers.delete(provider);
  }

  await deleteProviderConnection(userId, provider);
  log.info({ userId, provider }, 'Removed provider connection');
}

// ============================================================================
// AVAILABILITY OPERATIONS
// ============================================================================

const WORK_DAY_START_HOUR = 9;
const WORK_DAY_END_HOUR = 18;
const BACK_TO_BACK_GAP_MINUTES = 15;
const OVERLOAD_THRESHOLD_MINUTES = 360;

/**
 * Find free time slots on a given day
 */
export async function findFreeTimeSlots(
  userId: string,
  date: Date,
  options: { minDurationMinutes?: number; workDayOnly?: boolean } = {}
): Promise<TimeSlot[]> {
  const { minDurationMinutes = 30, workDayOnly = true } = options;

  const events = await getEventsForDay(userId, date);

  // Define work day boundaries
  const dayStart = new Date(date);
  dayStart.setHours(workDayOnly ? WORK_DAY_START_HOUR : 0, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(workDayOnly ? WORK_DAY_END_HOUR : 23, 59, 59, 999);

  // Find gaps between events
  const slots: TimeSlot[] = [];
  let currentTime = dayStart;

  // Sort events by start time and filter out all-day events
  const sortedEvents = events
    .filter((e) => !e.isAllDay)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (const event of sortedEvents) {
    if (event.startTime > currentTime) {
      const duration = Math.round((event.startTime.getTime() - currentTime.getTime()) / 60000);
      if (duration >= minDurationMinutes) {
        slots.push({
          start: new Date(currentTime),
          end: new Date(event.startTime),
          durationMinutes: duration,
        });
      }
    }
    if (event.endTime > currentTime) {
      currentTime = new Date(event.endTime);
    }
  }

  // Check for free time after last event
  if (currentTime < dayEnd) {
    const duration = Math.round((dayEnd.getTime() - currentTime.getTime()) / 60000);
    if (duration >= minDurationMinutes) {
      slots.push({
        start: new Date(currentTime),
        end: new Date(dayEnd),
        durationMinutes: duration,
      });
    }
  }

  return slots;
}

/**
 * Check if a specific time slot is available
 */
export async function isTimeSlotAvailable(
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  const events = await getEvents(userId, startTime, endTime);
  return events.filter((e) => !e.isAllDay).length === 0;
}

/**
 * Get day overview
 */
export async function getDayOverview(userId: string, date: Date): Promise<DayOverview> {
  const events = await getEventsForDay(userId, date);
  const nonAllDay = events.filter((e) => !e.isAllDay);

  const totalMeetingMinutes = nonAllDay.reduce((sum, e) => {
    return sum + Math.round((e.endTime.getTime() - e.startTime.getTime()) / 60000);
  }, 0);

  // Check for back-to-back meetings
  let hasBackToBack = false;
  for (let i = 1; i < nonAllDay.length; i++) {
    const gap = (nonAllDay[i].startTime.getTime() - nonAllDay[i - 1].endTime.getTime()) / 60000;
    if (gap < BACK_TO_BACK_GAP_MINUTES) {
      hasBackToBack = true;
      break;
    }
  }

  const workDayMinutes = (WORK_DAY_END_HOUR - WORK_DAY_START_HOUR) * 60;

  return {
    date,
    events,
    totalMeetings: nonAllDay.length,
    totalMeetingMinutes,
    freeTimeMinutes: workDayMinutes - totalMeetingMinutes,
    firstEvent: nonAllDay[0],
    lastEvent: nonAllDay[nonAllDay.length - 1],
    isOverloaded: totalMeetingMinutes > OVERLOAD_THRESHOLD_MINUTES,
    hasBackToBack,
  };
}

/**
 * Get week overview
 */
export async function getWeekOverview(
  userId: string,
  referenceDate: Date = new Date()
): Promise<WeekOverview> {
  const startOfWeek = new Date(referenceDate);
  startOfWeek.setDate(referenceDate.getDate() - referenceDate.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const days: DayOverview[] = [];
  let totalMeetings = 0;
  let busiestDay: { day: string; meetings: number } | null = null;
  let lightestDay: { day: string; meetings: number } | null = null;
  const backToBackDays: string[] = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);

    const overview = await getDayOverview(userId, day);
    days.push(overview);

    totalMeetings += overview.totalMeetings;

    const dayName = day.toLocaleDateString('en-US', { weekday: 'long' });

    if (!busiestDay || overview.totalMeetings > busiestDay.meetings) {
      busiestDay = { day: dayName, meetings: overview.totalMeetings };
    }
    if (!lightestDay || overview.totalMeetings < lightestDay.meetings) {
      lightestDay = { day: dayName, meetings: overview.totalMeetings };
    }
    if (overview.hasBackToBack) {
      backToBackDays.push(dayName);
    }
  }

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return {
    startDate: startOfWeek,
    endDate: endOfWeek,
    days,
    totalMeetings,
    busiestDay,
    lightestDay,
    backToBackDays,
    averageMeetingsPerDay: totalMeetings / 7,
  };
}

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

async function persistEvent(userId: string, event: CalendarEvent): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    const stored = eventToStored(event);
    await firestore
      .collection(getUserEventsCollection(userId))
      .doc(event.id)
      .set(cleanForFirestore(stored));
  } catch (error) {
    log.error({ error: String(error), eventId: event.id }, 'Failed to persist event');
  }
}

async function deletePersistedEvent(userId: string, eventId: string): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore.collection(getUserEventsCollection(userId)).doc(eventId).delete();
  } catch (error) {
    log.error({ error: String(error), eventId }, 'Failed to delete persisted event');
  }
}

async function persistProviderConnection(
  userId: string,
  connection: ProviderConnection
): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    const stored: StoredProviderConnection = {
      ...connection,
      lastSyncedAt: connection.lastSyncedAt?.toISOString(),
    };
    await firestore
      .collection(getUserProvidersCollection(userId))
      .doc(connection.provider)
      .set(cleanForFirestore(stored));
  } catch (error) {
    log.error(
      { error: String(error), provider: connection.provider },
      'Failed to persist provider connection'
    );
  }
}

async function deleteProviderConnection(userId: string, provider: CalendarProvider): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore.collection(getUserProvidersCollection(userId)).doc(provider).delete();
  } catch (error) {
    log.error({ error: String(error), provider }, 'Failed to delete provider connection');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear cache for a user (useful after sync)
 */
export function clearUserCache(userId: string): void {
  eventCache.delete(userId);
  providerCache.delete(userId);
  loadedUsers.delete(userId);
}

/**
 * Mark events as pending sync
 */
export async function markEventsForSync(userId: string, eventIds: string[]): Promise<void> {
  await loadUserData(userId);
  const events = eventCache.get(userId);
  if (!events) return;

  for (const eventId of eventIds) {
    const event = events.get(eventId);
    if (event && event.syncStatus === 'local') {
      event.syncStatus = 'pending';
      await persistEvent(userId, event);
    }
  }
}

/**
 * Get events that need syncing
 */
export async function getEventsNeedingSync(userId: string): Promise<CalendarEvent[]> {
  await loadUserData(userId);
  const events = eventCache.get(userId) || new Map();

  return Array.from(events.values()).filter(
    (e) => e.syncStatus === 'pending' || e.syncStatus === 'deleted'
  );
}

export default {
  // Event operations
  getEvents,
  getEventsForDay,
  getEventsForWeek,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  importExternalEvent,
  importEventsFromProvider,

  // Provider operations
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

  // Cache
  clearUserCache,
  markEventsForSync,
  getEventsNeedingSync,
};
