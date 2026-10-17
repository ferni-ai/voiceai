/**
 * "Can you check the weather?" with no place named must use where the caller
 * lives, and ask only when nothing is known.
 *
 * Prod 2026-10-17: the caller's city was known from the start of the call, yet
 * the persona asked "what city or zip code are we looking at?". Order now: the
 * home they saved, their profile location (set by GPS or by hand), this call's
 * IP city, any other profile location; ask only after that.
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
vi.mock('../weather.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../weather.js')>()),
  getCurrentWeather: vi.fn(async (location: string) => `weather for ${location}`),
  currentWeatherWithin: vi.fn(async (location: string) => ({
    text: `weather for ${location}`,
    timedOut: false,
  })),
  getWeatherForecast: vi.fn(async (location: string) => `forecast for ${location}`),
}));

import type { ToolContext } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';
import { clearPreferencesCache, saveLocation } from '../preferences/storage.js';

type Call = {
  ctx: {
    userData: {
      userId?: string;
      userLocation?: { city?: string; regionCode?: string };
      services?: {
        userProfile?: { location?: { city?: string; regionCode?: string; source?: string } };
      };
    };
  };
};
type Executable = { execute: (args: Record<string, unknown>, opts?: Call) => Promise<string> };

const sharedCtx = {
  userId: 'shared',
  agentId: 'peter-john',
  agentDisplayName: 'Peter',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
} as unknown as ToolContext;

async function getWeather(): Promise<Executable> {
  const def = (await getToolDefinitions()).find((d) => d.id === 'getWeather');
  if (!def) throw new Error('getWeather not registered');
  return def.create(sharedCtx) as unknown as Executable;
}

const USER = 'weather-test-user';
/** A call from USER whose IP places them in Riverton, WY. */
const call = (userData: Call['ctx']['userData'] = {}): Call => ({
  ctx: {
    userData: { userId: USER, userLocation: { city: 'Riverton', regionCode: 'WY' }, ...userData },
  },
});

describe('getWeather with no place named', () => {
  beforeEach(() => {
    clearPreferencesCache(USER);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the caller's saved home over this call's IP city", async () => {
    await saveLocation(USER, { name: 'Home', address: 'Springfield, IL' });
    expect(await (await getWeather()).execute({}, call())).toBe('weather for Springfield, IL');
  });

  it('uses a GPS or hand-set profile location when no home is saved', async () => {
    const reply = await (
      await getWeather()
    ).execute(
      {},
      call({
        services: {
          userProfile: { location: { city: 'Lakewood', regionCode: 'CO', source: 'browser-gps' } },
        },
      })
    );
    expect(reply).toBe('weather for Lakewood, CO');
  });

  it("uses this call's city when nothing is saved", async () => {
    expect(await (await getWeather()).execute({}, call())).toBe('weather for Riverton, WY');
  });

  it('asks for a city only when no location is known at all', async () => {
    const reply = await (await getWeather()).execute({}, { ctx: { userData: { userId: USER } } });
    expect(reply).toMatch(/Which city/);
  });

  it('a place the caller names still wins', async () => {
    await saveLocation(USER, { name: 'Home', address: 'Springfield, IL' });
    expect(await (await getWeather()).execute({ location: 'Denver' }, call())).toBe(
      'weather for Denver'
    );
  });

  it("WEATHER_SAVED_HOME=off goes back to this call's city", async () => {
    vi.stubEnv('WEATHER_SAVED_HOME', 'off');
    await saveLocation(USER, { name: 'Home', address: 'Springfield, IL' });
    expect(await (await getWeather()).execute({}, call())).toBe('weather for Riverton, WY');
  });
});
