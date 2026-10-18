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
import {
  getValidAccessToken,
  isCalendarConfigured,
  updateEvent as updateGoogleEvent,
} from '../identity/google-calendar-oauth.js';
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

/** reconnect: tokens stored, no access token. not_ferni: from their own calendar, so left alone. */
export type GoogleFailure = 'failed' | 'reconnect' | 'not_ferni';

export type ProviderCreateResult =
  { status: 'saved'; externalId: string } | { status: GoogleFailure };

/** A change to a store event. 'not_google': it is not a copy of a Google event. */
export type GoogleChangeResult =
  { status: 'not_google' } | { status: 'done' | GoogleFailure; event: CalendarEvent };

const GOOGLE_CALENDAR_ID = 'primary';
const FERNI_ID = /^ferni[0-9a-f]{40}$/;

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

/**
 * Change or remove a Google event Ferni created (its id is one googleEventIdFor makes). Events
 * from the caller's own calendar are never touched. The copy follows only once Google took it.
 */
type GoogleWrite = (adapter: CalendarProviderAdapter, id: string, cal: string) => Promise<boolean>;

async function changeInGoogle(
  userId: string,
  eventId: string,
  what: 'update' | 'delete',
  write: GoogleWrite,
  followCopy: () => Promise<unknown>
): Promise<GoogleChangeResult> {
  const existing = await getEventById(userId, eventId);
  if (existing?.source !== 'google' || !existing.externalId) return { status: 'not_google' };
  if (!FERNI_ID.test(existing.externalId)) return { status: 'not_ferni', event: existing };
  const { externalId: id, externalCalendarId: cal = GOOGLE_CALENDAR_ID } = existing;
  const adapter = await googleAdapter(userId);
  if (typeof adapter === 'string') return { status: adapter, event: existing };
  if (!(await attempt(userId, `Google ${what}`, () => write(adapter, id, cal)))) {
    return { status: 'failed', event: existing };
  }
  await attempt(userId, `Ferni copy of a Google ${what}`, followCopy);
  return { status: 'done', event: existing };
}

/**
 * Change a Google event Ferni created. Only the changed fields are sent (no etag check: the
 * client has none): a whole copy would overwrite edits made on Google, and its guests.
 */
export async function updateEventInGoogle(
  userId: string,
  eventId: string,
  updates: UpdateEventInput
): Promise<GoogleChangeResult> {
  const existing = await getEventById(userId, eventId);
  const start = updates.startTime;
  const length = existing ? existing.endTime.getTime() - existing.startTime.getTime() : 0;
  // A new start keeps the length.
  const endTime = updates.endTime ?? (start ? new Date(start.getTime() + length) : undefined);
  const at = (date?: Date) => (date ? { dateTime: date.toISOString() } : undefined);
  const { title: summary, description, location } = updates;
  const body = { summary, description, location, start: at(start), end: at(endTime) };
  const changes = endTime ? { ...updates, endTime } : updates;
  const result = await changeInGoogle(
    userId,
    eventId,
    'update',
    async (_adapter, id, cal) => {
      const token = await getValidAccessToken(userId);
      return token ? Boolean(await updateGoogleEvent(token, cal, id, body)) : false;
    },
    () => updateEvent(userId, eventId, changes)
  );
  if (result.status !== 'done') return result;
  return { status: 'done', event: { ...result.event, ...changes } };
}

/** Remove a Google event Ferni created. */
export function deleteEventInGoogle(userId: string, eventId: string): Promise<GoogleChangeResult> {
  return changeInGoogle(
    userId,
    eventId,
    'delete',
    (adapter, id, cal) => adapter.deleteEvent(userId, id, cal),
    () => deleteEvent(userId, eventId)
  );
}
