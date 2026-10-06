/**
 * Weather tools must answer for the caller's location when the model calls
 * them without one. Fast-path tools are built once and shared, so their ctx
 * never carries userLocation; the caller's location arrives with the call, in
 * the session's userData (RunContext). Before this, "what's the weather
 * tomorrow?" got "I don't know your location" from a session that knew it
 * (local e2e, 2026-10-04).
 *
 * A worker runs several calls in one process, so the location must come from
 * the call itself, never from a process-wide "current session".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  getCurrentWeather: vi.fn(async (location: string) => `current weather for ${location}`),
  getWeatherForecast: vi.fn(async (location: string) => `forecast for ${location}`),
}));

import type { ToolContext } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';
import { clearCurrentActiveSession, setCurrentActiveSession } from '../location-preference.js';

type UserLocation = { city?: string; regionCode?: string; countryCode?: string };
type Executable = {
  execute: (
    args: Record<string, unknown>,
    opts?: { ctx: { userData: { userLocation?: UserLocation } } }
  ) => Promise<string>;
};

/** The shared fast-path context: no userLocation, like buildEssentialTools({ userId: 'shared' }). */
const sharedCtx = {
  userId: 'shared',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
} as unknown as ToolContext;

async function tool(id: string): Promise<Executable> {
  const def = (await getToolDefinitions()).find((d) => d.id === id);
  if (!def) throw new Error(`${id} not registered`);
  return def.create(sharedCtx) as unknown as Executable;
}

/** What LiveKit passes as the tool's second argument for a call from this caller. */
const callFrom = (userLocation?: UserLocation) => ({ ctx: { userData: { userLocation } } });

describe("weather tools use the calling session's location", () => {
  afterEach(() => clearCurrentActiveSession());

  it('getWeatherForecast with no location uses the caller city', async () => {
    const forecast = await tool('getWeatherForecast');
    const reply = await forecast.execute({ days: 1 }, callFrom({ city: 'St. George', regionCode: 'UT' }));
    expect(reply).toBe('forecast for St. George, UT');
  });

  it('getWeather with a placeholder location uses the caller city', async () => {
    const weather = await tool('getWeather');
    const reply = await weather.execute({ location: 'here' }, callFrom({ city: 'St. George' }));
    expect(reply).toBe('current weather for St. George');
  });

  it('an explicit city still wins over the caller city', async () => {
    const forecast = await tool('getWeatherForecast');
    const reply = await forecast.execute(
      { location: 'Denver', days: 1 },
      callFrom({ city: 'St. George', regionCode: 'UT' })
    );
    expect(reply).toBe('forecast for Denver');
  });

  it("never answers with another concurrent caller's city", async () => {
    // Another call on this worker started later and set the process-wide session.
    setCurrentActiveSession('other-caller', 'Miami, FL', 'other-session');
    const forecast = await tool('getWeatherForecast');
    expect(await forecast.execute({ days: 1 }, callFrom({ city: 'St. George', regionCode: 'UT' }))).toBe(
      'forecast for St. George, UT'
    );
    expect(await forecast.execute({ days: 1 }, callFrom(undefined))).toMatch(/Which city/);
  });

  it('asks for a city only when no location is known', async () => {
    const forecast = await tool('getWeatherForecast');
    expect(await forecast.execute({ days: 1 }, callFrom(undefined))).toMatch(/Which city/);
  });
});
