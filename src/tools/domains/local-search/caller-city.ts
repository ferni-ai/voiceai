/**
 * Where a "near me" search looks, when the caller hasn't named a place.
 *
 * Order, behind PLACES_LOCATION (off: resolveCallerLocation, unchanged):
 *   1. the place the model got from this call (the caller said it);
 *   2. the city the caller agreed to have remembered (saveCallerCity), read
 *      only while REQUIRE_FIX_MEMORY is on, the switch that makes the
 *      preferences store persist and account deletion erase it;
 *   3. the city their phone shows (userData.userLocation, from dispatch metadata).
 * Nothing known: undefined, and the tool asks where they are.
 *
 * City level only. Nothing here stores a postcode, GPS or coordinates. A name
 * with a digit or a character no place name uses is refused before any lookup.
 * Saving a city asks Google Places to confirm it, and keeps only the Places place
 * ID and the caller's own words. A street name is refused only when Places gives
 * it no locality, so that refusal depends on Places' answer. Google's name,
 * address and coordinates are never stored.
 *
 * @module tools/domains/local-search/caller-city
 */

import { flagOn } from '../../../config/env-flag.js';
import { isRequireFixMemoryEnabled } from '../../../config/require-fix-memory-flag.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { nonAccountPrefixOf } from '../../../utils/synthetic-user.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import {
  callerLocation,
  isUnspecifiedLocation,
  resolveCallerLocation,
} from '../../shared/caller-location.js';
import { getUserPreferences, updateUserPreferences } from '../information/preferences/storage.js';
import { findCityByName } from './places-locality.js';

const log = getLogger();

