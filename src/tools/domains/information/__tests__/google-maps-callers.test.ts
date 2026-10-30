/**
 * Every Maps-family caller takes its key from googleMapsKey() (lane GM-A), and
 * a missing or rejected key reads to the caller as an honest "I can't look up
 * directions right now", never as "check both addresses".
 *
 * Each test sets all four key names to different values, so a caller still
 * reading its own env name sends the wrong key and fails here.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../../utils/safe-logger.js', () => {
  const record =
    () =>
    (...args: unknown[]) => {
      logged.calls.push(args);
    };
  const logger = { debug: record(), info: record(), warn: record(), error: record() };
  return {
    getLogger: () => ({ ...logger, child: () => logger }),
    createLogger: () => ({ ...logger, child: () => logger }),
    safeLog: () => logger,
  };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: unknown) => config },
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
// traffic.ts reads HERE_API_KEY at import; with no Google answer it must not fall through to HERE.
vi.hoisted(() => {
  delete process.env.HERE_API_KEY;
});

import { getDirections, getTrafficTime } from '../traffic.js';
import { geocodeWithGoogle } from '../utils/geocoding.js';
import { getCurrentWeather } from '../weather.js';
import { findCityByName } from '../../local-search/places-locality.js';
import { searchRestaurants } from '../../../../services/external-apis/google-places.js';
import { discoverBusinesses } from '../../../../services/concierge/discovery/google-places.js';

const KEYS = {
  GOOGLE_MAPS_SERVER_KEY: 'server-k',
  GOOGLE_MAPS_API_KEY: 'old-maps-k',
  GOOGLE_PLACES_API_KEY: 'old-places-k',
  GOOGLE_API_KEY: 'old-gemini-k',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Answers each Maps endpoint the way Google does when the key is good. */
function googleUp(url: string): Response {
  if (url.includes('/geocode/json')) {
    return json({
      status: 'OK',
      results: [
        {
          geometry: { location: { lat: 40, lng: -100 } },
          address_components: [{ long_name: 'Testville', types: ['locality'] }],
        },
      ],
    });
  }
  if (url.includes('weather.googleapis.com')) {
    return json({
      temperature: { degrees: 71, unit: 'FAHRENHEIT' },
      relativeHumidity: 30,
      wind: { speed: { value: 4, unit: 'MPH' } },
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
              distance: { text: '10 mi' },
              duration: { value: 1200 },
              duration_in_traffic: { value: 1500 },
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
        { legs: [{ distance: { text: '10 mi' }, duration: { text: '20 mins' }, steps: [] }] },
      ],
    });
  }
  return json({ places: [] }); // places:searchText
}

