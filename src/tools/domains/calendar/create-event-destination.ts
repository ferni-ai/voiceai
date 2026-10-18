/**
 * Where createCalendarEvent saves, and the line that says so (#1749).
 *
 * Off (CALENDAR_PROVIDER_WRITE unset): Ferni's own list, with the line it has
 * always said. On: a caller with Google Calendar connected gets the event there,
 * and the result names Google. A failed Google write says it failed and saves
 * nothing, so it is never reported as added. Outlook and Apple are not written
 * yet: the event goes to Ferni's own list and the result says it isn't on their
 * calendar, which the claim guard (action-claims.ts) reads as "elsewhere".
 * With nothing connected the connection gate words the result (#1547).
 *
 * @module tools/domains/calendar/create-event-destination
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { createEvent, type CreateEventInput } from '../../../services/calendar/index.js';
import {
  connectedProvider,
  createEventInGoogle,
  type ConnectedProvider,
} from '../../../services/calendar/provider-write.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'calendar-create-destination' });

const PROVIDER_NAME: Record<ConnectedProvider, string> = {
  google: 'Google Calendar',
  outlook: 'Outlook',
  apple: 'Apple Calendar',
};

/**
 * Save a new event and say where it went. `when` is the start as the caller
 * hears it ("Tuesday, November 3 at 1:00 PM your time").
 */
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
    return result.status === 'saved'
      ? `Added to your Google Calendar: ${what}.`
      : `I couldn't add "${input.title}" to your Google Calendar, so it isn't on your calendar. Nothing was saved.`;
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
  const why = provider ? `, since I can't add to ${PROVIDER_NAME[provider]} yet` : '';
  return `Saved to Ferni's own list: ${what}. It isn't on your calendar${why}.`;
}
