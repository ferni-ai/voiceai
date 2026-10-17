/**
 * Where a "near me" search looks, when the caller hasn't named a place.
 *
 * Order, behind PLACES_LOCATION (off: resolveCallerLocation, unchanged):
 *   1. the place the model got from this call (the caller said it);
 *   2. the city the caller agreed to have remembered (saveCallerCity);
 *   3. the city their phone shows (userData.userLocation, from dispatch metadata).
 * Nothing known: undefined, and the tool asks where they are.
 *
 * City level only. Nothing here stores a street, a postcode, GPS or
 * coordinates: a value with a digit in it is refused, not trimmed.
 *
 * @module tools/domains/local-search/caller-city
 */

import { flagOn } from '../../../config/env-flag.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext } from '../../registry/types.js';
import {
  callerLocation,
  isUnspecifiedLocation,
  resolveCallerLocation,
} from '../../shared/caller-location.js';
import { getUserPreferences, updateUserPreferences } from '../information/preferences/storage.js';

const log = getLogger();

const MAX_CHARS = 40;
const MAX_WORDS = 4;
/** Letters and the punctuation place names use. No digits: those mean a street, a postcode or coordinates. */
const CITY_CHARS = /^[\p{L}\p{M} .'’-]+$/u;

export type SaveCityResult = 'saved' | 'not-a-city' | 'failed';

export function placesLocationOn(env = process.env): boolean {
  return flagOn('PLACES_LOCATION', env);
}

/** A city or region name as the caller said it, or undefined for anything that is not one. */
export function cityOnly(value: string | undefined): string | undefined {
  const cleaned = value?.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > MAX_CHARS || cleaned.split(' ').length > MAX_WORDS) {
    return undefined;
  }
  if (!CITY_CHARS.test(cleaned) || !/\p{L}/u.test(cleaned)) return undefined;
  return cleaned;
}

/**
 * The caller on this call. Fast-path tools share one ctx (userId 'shared'), so
 * the call's own userData decides; never 'shared' as a caller.
 */
export function callerUserId(opts: unknown, ctx?: ToolContext): string | undefined {
  const fromCall = (opts as { ctx?: { userData?: { userId?: unknown } } } | undefined)?.ctx
    ?.userData?.userId;
  if (typeof fromCall === 'string' && fromCall && fromCall !== 'shared') return fromCall;
  return ctx?.userId && ctx.userId !== 'shared' ? ctx.userId : undefined;
}

/** "Philadelphia, PA" for the caller's saved city; undefined when none is saved or the read fails. */
export async function savedCallerLocation(userId: string): Promise<string | undefined> {
  try {
    const { callerCity } = await getUserPreferences(userId);
    if (!callerCity?.city) return undefined;
    return callerCity.regionCode ? `${callerCity.city}, ${callerCity.regionCode}` : callerCity.city;
  } catch (error) {
    log.warn({ userId, error: String(error) }, '📍 Could not read the saved city');
    return undefined;
  }
}

/** The place a "near me" search uses. See the module comment for the order. */
export async function resolveSearchLocation(
  requested: string | undefined,
  opts: unknown,
  ctx?: ToolContext
): Promise<string | undefined> {
  if (!placesLocationOn()) return resolveCallerLocation(requested, opts, ctx);
  if (!isUnspecifiedLocation(requested)) return requested?.trim();
  const userId = callerUserId(opts, ctx);
  const remembered = userId ? await savedCallerLocation(userId) : undefined;
  return remembered ?? callerLocation(opts, ctx);
}

/** Remember a city for the caller. Called only after they said yes. */
export async function saveCallerCity(
  userId: string,
  city: string,
  region?: string
): Promise<SaveCityResult> {
  const cityName = cityOnly(city);
  const regionCode = region === undefined ? undefined : cityOnly(region);
  if (!cityName || (region !== undefined && !regionCode)) return 'not-a-city';

  const result = await updateUserPreferences(userId, {
    callerCity: { city: cityName, regionCode, savedAt: new Date().toISOString() },
  });
  return result.success ? 'saved' : 'failed';
}

/** Forget the saved city. The phone's city, if it has one, is still used. */
export async function forgetCallerCity(userId: string): Promise<boolean> {
  const result = await updateUserPreferences(userId, { callerCity: undefined });
  return result.success;
}
