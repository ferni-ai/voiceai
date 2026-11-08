/**
 * Which key each Maps caller sends, per env (#3139 verifier matrix, kept).
 *
 * Until GOOGLE_MAPS_SERVER_KEY is mounted, every caller must send exactly the
 * key it sent before the resolver existed. The expected table below was
 * recorded on main (3582191893) with the same harness, so a caller whose chain
 * widens (geocoding onto GOOGLE_MAPS_API_KEY, the REQUEST_DENIED key in prod)
 * or that starts calling where it made no call before (travel time on
 * GOOGLE_API_KEY) fails here. With the server key set, it wins everywhere.
 *
 * Rideshare is not covered: it still reads GOOGLE_API_KEY itself, and #3103
 * deletes the file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/safe-logger.js', () => {
  const noop = () => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop, trace: noop, fatal: noop };
  const withChild = { ...logger, child: () => withChild };
  return { getLogger: () => withChild, createLogger: () => withChild, safeLog: () => withChild };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: unknown) => config },
  log: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}));
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

/** Each dummy value names the env var it came from, so the sent key reads back as a name. */
const DUMMY: Record<string, string> = {
  GOOGLE_MAPS_SERVER_KEY: 'srv-dummy',
  GOOGLE_MAPS_API_KEY: 'maps-dummy',
  GOOGLE_PLACES_API_KEY: 'places-dummy',
  GOOGLE_API_KEY: 'api-dummy',
};
const NAME_OF = Object.fromEntries(Object.entries(DUMMY).map(([name, value]) => [value, name]));
const NAMES = [...Object.keys(DUMMY), 'HERE_API_KEY'];

const SCENARIOS = {
  allLegacyDistinct: ['GOOGLE_MAPS_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_API_KEY'],
  prodLikeMapsUnset: ['GOOGLE_PLACES_API_KEY', 'GOOGLE_API_KEY'],
  onlyGeneral: ['GOOGLE_API_KEY'],
  onlyMaps: ['GOOGLE_MAPS_API_KEY'],
  serverPlusAll: Object.keys(DUMMY),
} as const;
type Scenario = keyof typeof SCENARIOS;

const MAPS = 'GOOGLE_MAPS_API_KEY';
const PLACES = 'GOOGLE_PLACES_API_KEY';
const API = 'GOOGLE_API_KEY';
const SERVER = 'GOOGLE_MAPS_SERVER_KEY';
const NONE = 'NO_GOOGLE_FETCH';

