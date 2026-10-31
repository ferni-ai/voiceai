/**
 * The Google scopes Ferni asks for, in one place. These must match what is declared
 * on the OAuth consent screen in the Google Cloud console, or the connect shows
 * "unverified app" and counts against the unverified-user cap.
 *
 * Least privilege, by the Calendar API call that needs each:
 * - calendar.events:   events.insert/patch/update/delete, events.list, events.watch
 * - calendar.readonly: calendarList.list, freeBusy.query (calendar.events does not cover it)
 * Full `calendar` (create or delete whole calendars, ACLs) is not needed by any call.
 * Gmail is not requested: gmail.readonly is restricted and needs a yearly CASA review.
 *
 * @module config/google-calendar-scopes
 */

const API = 'https://www.googleapis.com/auth';

export const CALENDAR_EVENTS_SCOPE = `${API}/calendar.events`;
export const CALENDAR_READONLY_SCOPE = `${API}/calendar.readonly`;
/** Granted to links made before the narrowing; it covers both of the above. */
export const CALENDAR_FULL_SCOPE = `${API}/calendar`;

/** What the connect flows request. */
export const GOOGLE_CALENDAR_SCOPES = [CALENDAR_EVENTS_SCOPE, CALENDAR_READONLY_SCOPE] as const;
