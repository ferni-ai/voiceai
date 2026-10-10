/**
 * The caller's location as a default for location-taking tools.
 *
 * The voice agent puts the caller's detected location (city, regionCode) on
 * the session's userData. Tools that look something up "near me" or route
 * "from here" fall back to it when the model passes no location, so the agent
 * answers instead of asking which city the caller is in.
 *
 * Fast-path tools are built once and shared (userId 'shared'), so their ctx
 * has no userLocation; the caller's location comes with the call, in the
 * RunContext LiveKit passes as execute's second argument. Never a
 * process-wide "current session": a worker runs several calls at once.
 */

import type { ToolContext } from '../registry/types.js';

type DetectedLocation = ToolContext['userLocation'];

/** Values the model sends when it means "wherever I am". Matched whole, never as substrings. */
const PLACEHOLDER_LOCATIONS = new Set([
  'current',
  'current location',
  'my current location',
  'here',
  'from here',
  'my location',
  'where i am',
  'local',
  'nearby',
  'near me',
]);

/** LiveKit hands each tool call its session's RunContext; userData holds the caller's location. */
function locationFromCall(opts: unknown): DetectedLocation {
  const userData = (
    opts as { ctx?: { userData?: { userLocation?: DetectedLocation } } } | undefined
  )?.ctx?.userData;
  return userData?.userLocation;
}

/** True when the model left the location out or sent a "wherever I am" placeholder. */
export function isUnspecifiedLocation(location: string | undefined): boolean {
  const trimmed = location?.trim().toLowerCase();
  return !trimmed || PLACEHOLDER_LOCATIONS.has(trimmed);
}

/**
 * The caller's detected location as a query string ("St. George, UT"), from
 * the call first, then the tool's ctx. Undefined when neither knows a city.
 */
export function callerLocation(opts: unknown, ctx?: ToolContext): string | undefined {
  const fromCall = locationFromCall(opts);
  const detected = fromCall?.city ? fromCall : ctx?.userLocation;
  if (!detected?.city) return undefined;
  return detected.regionCode ? `${detected.city}, ${detected.regionCode}` : detected.city;
}

/** The place to use: an explicit location, else the caller's detected location. */
export function resolveCallerLocation(
  location: string | undefined,
  opts: unknown,
  ctx?: ToolContext
): string | undefined {
  if (!isUnspecifiedLocation(location)) return location?.trim();
  return callerLocation(opts, ctx);
}
