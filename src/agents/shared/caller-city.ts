/**
 * Where the caller is, in Ferni's prompt.
 *
 * The call carries the caller's city from their device (dispatch metadata
 * city/regionCode, put on userData.userLocation by voice-agent-entry), and the
 * location tools already default to it (tools/shared/caller-location.ts). The
 * prompt never said it. On a prod call Ferni looked up the weather for "Dade
 * City, FL" at the greeting and again 12 s earlier, then answered "Do you know
 * where I live?" with "Just, uh, whatever your weather app tells me"
 * (2026-10-12).
 *
 * With CALLER_CITY_CONTEXT=on the call-specific part of the prompt says which
 * city they're in. City and region only: the value is client-supplied, so it
 * keeps only characters a place name uses (no digits, so no coordinates,
 * street numbers or postal codes), and anything too long to be a place name is
 * dropped rather than cut into a wrong one. Off: the prompt is unchanged.
 *
 * @module agents/shared/caller-city
 */

import { flagOn, type Env } from '../../config/env-flag.js';

/** The caller's detected location as voice-agent-entry stores it on userData. */
export interface CallerCity {
  city?: string;
  regionCode?: string;
}

const MAX_CHARS = 60;
const MAX_WORDS = 5;

/** Letters, marks, spaces and the punctuation place names use; everything else is a space. */
const NOT_PLACE_NAME = /[^\p{L}\p{M} .'’-]/gu;

function placeName(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.normalize('NFKC').replace(NOT_PLACE_NAME, ' ').replace(/\s+/g, ' ').trim();
  if (!/\p{L}/u.test(cleaned)) return ''; // what's left of "28.36, -82.19" is ". - ."
  if (cleaned.length > MAX_CHARS || cleaned.split(' ').length > MAX_WORDS) return '';
  return cleaned;
}

/** "Dade City, FL", or the city alone; undefined when there is no usable city. */
export function callerCityName(location: CallerCity | undefined): string | undefined {
  const city = placeName(location?.city);
  if (!city) return undefined;
  const region = placeName(location?.regionCode);
  const both = region ? `${city}, ${region}` : city;
  return both.length > MAX_CHARS ? city : both;
}

/**
 * The prompt section naming the caller's city, or '' when the flag is off,
 * the city is unknown, or the person on the line isn't the device's owner (a
 * call Ferni placed for someone).
 */
export function callerCityContext(
  location: CallerCity | undefined,
  outboundCall: boolean,
  env: Env = process.env
): string {
  if (outboundCall || !flagOn('CALLER_CITY_CONTEXT', env)) return '';
  const where = callerCityName(location);
  if (!where) return '';
  return `
---

## Where They Are

They're in ${where} (from their device). If they ask where they are or where they live, say it plainly; don't bring it up out of nowhere.
`;
}
