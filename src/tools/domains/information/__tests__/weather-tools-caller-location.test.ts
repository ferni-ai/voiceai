/**
 * createWeatherTools() must answer for the CALLER's location when the model
 * omits one. It used to read a process-wide "current active session", but a
 * worker runs up to 3 calls in one process (livekit-connection.ts, #246): the
 * global held whichever call set it last, and any call ending wiped it for the
 * calls still connected. The location now arrives with the call itself, in the
 * session's userData (LiveKit passes RunContext as the tool's second argument).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    safeLog: () => logger,
  };
});
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Record which place each lookup geocoded; returning null ends the lookup before any network call.
const { geocoded } = vi.hoisted(() => ({ geocoded: [] as string[] }));
vi.mock('../utils/geocoding.js', () => ({
  geocodeLocation: vi.fn(async (location: string) => {
    geocoded.push(location);
    return null;
  }),
  geocodeWithGoogle: vi.fn(async () => null),
  formatLocationName: vi.fn(() => ''),
}));

import { createWeatherTools } from '../weather.js';
import { setSessionLocation } from '../location-preference.js';

type UserLocation = { city?: string; regionCode?: string; countryCode?: string };
type CallData = { userId?: string; userLocation?: UserLocation };
type Executable = {
  execute: (
    args: Record<string, unknown>,
    opts?: { ctx: { userData: CallData } }
  ) => Promise<string>;
};

/** What LiveKit passes as the tool's second argument for a call from this caller. */
const callFrom = (userData: CallData) => ({ ctx: { userData } });

function tools(): Record<'getWeather' | 'getWeatherForecast', Executable> {
  geocoded.length = 0;
  return createWeatherTools() as unknown as Record<'getWeather' | 'getWeatherForecast', Executable>;
}

describe("createWeatherTools resolves the calling session's location", () => {
  it('getWeather with no location looks up the caller city', async () => {
    const { getWeather } = tools();
    const reply = await getWeather.execute(
      {},
      callFrom({ userLocation: { city: 'Boise', regionCode: 'ID' } })
    );
    expect(reply).not.toMatch(/Which city/);
    expect(geocoded).toEqual(['Boise, ID']);
  });

  it('an explicit city wins over the caller city', async () => {
    const { getWeatherForecast } = tools();
    await getWeatherForecast.execute(
      { location: 'Denver', days: 1 },
      callFrom({ userLocation: { city: 'Boise' } })
    );
    expect(geocoded).toEqual(['Denver']);
  });

  it("never answers with another concurrent caller's city", async () => {
    const { getWeather, getWeatherForecast } = tools();
    // Three calls on one worker, interleaved: each must get its own city.
    await Promise.all([
      getWeather.execute(
        {},
        callFrom({ userId: 'a', userLocation: { city: 'Boise', regionCode: 'ID' } })
      ),
      getWeatherForecast.execute(
        { days: 1 },
        callFrom({ userId: 'b', userLocation: { city: 'Miami', regionCode: 'FL' } })
      ),
      getWeather.execute(
        { location: 'here' },
        callFrom({ userId: 'c', userLocation: { city: 'Tulsa' } })
      ),
    ]);
    expect([...geocoded].sort()).toEqual(['Boise, ID', 'Miami, FL', 'Tulsa']);

    // A caller with no detected location is asked, never handed someone else's city.
    geocoded.length = 0;
    const reply = await getWeather.execute({}, callFrom({ userId: 'd' }));
    expect(reply).toMatch(/Which city/);
    expect(geocoded).toEqual([]);
  });

  it("falls back to the caller's own saved preference, keyed by their userId", async () => {
    setSessionLocation('saved-user', 'Austin', 'TX');
    const { getWeather } = tools();
    await getWeather.execute({}, callFrom({ userId: 'saved-user' }));
    expect(geocoded).toEqual(['Austin, TX']);
  });
});
