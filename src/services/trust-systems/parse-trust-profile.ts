/**
 * Read a stored trust profile back with its dates as Dates.
 *
 * Profiles are stored as JSON strings, and JSON turns every Date into an ISO
 * string. Code reads them as Dates (`profile.lastNoAgendaOutreach.getTime()`),
 * so a profile loaded from a previous call threw "getTime is not a function"
 * and trust-based outreach failed for every returning caller.
 *
 * @module services/trust-systems/parse-trust-profile
 */

/** Exactly what JSON.stringify writes for a Date. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function parseTrustProfile<T>(json: string): T {
  return JSON.parse(json, (_key, value: unknown) =>
    typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value
  ) as T;
}
