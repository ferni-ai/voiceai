/**
 * Writes to the caller's Google Calendar through its adapter (tokens and refresh),
 * then keeps the store copy in step (#1749); nothing else pushes store changes out.
 * Outlook and Apple are not written: changing them later needs the calendar their
 * adapter picked. Model-filled attendees are never written (inviting needs the
 * caller's confirmation, not built yet), and the Google client sends sendUpdates=none.
 *
 * @module services/calendar/provider-write
 */
import { createHash } from 'node:crypto';
import { getValidAccessToken, isCalendarConfigured } from '../identity/google-calendar-oauth.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getProvider } from './providers/provider-registry.js';
import type {
  CalendarEvent,
  CalendarProvider,
  CalendarProviderAdapter,
  CreateEventInput,
  UpdateEventInput,
} from './types.js';
import {
  deleteEvent,
  getEventById,
  getProviderConnections,
  importExternalEvent,
  updateEvent,
} from './unified-calendar-store.js';

const log = createLogger({ module: 'calendar-provider-write' });

export type ConnectedProvider = Exclude<CalendarProvider, 'ferni'>;

/** reconnect: tokens stored, no access token. guests: a change would reset or cancel it for them. */
export type GoogleFailure = 'failed' | 'reconnect' | 'guests';

export type ProviderCreateResult =
  { status: 'saved'; externalId: string } | { status: GoogleFailure };

/** A change to a store event. 'not_google': it is not a copy of a Google event. */
export type GoogleChangeResult =
  { status: 'not_google' } | { status: 'done' | GoogleFailure; event: CalendarEvent };

const GOOGLE_CALENDAR_ID = 'primary';

/** The connected calendar, or null. Google sign-in stores tokens, not a provider record. */
export async function connectedProvider(userId: string): Promise<ConnectedProvider | null> {
  if (await isCalendarConfigured(userId)) return 'google';
  const connections = await getProviderConnections(userId);
  const record = connections.find((c) => c.connected && c.provider !== 'ferni');
  return record ? (record.provider as ConnectedProvider) : null;
}

/** One id per caller, title and start: a repeat is Google's 409, not a second event (hex is base32hex). */
export function googleEventIdFor(userId: string, input: CreateEventInput): string {
  const key = `${userId}\n${input.title}\n${input.startTime.toISOString()}`;
  return `ferni${createHash('sha256').update(key).digest('hex').slice(0, 40)}`;
}

/** The input as the adapter takes it: an event that exists nowhere yet. */
function draftEvent(userId: string, input: CreateEventInput): CalendarEvent {
  const now = new Date();
  const minutes = input.durationMinutes ?? 60;
  return {
    id: `draft_${now.getTime()}`,
    userId,
    title: input.title,
    description: input.description,
    location: input.location,
    startTime: input.startTime,
    endTime: input.endTime ?? new Date(input.startTime.getTime() + minutes * 60 * 1000),
    isAllDay: false,
    attendees: [], // never the model's list: see the module note
    status: 'confirmed',
    source: 'google',
    externalId: googleEventIdFor(userId, input),
    externalCalendarId: GOOGLE_CALENDAR_ID,
    syncStatus: 'pending',
    reminders: [], // the caller's own calendar defaults apply
    createdAt: now,
    updatedAt: now,
  };
}

/** The Google adapter, or why a write can't start: none registered, or the connection is dead. */
async function googleAdapter(userId: string): Promise<CalendarProviderAdapter | GoogleFailure> {
  const adapter = getProvider('google');
  if (!adapter) {
    log.error({ userId }, 'No Google calendar adapter is registered');
    return 'failed';
  }
  if (!(await getValidAccessToken(userId))) {
    log.warn({ userId }, 'Google Calendar tokens stored but no valid access token');
    return 'reconnect';
  }
  return adapter;
}

/** A call whose throw is logged and reported as null, never passed on as success. */
async function attempt<T>(userId: string, what: string, call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (error) {
    log.warn({ error: String(error), userId }, `Calendar ${what} failed`);
    return null;
  }
}

/** Create in the caller's Google Calendar. A failed write saves nothing anywhere. */
export async function createEventInGoogle(
  userId: string,
  input: CreateEventInput
): Promise<ProviderCreateResult> {
  const adapter = await googleAdapter(userId);
  if (typeof adapter === 'string') return { status: adapter };

  const event = draftEvent(userId, input);
  // A null id means the adapter refused; it logged why.
  const externalId = await attempt(userId, 'create', () => adapter.createEvent(userId, event));
  if (!externalId) return { status: 'failed' };

  // The event is on their calendar either way; a failed copy only waits for the next import.
  await attempt(userId, 'Ferni copy of a Google create', () =>
    importExternalEvent(userId, 'google', externalId, GOOGLE_CALENDAR_ID, event)
  );
  log.info({ userId, externalId }, 'Created event in Google Calendar');
  return { status: 'saved', externalId };
}

/** Change or remove a Google event Ferni holds a copy of; the copy follows only once Google took it. */
async function changeInGoogle(
  userId: string,
  eventId: string,
  what: 'update' | 'delete',
  write: (adapter: CalendarProviderAdapter, existing: CalendarEvent) => Promise<boolean>,
  followCopy: () => Promise<unknown>
): Promise<GoogleChangeResult> {
  const existing = await getEventById(userId, eventId);
  if (existing?.source !== 'google' || !existing.externalId) return { status: 'not_google' };
  if (existing.attendees.length > 0) return { status: 'guests', event: existing };
  const adapter = await googleAdapter(userId);
  if (typeof adapter === 'string') return { status: adapter, event: existing };
  if (!(await attempt(userId, `Google ${what}`, () => write(adapter, existing)))) {
    return { status: 'failed', event: existing };
  }
  await attempt(userId, `Ferni copy of a Google ${what}`, followCopy);
  return { status: 'done', event: existing };
}

/** Change a Google event. A new start with no new end keeps its length. */
export async function updateEventInGoogle(
  userId: string,
  eventId: string,
  updates: UpdateEventInput
): Promise<GoogleChangeResult> {
  let changed: CalendarEvent | undefined;
  let endTime: Date | undefined;
  const result = await changeInGoogle(
    userId,
    eventId,
    'update',
    (adapter, existing) => {
      const length = existing.endTime.getTime() - existing.startTime.getTime();
      const start = updates.startTime;
      endTime = updates.endTime ?? (start ? new Date(start.getTime() + length) : existing.endTime);
      changed = { ...existing, ...updates, endTime };
      return adapter.updateEvent(userId, changed);
    },
    () => updateEvent(userId, eventId, { ...updates, endTime })
  );
  return result.status === 'done' && changed ? { status: 'done', event: changed } : result;
}

/** Remove a Google event. */
export function deleteEventInGoogle(userId: string, eventId: string): Promise<GoogleChangeResult> {
  return changeInGoogle(
    userId,
    eventId,
    'delete',
    (adapter, existing) =>
      adapter.deleteEvent(
        userId,
        existing.externalId ?? '',
        existing.externalCalendarId ?? GOOGLE_CALENDAR_ID
      ),
    () => deleteEvent(userId, eventId)
  );
}
