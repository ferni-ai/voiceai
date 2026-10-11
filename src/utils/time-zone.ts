/**
 * IANA time zone checks shared across layers (the voice agent's time context,
 * the API's token route and the seed earn rules all take a zone from a client).
 *
 * @module utils/time-zone
 */

/** True for an IANA zone the runtime knows ("America/New_York"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
