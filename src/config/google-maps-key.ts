/**
 * The one Google Maps Platform key, and what a Maps call came to.
 *
 * Geocoding, traffic, directions, weather and Places each read their own env
 * name, so one bad key broke some lookups and not others, and a rejected key
 * read to the caller as "check both addresses". Every Maps-family caller now
 * resolves its key here, per call:
 *
 * 1. `GOOGLE_MAPS_SERVER_KEY` (secret `google-maps-server-key`, API-restricted
 *    to Weather, Routes, Geocoding and Places);
 * 2. then that caller's own legacy names, in the order it read them before
 *    (`MAPS_KEY_LEGACY`), so nothing changes until the server key is mounted.
 *    Each caller keeps its own chain: geocoding never moves onto
 *    `GOOGLE_MAPS_API_KEY`, and a Maps-only caller never starts calling on
 *    `GOOGLE_API_KEY`.
 *
 * The value is never logged; log `googleMapsKeySource()` (the env name) instead.
 *
 * @module config/google-maps-key
 */

type Env = Record<string, string | undefined>;

/** A key name some Maps caller read before `GOOGLE_MAPS_SERVER_KEY` existed. */
type LegacyMapsKeyName = 'GOOGLE_MAPS_API_KEY' | 'GOOGLE_PLACES_API_KEY' | 'GOOGLE_API_KEY';

/**
 * Each caller's pre-server-key chain, exactly as it read it before. Pick the
 * one the caller used; never widen a chain, or a call starts on a key it never
 * used (`GOOGLE_MAPS_API_KEY` is REQUEST_DENIED in prod; `GOOGLE_API_KEY` is
 * the Gemini key).
 */
export const MAPS_KEY_LEGACY = {
  /** Traffic, directions, the capability checker. */
  mapsThenGeneral: ['GOOGLE_MAPS_API_KEY', 'GOOGLE_API_KEY'],
  /** Places lookups. */
  placesThenGeneral: ['GOOGLE_PLACES_API_KEY', 'GOOGLE_API_KEY'],
  /** Geocoding and weather. */
  generalOnly: ['GOOGLE_API_KEY'],
  /** The anticipation travel-time lookup and the integration hub. */
  mapsOnly: ['GOOGLE_MAPS_API_KEY'],
} as const satisfies Record<string, readonly LegacyMapsKeyName[]>;

export interface MapsKeyOptions {
  /** The names this caller read before, in order (one of `MAPS_KEY_LEGACY`). */
  legacy: readonly LegacyMapsKeyName[];
  env?: Env;
}

/** What a Maps lookup came to, in the house tool-outcome words. */
export type MapsOutcome =
  'ok' | 'unconfigured' | 'unauthorized' | 'rate_limited' | 'unreachable' | 'no_data';

export type MapsFailure = Exclude<MapsOutcome, 'ok'>;

function resolve({ legacy, env = process.env }: MapsKeyOptions): [string, string] | undefined {
  for (const name of ['GOOGLE_MAPS_SERVER_KEY', ...legacy]) {
    const value = env[name]?.trim();
    if (value) return [name, value];
  }
  return undefined;
}

/** The env name the key comes from, or undefined when none is set. Safe to log. */
export function googleMapsKeySource(options: MapsKeyOptions): string | undefined {
  return resolve(options)?.[0];
}

/** The key for a Maps Platform call, or '' when none is set. Never log it. */
export function googleMapsKey(options: MapsKeyOptions): string {
  return resolve(options)?.[1] ?? '';
}

/** A non-2xx HTTP status from a Maps API (Weather, Places, or a legacy web service). */
export function mapsHttpOutcome(status: number): MapsFailure {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unreachable';
  return 'no_data';
}

/**
 * The `status` field of a legacy web service reply (Geocoding, Directions,
 * Distance Matrix), which answers HTTP 200 even when it rejects the key.
 */
export function mapsStatusOutcome(status: string | undefined): MapsOutcome {
  switch (status) {
    case 'OK':
      return 'ok';
    case 'REQUEST_DENIED':
      return 'unauthorized';
    case 'OVER_QUERY_LIMIT':
    case 'OVER_DAILY_LIMIT':
      return 'rate_limited';
    case 'UNKNOWN_ERROR':
      return 'unreachable';
    default:
      return 'no_data'; // ZERO_RESULTS, NOT_FOUND, INVALID_REQUEST, MAX_*
  }
}
