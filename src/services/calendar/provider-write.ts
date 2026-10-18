/**
 * Writing a new event to the caller's connected calendar (#1749).
 *
 * The unified store keeps every event in Ferni's own list, and nothing pushes a
 * new one out (the sync engine has no caller). This module writes through the
 * provider adapter that already holds the tokens and their refresh, then keeps a
 * copy in the store so Ferni's own reads see the event before any sync.
 *
 * Only Google is written today: its adapter writes to the 'primary' calendar,
 * which the copy can name. Outlook and Apple need the calendar the adapter
 * picked to update or delete later, so they are reported, not written.
 *
 * @module services/calendar/provider-write
 */
import { isCalendarConfigured } from '../identity/google-calendar-oauth.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getProvider } from './providers/provider-registry.js';
import type { CalendarEvent, CalendarProvider, CreateEventInput } from './types.js';
import { getProviderConnections, importExternalEvent } from './unified-calendar-store.js';

const log = createLogger({ module: 'calendar-provider-write' });

export type ConnectedProvider = Exclude<CalendarProvider, 'ferni'>;

export type ProviderCreateResult =
  | { status: 'saved'; provider: ConnectedProvider; externalId: string }
  | { status: 'failed'; provider: ConnectedProvider };

/** Google's own calendar, where its adapter writes when no calendar is named. */
const GOOGLE_CALENDAR_ID = 'primary';

/**
 * The calendar the caller has connected, or null. Google sign-in stores tokens,
 * not a provider record, so the tokens are checked first (as isConnected does).
 */
export async function connectedProvider(userId: string): Promise<ConnectedProvider | null> {
  if (await isCalendarConfigured(userId)) return 'google';
  const connections = await getProviderConnections(userId);
  const record = connections.find((c) => c.connected && c.provider !== 'ferni');
  return record ? (record.provider as ConnectedProvider) : null;
}

/** The input as the adapter takes it: an event that exists nowhere yet. */
function draftEvent(userId: string, input: CreateEventInput): CalendarEvent {
  const now = new Date();
  return {
    id: `draft_${now.getTime()}`,
    userId,
    title: input.title,
    description: input.description,
    location: input.location,
    startTime: input.startTime,
    endTime:
      input.endTime ??
      new Date(input.startTime.getTime() + (input.durationMinutes ?? 60) * 60 * 1000),
    isAllDay: false,
    attendees: input.attendees ?? [],
    status: 'confirmed',
    source: 'google',
    externalCalendarId: GOOGLE_CALENDAR_ID,
    syncStatus: 'pending',
    // None: the caller's own calendar defaults apply.
    reminders: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create the event in the caller's Google Calendar. A failed write saves nothing
 * anywhere, so the caller is never told it was added when it wasn't.
 */
export async function createEventInGoogle(
  userId: string,
  input: CreateEventInput
): Promise<ProviderCreateResult> {
  const adapter = getProvider('google');
  if (!adapter) {
    log.error({ userId }, 'No Google calendar adapter is registered');
    return { status: 'failed', provider: 'google' };
  }

  const event = draftEvent(userId, input);
  let externalId: string | null;
  try {
    externalId = await adapter.createEvent(userId, event);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Google Calendar create threw');
    return { status: 'failed', provider: 'google' };
  }
  if (!externalId) {
    // The adapter logged why (no valid token, or the API refused it).
    log.warn({ userId }, 'Google Calendar create returned no event id');
    return { status: 'failed', provider: 'google' };
  }

  try {
    await importExternalEvent(userId, 'google', externalId, GOOGLE_CALENDAR_ID, {
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      attendees: event.attendees,
    });
  } catch (error) {
    // The event is on their calendar; only Ferni's copy is missing until the next import.
    log.warn(
      { error: String(error), userId, externalId },
      'Created in Google Calendar but Ferni copy failed'
    );
  }

  log.info({ userId, externalId }, 'Created event in Google Calendar');
  return { status: 'saved', provider: 'google', externalId };
}