const MAX_CHARS = 40;
const MAX_WORDS = 4;
/** Letters and the punctuation place names use. No digits: those mean a street, a postcode or coordinates. */
const CITY_CHARS = /^[\p{L}\p{M} .'’-]+$/u;
/**
 * Ids that name no one: the fast-path shared ctx, the placeholder handler-setup
 * gives a call with no user, and the ids of unknown or on-behalf callers
 * (nonAccountPrefixOf in utils/synthetic-user.ts). Only a member's
 * own id is reused on a later call, so only that one can be remembered.
 */
const NO_CALLER_IDS = new Set(['shared', 'anonymous', 'default', 'unknown']);

/** `name` is what was saved, in the caller's own words ("Philly, PA"), so the caller can hear and correct it. */
export type SaveCityResult =
  | { status: 'saved'; name: string }
  | { status: 'not-a-city' }
  | { status: 'lookup-failed' }
  | { status: 'failed' };

export function placesLocationOn(env = process.env): boolean {
  return flagOn('PLACES_LOCATION', env);
}

/** PLACES_NEEDS_LOCATION: a business search with no known place asks instead of searching. */
export function placesNeedsLocationOn(env = process.env): boolean {
  return flagOn('PLACES_NEEDS_LOCATION', env);
}

/** Business searches that took the model's location as is ("nearby" or none): which calls search. */
const SEARCHES_WITHOUT_A_PLACE: Record<string, (args: { action?: string }) => boolean> = {
  findBusiness: () => true, // search, details, phone and call all run a Places text search
  restaurant: (args) => args.action === 'search',
};

/**
 * PLACES_NEEDS_LOCATION: a calendar-domain business search (SEARCHES_WITHOUT_A_PLACE)
 * resolves the place as the local-search tools do, and with none runs no search and
 * returns NEED_LOCATION_RESULT so Ferni asks. Any other tool, or the flag off: unchanged.
 */
export function askWhereFirst(def: ToolDefinition): ToolDefinition {
  const applies = SEARCHES_WITHOUT_A_PLACE[def.id];
  if (!applies) return def;
  return {
    ...def,
    create: (ctx: ToolContext) => {
      const tool = def.create(ctx) as {
        execute: (args: { action?: string; location?: string }, opts: unknown) => unknown;
      };
      const execute = tool.execute.bind(tool);
      tool.execute = async (args, opts) => {
        if (!placesNeedsLocationOn() || !applies(args)) return execute(args, opts);
        const location = await resolveSearchLocation(args.location, opts, ctx);
        if (!location) {
          log.info(
            { tool: def.id, action: args.action },
            '📍 No caller location: asking, not searching'
          );
          return NEED_LOCATION_RESULT;
        }
        return execute({ ...args, location }, opts);
      };
      return tool as Tool;
    },
  };
}

/**
 * What a business search returns when nobody knows where the caller is: no
 * search ran, so there is no place to name. Live (2026-10-21) a search for
 * "tacos" with no location came back with a shop somewhere, and Ferni
 * recommended it as "open right now".
 */
export const NEED_LOCATION_RESULT = JSON.stringify({
  status: 'need_location',
  instruction:
    "No search was run: I don't know where the caller is. Don't name or recommend any place. " +
    'Ask which city or neighborhood to look in, then search again with that location.',
});

/**
 * Remembering a city needs the caller's yes and a store that persists. Off
 * otherwise, and the remember and forget tools are not offered.
 */
export function callerCityMemoryOn(env = process.env): boolean {
  return placesLocationOn(env) && isRequireFixMemoryEnabled();
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
 * The caller on this call: only the call's own userData.userId. A fast-path
 * tool's ctx is shared, and handler-setup gives a call with no user the
 * placeholder 'anonymous'; neither names a caller, so neither is read or written.
 */
export function callerUserId(opts: unknown): string | undefined {
  const id = (opts as { ctx?: { userData?: { userId?: unknown } } } | undefined)?.ctx?.userData
    ?.userId;
  if (typeof id !== 'string') return undefined;
  const trimmed = id.trim();
  if (!trimmed || NO_CALLER_IDS.has(trimmed.toLowerCase())) return undefined;
  return nonAccountPrefixOf(trimmed) ? undefined : trimmed;
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
  const userId = callerUserId(opts);
  const remembered = userId && callerCityMemoryOn() ? await savedCallerLocation(userId) : undefined;
  return remembered ?? callerLocation(opts, ctx);
}

/**
 * Remember a city for the caller. Called only after they said yes. The name is
 * confirmed with Places, and what is stored is the place ID and the caller's own words.
 */
export async function saveCallerCity(
  userId: string,
  city: string,
  region?: string
): Promise<SaveCityResult> {
  const cityName = cityOnly(city);
  const regionName = region === undefined ? undefined : cityOnly(region);
  if (!cityName || (region !== undefined && !regionName)) return { status: 'not-a-city' };

  let match;
  try {
    match = await findCityByName(regionName ? `${cityName}, ${regionName}` : cityName);
  } catch (error) {
    log.warn({ userId, error: String(error) }, '📍 Could not check the city with Places');
    return { status: 'lookup-failed' };
  }
  if (!match) return { status: 'not-a-city' };

  // Stored: the Places place ID and the caller's own words. Not Google's name, address or coordinates.
  const previous = (await getUserPreferences(userId)).callerCity;
  const result = await updateUserPreferences(userId, {
    callerCity: {
      placeId: match.placeId,
      city: cityName,
      regionCode: regionName,
      savedAt: new Date().toISOString(),
    },
  });
  if (result.success) {
    return { status: 'saved', name: regionName ? `${cityName}, ${regionName}` : cityName };
  }
  // The preferences cache takes the new city before the Firestore write fails: put the old one back.
  await updateUserPreferences(userId, { callerCity: previous });
  return { status: 'failed' };
}

/** Forget the saved city. The phone's city, if it has one, is still used. */
export async function forgetCallerCity(userId: string): Promise<boolean> {
  const result = await updateUserPreferences(userId, { callerCity: undefined });
  if (!result.success) log.warn({ userId }, '📍 Could not clear the saved city');
  return result.success;
}
