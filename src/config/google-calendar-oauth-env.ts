/**
 * The Google Calendar OAuth client settings, trimmed.
 *
 * A secret stored with a trailing newline (echo without -n, a pasted value)
 * reaches the process verbatim. Google then rejects the client id or redirect
 * URI with a generic error and connect fails with nothing in our logs saying
 * why. Every reader goes through here so whitespace never reaches Google.
 *
 * @module config/google-calendar-oauth-env
 */

/** GOOGLE_CALENDAR_CLIENT_ID, trimmed ('' when unset). */
export function googleCalendarClientId(): string {
  return (process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '').trim();
}

/** GOOGLE_CALENDAR_CLIENT_SECRET, trimmed ('' when unset). */
export function googleCalendarClientSecret(): string {
  return (process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '').trim();
}

/** GOOGLE_CALENDAR_REDIRECT_URI, trimmed; `fallback` when unset or blank. */
export function googleCalendarRedirectUri(fallback: string): string {
  return (process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? '').trim() || fallback;
}

/** Both client id and secret are set (after trimming). */
export function isGoogleCalendarOAuthConfigured(): boolean {
  return googleCalendarClientId() !== '' && googleCalendarClientSecret() !== '';
}
