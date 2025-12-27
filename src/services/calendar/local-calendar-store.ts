/**
 * Local Calendar Store
 *
 * Firestore-backed calendar storage for users without Google Calendar.
 * Provides the same interface as Google Calendar but stores locally.
 *
 * Benefits:
 * - Works without any external OAuth
 * - Data owned by user in Firestore
 * - Seamless fallback when Google not connected
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { CalendarEvent, CreateEventInput } from './calendar-service.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface StoredEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string; // ISO string for Firestore
  endTime: string;
  isAllDay: boolean;
  attendees: string[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

let db: FirestoreType | null = null;
const LOCAL_CALENDAR_COLLECTION = 'local_calendar_events';

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Local calendar Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for local calendar');
    return null;
  }
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const eventCache = new Map<string, CalendarEvent[]>();
const loadedUsers = new Set<string>();

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

/**
 * Load events from Firestore for a user
 */
async function loadUserEvents(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  const firestore = await getFirestore();
  if (!firestore) {
    loadedUsers.add(userId);
    return;
  }

  try {
    const snapshot = await firestore
      .collection(LOCAL_CALENDAR_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('startTime', 'asc')
      .get();

    const events: CalendarEvent[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data() as StoredEvent;
      events.push(storedEventToCalendarEvent(data));
    }

    eventCache.set(userId, events);
    loadedUsers.add(userId);
    log.debug({ userId, count: events.length }, 'Loaded local calendar events');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load local calendar events');
    loadedUsers.add(userId);
  }
}

/**
 * Persist event to Firestore
 */
async function persistEvent(userId: string, event: CalendarEvent): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  const stored: StoredEvent = {
    id: event.id,
    userId,
    title: event.title,
    description: event.description,
    location: event.location,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    isAllDay: event.isAllDay,
    attendees: event.attendees,
    status: event.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await firestore.collection(LOCAL_CALENDAR_COLLECTION).doc(event.id).set(cleanForFirestore(stored));
  } catch (error) {
    log.error({ error: String(error), eventId: event.id }, 'Failed to persist local event');
  }
}

/**
 * Delete event from Firestore
 */
async function deletePersistedEvent(eventId: string): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore.collection(LOCAL_CALENDAR_COLLECTION).doc(eventId).delete();
  } catch (error) {
    log.error({ error: String(error), eventId }, 'Failed to delete persisted event');
  }
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

function storedEventToCalendarEvent(stored: StoredEvent): CalendarEvent {
  return {
    id: stored.id,
    title: stored.title,
    description: stored.description,
    location: stored.location,
    startTime: new Date(stored.startTime),
    endTime: new Date(stored.endTime),
    isAllDay: stored.isAllDay,
    attendees: stored.attendees || [],
    status: stored.status,
    calendarId: 'local',
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get events for a date range from local storage
 */
export async function getLocalEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  await loadUserEvents(userId);

  const events = eventCache.get(userId) || [];
  return events.filter((e) => {
    return e.startTime >= startDate && e.startTime <= endDate;
  });
}

/**
 * Get events for a specific day
 */
export async function getLocalEventsForDay(userId: string, date: Date): Promise<CalendarEvent[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return getLocalEvents(userId, startOfDay, endOfDay);
}

/**
 * Create a new local event
 */
export async function createLocalEvent(
  userId: string,
  input: CreateEventInput
): Promise<CalendarEvent> {
  await loadUserEvents(userId);

  const endTime =
    input.endTime ||
    new Date(input.startTime.getTime() + (input.durationMinutes || 60) * 60 * 1000);

  const event: CalendarEvent = {
    id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    title: input.title,
    description: input.description,
    location: input.location,
    startTime: input.startTime,
    endTime,
    isAllDay: false,
    attendees: input.attendees || [],
    status: 'confirmed',
    calendarId: 'local',
  };

  // Update cache
  const events = eventCache.get(userId) || [];
  events.push(event);
  events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  eventCache.set(userId, events);

  // Persist
  await persistEvent(userId, event);

  log.info({ userId, eventId: event.id, title: event.title }, 'Local calendar event created');
  return event;
}

/**
 * Update a local event
 */
export async function updateLocalEvent(
  userId: string,
  eventId: string,
  updates: Partial<CreateEventInput>
): Promise<CalendarEvent | null> {
  await loadUserEvents(userId);

  const events = eventCache.get(userId) || [];
  const eventIndex = events.findIndex((e) => e.id === eventId);

  if (eventIndex < 0) {
    return null;
  }

  const event = events[eventIndex];

  // Apply updates
  if (updates.title) event.title = updates.title;
  if (updates.description) event.description = updates.description;
  if (updates.location) event.location = updates.location;
  if (updates.startTime) event.startTime = updates.startTime;
  if (updates.endTime) event.endTime = updates.endTime;
  if (updates.attendees) event.attendees = updates.attendees;

  // Re-sort by start time
  events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  eventCache.set(userId, events);

  // Persist
  await persistEvent(userId, event);

  log.info({ userId, eventId }, 'Local calendar event updated');
  return event;
}

/**
 * Delete a local event
 */
export async function deleteLocalEvent(userId: string, eventId: string): Promise<boolean> {
  await loadUserEvents(userId);

  const events = eventCache.get(userId) || [];
  const eventIndex = events.findIndex((e) => e.id === eventId);

  if (eventIndex < 0) {
    return false;
  }

  events.splice(eventIndex, 1);
  eventCache.set(userId, events);

  // Delete from Firestore
  await deletePersistedEvent(eventId);

  log.info({ userId, eventId }, 'Local calendar event deleted');
  return true;
}

/**
 * Check if user has any local events (to determine if local mode is active)
 */
export async function hasLocalEvents(userId: string): Promise<boolean> {
  await loadUserEvents(userId);
  const events = eventCache.get(userId) || [];
  return events.length > 0;
}

/**
 * Clear cache for a user (useful when they connect Google Calendar)
 */
export function clearLocalCache(userId: string): void {
  eventCache.delete(userId);
  loadedUsers.delete(userId);
}

export default {
  getLocalEvents,
  getLocalEventsForDay,
  createLocalEvent,
  updateLocalEvent,
  deleteLocalEvent,
  hasLocalEvents,
  clearLocalCache,
};
