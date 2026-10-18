/**
 * Where the calendar write tools save, and the line that says so (#1749). Flag
 * off: Ferni's own list, with the lines they have always said. CALENDAR_PROVIDER_WRITE
 * on with Google connected: creates, and changes to events from Google, go to
 * Google first; a failure says so and changes nothing. Other providers get Ferni's
 * list and "isn't on your calendar" (the claim guard's "elsewhere"). With nothing
 * connected the #1547 gate words the result.
 *
 * @module tools/domains/calendar/calendar-write-destination
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import {
  createEvent,
  deleteEvent,
  updateEvent,
  type CreateEventInput,
} from '../../../services/calendar/index.js';
import {
  connectedProvider,
  createEventInGoogle,
  deleteEventInGoogle,
  updateEventInGoogle,
  type ConnectedProvider,
  type GoogleFailure,
} from '../../../services/calendar/provider-write.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'calendar-write-destination' });

const NAME: Record<ConnectedProvider, string> = {
  google: 'Google',
  outlook: 'Outlook',
  apple: 'Apple',
};

/** Why a Google write didn't happen, as the end of "I couldn't ... your Google Calendar". */
const WHY: Record<GoogleFailure, string> = {
  failed: '',
  reconnect: ', since the Google Calendar connection needs reconnecting',
  guests: ", since it has guests and I can't change it for them from here",
};

/** Save a new event and say where. `when` is the start as the caller hears it. */
export async function saveNewEvent(
  userId: string,
  input: CreateEventInput,
  when: string,
  env: Env = process.env
): Promise<string> {
  const what = `"${input.title}", ${when}, ${input.durationMinutes ?? 60} minutes`;
  const providerWrite = flagOn('CALENDAR_PROVIDER_WRITE', env);
  const provider = providerWrite ? await connectedProvider(userId) : null;

  if (provider === 'google') {
    const result = await createEventInGoogle(userId, input);
    if (result.status !== 'saved') {
      return `I couldn't add "${input.title}" to your Google Calendar${WHY[result.status]}, so it isn't on your calendar. Nothing was saved.`;
    }
    // Guests are never sent to Google (provider-write.ts), so the model must not say they were.
    const guests =
      (input.attendees ?? []).length > 0 ? " I didn't invite anyone, so no invites went out." : '';
    return `Added to your Google Calendar: ${what}.${guests}`;
  }

  const created: unknown = await createEvent(userId, input);
  if (!created) {
    return "Couldn't create the event. There might be an issue with your calendar connection.";
  }
  log.info({ userId, provider }, 'Created calendar event in Ferni list');

  if (!providerWrite) {
    // createEvent keeps it in Ferni's own calendar; nothing pushes it to Google.
    return `Saved to the Ferni calendar only, not Google Calendar: ${what}.`;
  }
  const why = provider ? `, since I can't add to ${NAME[provider]} yet` : '';
  return `Saved to Ferni's own list: ${what}. It isn't on your calendar${why}.`;
}

/** Change an event and say where. `when` words a start time for the caller. */
export async function saveEventChange(
  userId: string,
  eventId: string,
  updates: Partial<CreateEventInput>,
  when: (start: Date) => string,
  env: Env = process.env
): Promise<string> {
  const providerWrite = flagOn('CALENDAR_PROVIDER_WRITE', env);
  if (providerWrite) {
    const result = await updateEventInGoogle(userId, eventId, updates);
    if (result.status === 'done') {
      return `Updated on your Google Calendar. ${result.event.title} is now scheduled for ${when(result.event.startTime)}.`;
    }
    if (result.status !== 'not_google') {
      return `I couldn't change "${result.event.title}" on your Google Calendar${WHY[result.status]}, so it's unchanged there.`;
    }
  }

  const updated = await updateEvent(userId, eventId, updates);
  if (!updated) {
    return "Couldn't update that event. It may have been deleted or there's a calendar connection issue.";
  }
  log.info({ userId, eventId }, 'Updated calendar event');
  const line = `${updated.title} is now scheduled for ${when(updated.startTime)}.`;
  return providerWrite
    ? `Updated on Ferni's own list. ${line} It isn't on your calendar.`
    : `Updated. ${line}`;
}

/** Remove an event and say from where. `title` is the model's name for it, if given. */
export async function removeEvent(
  userId: string,
  eventId: string,
  title: string | undefined,
  env: Env = process.env
): Promise<string> {
  const providerWrite = flagOn('CALENDAR_PROVIDER_WRITE', env);
  if (providerWrite) {
    const result = await deleteEventInGoogle(userId, eventId);
    if (result.status === 'done')
      return `${result.event.title} has been removed from your Google Calendar.`;
    if (result.status !== 'not_google') {
      return `I couldn't remove "${result.event.title}" from your Google Calendar${WHY[result.status]}, so it's still there.`;
    }
  }

  if (!(await deleteEvent(userId, eventId))) {
    return "Couldn't delete that event. It may already be gone or there's a connection issue.";
  }
  log.info({ userId, eventId }, 'Deleted calendar event');
  const name = title || 'The event';
  return providerWrite
    ? `${name} has been removed from Ferni's own list.`
    : `${name} has been removed from your calendar.`;
}
