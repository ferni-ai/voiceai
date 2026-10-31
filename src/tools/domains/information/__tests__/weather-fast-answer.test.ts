/**
 * The weather answers within WEATHER_ANSWER_TIMEOUT_MS, and a city fetched in
 * the last ten minutes is answered from memory.
 *
 * Prod 2026-10-17: world awareness fetched the caller's city's weather at call
 * start (542 ms), and nothing in the call reused it. A slow provider (Google
 * Weather 5 s timeout, then Open-Meteo 8 s) could hold a turn far past any
 * friend's pause; now the caller hears a fallback after 3 s and the lookup
 * fills the cache for a retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    safeLog: () => logger,
  };
});

const { geocodeDelayMs } = vi.hoisted(() => ({ geocodeDelayMs: { value: 0 } }));
vi.mock('../utils/geocoding.js', () => ({
  geocodeWithGoogle: vi.fn(async () => null),
  geocodeLocation: vi.fn(async (location: string) => {
    await new Promise((resolve) => {
      setTimeout(resolve, geocodeDelayMs.value);
    });
    return { name: location.split(',')[0], latitude: 40, longitude: -100 };
  }),
  formatLocationName: vi.fn((geo: { name: string }) => geo.name),
}));

const openMeteo = () =>
  new Response(
    JSON.stringify({
      current: {
        temperature_2m: 64,
        relative_humidity_2m: 40,
        weather_code: 0,
        wind_speed_10m: 5,
      },
    })
  );

describe('current weather', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetModules(); // an empty cache per test
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', '');
    geocodeDelayMs.value = 0;
    fetchMock = vi.fn(async () => openMeteo());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is answered from memory for a city fetched in the last ten minutes', async () => {
    const { getCurrentWeather } = await import('../weather.js');
    const warmed = await getCurrentWeather('Riverton, WY'); // call start (world awareness)
    const asked = await getCurrentWeather('riverton, wy '); // the caller asks, mid-call
    expect(asked).toBe(warmed);
    expect(asked).toMatch(/^Right now in Riverton: 64°F with clear skies/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives a fallback line when the lookup is slow, and the retry is instant', async () => {
    const { currentWeatherWithin } = await import('../weather.js');
    geocodeDelayMs.value = 300;
    const started = Date.now();
    const first = await currentWeatherWithin('Riverton, WY', 50);
    expect(Date.now() - started).toBeLessThan(250);
    expect(first.timedOut).toBe(true);
    expect(first.text).toBe(
      "I couldn't get the weather for Riverton, WY quickly just now. Want me to try again in a moment?"
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await new Promise((resolve) => {
      setTimeout(resolve, 20); // the lookup stores its answer
    });
    const retry = await currentWeatherWithin('Riverton, WY', 50);
    expect(retry.timedOut).toBe(false);
    expect(retry.text).toMatch(/^Right now in Riverton: 64°F/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WEATHER_FAST_ANSWER=off waits for the lookup and fetches every time', async () => {
    vi.stubEnv('WEATHER_FAST_ANSWER', 'off');
    const { currentWeatherWithin, getCurrentWeather } = await import('../weather.js');
    geocodeDelayMs.value = 100;
    const slow = await currentWeatherWithin('Riverton, WY', 20);
    expect(slow.timedOut).toBe(false);
    await getCurrentWeather('Riverton, WY');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