/** [allLegacyDistinct, prodLikeMapsUnset, onlyGeneral, onlyMaps, serverPlusAll]. Rows 0-3 are main's. */
const EXPECTED: Record<string, [string, string, string, string, string]> = {
  'traffic.getTrafficTime': [MAPS, API, API, MAPS, SERVER],
  'traffic.getDirections': [MAPS, API, API, MAPS, SERVER],
  'geocoding.geocodeWithGoogle': [API, API, API, NONE, SERVER],
  'weather.getCurrentWeather': [API, API, API, NONE, SERVER],
  'places-locality.findCityByName': [PLACES, PLACES, API, NONE, SERVER],
  'ext-places.searchRestaurants': [PLACES, PLACES, API, NONE, SERVER],
  'ext-places.getPlaceDetails': [PLACES, PLACES, API, NONE, SERVER],
  'ext-places.findNearbyRestaurants': [PLACES, PLACES, API, NONE, SERVER],
  'concierge.discoverBusinesses': [PLACES, PLACES, API, NONE, SERVER],
  'location-calendar.getTravelTime': [MAPS, NONE, NONE, MAPS, SERVER],
  'integration-hub.request(google_maps)': [MAPS, NONE, NONE, MAPS, SERVER],
  'ext-places.isGooglePlacesConfigured': ['true', 'true', 'true', 'false', 'true'],
  'capability-checker.maps': ['true', 'true', 'true', 'true', 'true'],
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function googleUp(url: string): Response {
  if (url.includes('/geocode/json')) {
    return json({
      status: 'OK',
      results: [
        {
          geometry: { location: { lat: 40, lng: -100 } },
          formatted_address: 'X',
          address_components: [{ long_name: 'T', types: ['locality'] }],
        },
      ],
    });
  }
  if (url.includes('weather.googleapis.com')) {
    return json({
      temperature: { degrees: 71, unit: 'FAHRENHEIT' },
      weatherCondition: { description: { text: 'Sunny' } },
    });
  }
  if (url.includes('/distancematrix/json')) {
    return json({
      status: 'OK',
      rows: [
        {
          elements: [
            {
              status: 'OK',
              distance: { text: '1 mi' },
              duration: { value: 60 },
              duration_in_traffic: { value: 60 },
            },
          ],
        },
      ],
    });
  }
  if (url.includes('/directions/json')) {
    return json({
      status: 'OK',
      routes: [
        {
          legs: [
            {
              distance: { text: '1 mi' },
              duration: { text: '1 min', value: 60 },
              duration_in_traffic: { value: 60 },
              steps: [],
            },
          ],
        },
      ],
    });
  }
  return json({ places: [] });
}

/** The env names of every key sent to a googleapis.com host, or NONE. */
function keysSent(fetchMock: ReturnType<typeof vi.fn>): string {
  const seen = new Set<string>();
  for (const [u, init] of fetchMock.mock.calls as Array<[string, RequestInit | undefined]>) {
    if (!/googleapis\.com/.test(u)) continue;
    const queryKey = new URL(u).searchParams.get('key');
    if (queryKey) seen.add(NAME_OF[queryKey] ?? 'OTHER');
    const headerKey = (init?.headers as Record<string, string> | undefined)?.['X-Goog-Api-Key'];
    if (headerKey) seen.add(NAME_OF[headerKey] ?? 'OTHER');
  }
  return seen.size ? [...seen].sort().join('+') : NONE;
}

const CALLERS: Record<string, () => Promise<unknown>> = {
  'traffic.getTrafficTime': async () =>
    (await import('../../tools/domains/information/traffic.js')).getTrafficTime('A st', 'B st'),
  'traffic.getDirections': async () =>
    (await import('../../tools/domains/information/traffic.js')).getDirections('A st', 'B st'),
  'geocoding.geocodeWithGoogle': async () =>
    (await import('../../tools/domains/information/utils/geocoding.js')).geocodeWithGoogle('Tampa'),
  'weather.getCurrentWeather': async () =>
    (await import('../../tools/domains/information/weather.js')).getCurrentWeather('Tampa'),
  'places-locality.findCityByName': async () =>
    (await import('../../tools/domains/local-search/places-locality.js')).findCityByName('Tampa'),
  'ext-places.searchRestaurants': async () =>
    (await import('../../services/external-apis/google-places.js')).searchRestaurants({
      location: 'Tampa',
    } as never),
  'ext-places.getPlaceDetails': async () =>
    (await import('../../services/external-apis/google-places.js')).getPlaceDetails('pid'),
  'ext-places.findNearbyRestaurants': async () =>
    (await import('../../services/external-apis/google-places.js')).findNearbyRestaurants(
      27.7,
      -82.6 as never
    ),
  'concierge.discoverBusinesses': async () =>
    (await import('../../services/concierge/discovery/google-places.js')).discoverBusinesses({
      domain: 'restaurant',
      location: 'Tampa',
    } as never),
  'location-calendar.getTravelTime': async () => {
    const m = await import('../../services/context-awareness/location-calendar.js');
    m.updateLocation('u1', 27.7, -82.6, 5);
    return m.getTravelTime('u1', 'B st');
  },
  'integration-hub.request(google_maps)': async () => {
    const m = await import('../../services/integrations/integration-hub.js');
    m.resetIntegrationHub();
    return m.getIntegrationHub().request('u1', 'google_maps', {
      method: 'GET',
      path: 'geocode/json',
      params: { address: 'x' },
    } as never);
  },
};

const CONFIG_CHECKS: Record<string, () => Promise<unknown>> = {
  'ext-places.isGooglePlacesConfigured': async () =>
    (await import('../../services/external-apis/google-places.js')).isGooglePlacesConfigured(),
  'capability-checker.maps': async () =>
    (await import('../../tools/semantic-router/capability-checker.js')).isCapabilityConfigured(
      'maps' as never
    ),
};

function setEnv(scenario: Scenario): void {
  const set = new Set<string>(SCENARIOS[scenario]);
  for (const name of NAMES) {
    vi.stubEnv(name, set.has(name) ? DUMMY[name] : '');
    if (!set.has(name)) delete process.env[name];
  }
}

async function observe(caller: string, scenario: Scenario): Promise<string> {
  vi.resetModules();
  setEnv(scenario);
  const fetchMock = vi.fn(async (u: string | URL) => googleUp(String(u)));
  vi.stubGlobal('fetch', fetchMock);
  const check = CONFIG_CHECKS[caller];
  if (check) return String(await check());
  try {
    await CALLERS[caller]();
  } catch {
    // findCityByName throws when unconfigured; only the keys sent matter here
  }
  return keysSent(fetchMock);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ORDER = Object.keys(SCENARIOS) as Scenario[];

describe('each Maps caller sends the key it sent on main until the server key is set', () => {
  for (const [caller, expected] of Object.entries(EXPECTED)) {
    it(
      caller,
      async () => {
        const seen: Record<string, string> = {};
        for (const scenario of ORDER) seen[scenario] = await observe(caller, scenario);
        expect(seen).toEqual(Object.fromEntries(ORDER.map((s, i) => [s, expected[i]])));
      },
      30_000
    );
  }
});