let fetchMock: ReturnType<typeof vi.fn>;
const urls = () => fetchMock.mock.calls.map(([u]) => String(u));
const placesKeys = () =>
  fetchMock.mock.calls.map(
    ([, init]) =>
      ((init as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.[
        'X-Goog-Api-Key'
      ]
  );

beforeEach(() => {
  for (const [name, value] of Object.entries(KEYS)) vi.stubEnv(name, value);
  fetchMock = vi.fn(async (url: string | URL) => googleUp(String(url)));
  vi.stubGlobal('fetch', fetchMock);
  logged.calls = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function unsetAllKeys(): void {
  for (const name of Object.keys(KEYS)) vi.stubEnv(name, '');
}

describe('every Maps caller sends the resolved key', () => {
  it('traffic (Distance Matrix)', async () => {
    expect(await getTrafficTime('A Street', 'B Street')).toMatch(/25 minutes/);
    expect(urls()).toEqual([expect.stringContaining('key=server-k')]);
  });

  it('directions', async () => {
    expect(await getDirections('A Street', 'B Street')).toMatch(/20 mins/);
    expect(urls()).toEqual([expect.stringContaining('key=server-k')]);
  });

  it('geocoding', async () => {
    expect(await geocodeWithGoogle('Testville')).toMatchObject({ name: 'Testville' });
    expect(urls()).toEqual([expect.stringContaining('key=server-k')]);
  });

  it('weather (geocode, then Google Weather)', async () => {
    expect(await getCurrentWeather('Testville, KS')).toMatch(/^Right now in Testville: 71°F/);
    expect(urls()).toHaveLength(2);
    for (const url of urls()) expect(url).toContain('key=server-k');
  });

  it('places-locality, restaurant search and concierge discovery', async () => {
    await findCityByName('Testville');
    await searchRestaurants({ location: 'Testville' });
    await discoverBusinesses({ domain: 'restaurant', location: 'Testville' });
    expect(placesKeys()).toEqual(['server-k', 'server-k', 'server-k']);
  });

  it('Places callers keep their Places-only fallback until the server key is mounted', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', '');
    await findCityByName('Testville');
    await getDirections('A Street', 'B Street');
    expect(placesKeys()[0]).toBe('old-places-k');
    expect(urls()[1]).toContain('key=old-maps-k');
  });

  it('never logs the key', async () => {
    fetchMock.mockImplementation(async () => json({ error: { code: 403 } }, 403));
    await getTrafficTime('A Street', 'B Street');
    await getDirections('A Street', 'B Street');
    await geocodeWithGoogle('Testville');
    await getCurrentWeather('Keyless, KS');
    expect(logged.calls.length).toBeGreaterThan(0);
    const text = JSON.stringify(logged.calls);
    for (const value of Object.values(KEYS)) expect(text).not.toContain(value);
    expect(text).toContain('GOOGLE_MAPS_SERVER_KEY'); // the source name is what gets logged
  });
});

describe('a missing key is an honest typed failure, with no fetch', () => {
  beforeEach(unsetAllKeys);

  it('traffic and directions say they cannot look it up, never blame the addresses', async () => {
    const traffic = await getTrafficTime('A Street', 'B Street');
    const directions = await getDirections('A Street', 'B Street');
    expect(traffic).toMatch(/^I can't look up traffic right now/);
    expect(directions).toMatch(/^I can't look up directions right now/);
    for (const reply of [traffic, directions]) {
      expect(reply).not.toMatch(/address|GOOGLE_|API key|console/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(logged.calls)).toContain('unconfigured');
  });

  it('geocoding, places-locality and restaurant search make no Google call', async () => {
    expect(await geocodeWithGoogle('Testville')).toBeNull();
    await expect(findCityByName('Testville')).rejects.toThrow(/unconfigured/);
    expect(await searchRestaurants({ location: 'Testville' })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a rejected key reads as unauthorized', () => {
  it('HTTP 403 gives the honest line and logs unauthorized', async () => {
    fetchMock.mockImplementation(async () => json({ error: { code: 403 } }, 403));
    expect(await getDirections('A Street', 'B Street')).toMatch(
      /^I can't look up directions right now/
    );
    expect(await getTrafficTime('A Street', 'B Street')).toMatch(
      /^I can't look up traffic right now/
    );
    const warned = logged.calls.filter(([, msg]) => msg === 'Google Maps lookup failed');
    expect(warned).toHaveLength(2);
    for (const [fields] of warned)
      expect(fields).toMatchObject({ outcome: 'unauthorized', detail: 403 });
  });

  it('a legacy REQUEST_DENIED (HTTP 200) is unauthorized, not a bad address', async () => {
    fetchMock.mockImplementation(async () =>
      json({ status: 'REQUEST_DENIED', error_message: 'The provided API key is invalid.' })
    );
    const reply = await getTrafficTime('A Street', 'B Street');
    expect(reply).toMatch(/^I can't look up traffic right now/);
    expect(reply).not.toMatch(/address/i);
    expect(logged.calls).toContainEqual([
      expect.objectContaining({ outcome: 'unauthorized', keySource: 'GOOGLE_MAPS_SERVER_KEY' }),
      'Google Maps lookup failed',
    ]);
  });

  it('places-locality throws a typed unauthorized error on 403', async () => {
    fetchMock.mockImplementation(async () => json({}, 403));
    await expect(findCityByName('Testville')).rejects.toThrow(/unauthorized \(403\)/);
  });

  it('a refused key never says "both addresses", and the failure is logged, not silent', async () => {
    for (const refusal of [
      async () => json({ error: { code: 403 } }, 403),
      async () => json({ status: 'REQUEST_DENIED' }),
    ]) {
      fetchMock.mockImplementation(refusal);
      logged.calls = [];
      const replies = [
        await getTrafficTime('A Street', 'B Street'),
        await getDirections('A Street', 'B Street'),
      ];
      for (const reply of replies) expect(reply).not.toMatch(/both addresses|valid/i);
      expect(replies[1]).toBe(
        "I can't look up directions right now. Google Maps or Apple Maps will have them."
      );
      expect(logged.calls.filter(([, msg]) => msg === 'Google Maps lookup failed')).toHaveLength(2);
    }
  });

  it('traffic with no route is its own honest line, and logged as no_data', async () => {
    fetchMock.mockImplementation(async () =>
      json({ status: 'OK', rows: [{ elements: [{ status: 'NOT_FOUND' }] }] })
    );
    expect(await getTrafficTime('A Street', 'B Street')).toBe(
      "I couldn't find a route between those two places."
    );
    expect(logged.calls).toContainEqual([{ outcome: 'no_data' }, '🚗 No traffic info']);
  });

  it('a route Google cannot find is no_data, said as such', async () => {
    fetchMock.mockImplementation(async () => json({ status: 'ZERO_RESULTS', routes: [] }));
    expect(await getDirections('A Street', 'B Street')).toBe(
      "I couldn't find a route between those two places."
    );
  });
});

describe('no Maps caller reads a key env name directly', () => {
  const MAPS_HOSTS = /(maps|weather|places|routes)\.googleapis\.com/;
  const DIRECT_READ =
    /process\.env(\.|\[')(GOOGLE_API_KEY|GOOGLE_MAPS_API_KEY|GOOGLE_PLACES_API_KEY|GOOGLE_MAPS_SERVER_KEY)/;
  // Unused, and removed by held PR #3108.
  const PENDING_REMOVAL = new Set(['src/services/integrations/google-maps/maps-client.ts']);

  it('every src file that calls a Maps host imports googleMapsKey', () => {
    const root = join(__dirname, '../../../../..');
    const files = execFileSync('git', ['ls-files', '--', 'src/*.ts'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => f && !f.includes('__tests__') && !f.endsWith('.test.ts'));
    const callers = files.filter((f) => MAPS_HOSTS.test(readFileSync(join(root, f), 'utf8')));
    expect(callers.length).toBeGreaterThan(5);
    const offenders = callers
      .filter((f) => !PENDING_REMOVAL.has(f))
      .filter((f) => {
        const src = readFileSync(join(root, f), 'utf8');
        return !src.includes('google-maps-key.js') || DIRECT_READ.test(src);
      });
    expect(offenders).toEqual([]);
  });
});
