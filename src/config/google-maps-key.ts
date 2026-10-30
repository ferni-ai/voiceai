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
 * 2. then the names each caller read before, so nothing changes until it is
 *    mounted: `GOOGLE_MAPS_API_KEY` then `GOOGLE_API_KEY` for Maps calls,
 *    `GOOGLE_PLACES_API_KEY` then `GOOGLE_API_KEY` for Places calls.
 *
 * The value is never logged; log `googleMapsKeySource()` (the env name) instead.
 *
 * @module config/google-maps-key
 */

/** `places` callers keep their Places-only fallback key; every other Maps call is `maps`. */
export type MapsKeyFamily = 'maps' | 'places';

type Env = Record<string, string | undefined>;

/** What a Maps lookup came to, in the house tool-outcome words. */
export type MapsOutcome =
  'ok' | 'unconfigured' | 'unauthorized' | 'rate_limited' | 'unreachable' | 'no_data';

export type MapsFailure = Exclude<MapsOutcome, 'ok'>;

function candidates(family: MapsKeyFamily, env: Env): Array<[string, string | undefined]> {
  const server: [string, string | undefined] = [
    'GOOGLE_MAPS_SERVER_KEY',
    env.GOOGLE_MAPS_SERVER_KEY,
  ];
  return family === 'places'
    ? [
        server,
        ['GOOGLE_PLACES_API_KEY', env.GOOGLE_PLACES_API_KEY],
        ['GOOGLE_API_KEY', env.GOOGLE_API_KEY],
      ]
    : [
        server,
        ['GOOGLE_MAPS_API_KEY', env.GOOGLE_MAPS_API_KEY],
        ['GOOGLE_API_KEY', env.GOOGLE_API_KEY],
      ];
}

/** The env name the key comes from, or undefined when none is set. Safe to log. */
export function googleMapsKeySource(
  family: MapsKeyFamily = 'maps',
  env: Env = process.env
): string | undefined {
  return candidates(family, env).find(([, value]) => value?.trim())?.[0];
}

/** The key for a Maps Platform call, or '' when none is set. Never log it. */
export function googleMapsKey(family: MapsKeyFamily = 'maps', env: Env = process.env): string {
  return (
    candidates(family, env)
      .find(([, value]) => value?.trim())?.[1]
      ?.trim() ?? ''
  );
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
