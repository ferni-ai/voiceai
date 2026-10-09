/**
 * Local lookups must default to the caller's location when the model gives
 * none. On 2026-10-08 a caller in St. George, UT asked "find me a good taco
 * place nearby" and "how long would it take me to drive to Zion from here";
 * weather answered for St. George but these got "I need to know what city
 * you're in first".
 *
 * Fast-path tools are built once with a shared ctx (no userLocation); the
 * caller's location arrives per call in RunContext.userData, LiveKit's second
 * execute argument. These tests pass it only there.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// traffic.ts reads its API key when the module loads, before any test body runs.
vi.hoisted(() => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
});

vi.mock('../../../utils/safe-logger.js', () => {
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

const places = vi.hoisted(() => ({
  searchRestaurants: vi.fn(async (_opts: { query: string; location: string }) => []),
}));
vi.mock('../../../services/google-places.js', () => ({
  searchRestaurants: places.searchRestaurants,
  getPlaceDetails: vi.fn(),
  findNearbyRestaurants: vi.fn(),
  formatRestaurantListForSpeech: vi.fn(),
  isGooglePlacesConfigured: () => true,
}));
vi.mock('../../../services/yelp.js', () => ({
  searchBusinesses: vi.fn(async () => []),
  searchRestaurants: vi.fn(async () => []),
  getBusinessDetails: vi.fn(),
  getBusinessReviews: vi.fn(),
  getBusinessByPhone: vi.fn(),
  formatBusinessForSpeech: vi.fn(),
  formatReviewForSpeech: vi.fn(),
  isYelpConfigured: () => false,
}));

const traffic = vi.hoisted(() => ({
  getTrafficTime: vi.fn(
    async (origin: string, destination: string) => `drive ${origin} -> ${destination}`
  ),
  getDirections: vi.fn(
    async (origin: string, destination: string) => `route ${origin} -> ${destination}`
  ),
}));
vi.mock('../../domains/information/traffic.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domains/information/traffic.js')>();
  return {
    ...actual,
    getTrafficTime: traffic.getTrafficTime,
    getDirections: traffic.getDirections,
  };
});

import type { ToolContext } from '../../registry/types.js';
import { callerLocation, resolveCallerLocation } from '../caller-location.js';

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

/** What LiveKit passes as the tool's second argument for a call from this caller. */
const callFrom = (userLocation?: UserLocation) => ({ ctx: { userData: { userLocation } } });
const stGeorge = callFrom({ city: 'St. George', regionCode: 'UT' });

async function domainTool(
  load: () => Promise<{
    getToolDefinitions: () => Promise<Array<{ id: string; create: (c: ToolContext) => unknown }>>;
  }>,
  id: string
): Promise<Executable> {
  const def = (await (await load()).getToolDefinitions()).find((d) => d.id === id);
  if (!def) throw new Error(`${id} not registered`);
  return def.create(sharedCtx) as Executable;
}

const localSearch = () => import('../../domains/local-search/index.js');
const transportation = () => import('../../domains/transportation/index.js');

async function legacyTrafficTool(name: 'getCommuteTime' | 'getDirections'): Promise<Executable> {
  // traffic.js's own tools call its module-internal functions, so spy on fetch
  // instead: the origin shows up in the Google Distance Matrix / Directions URL.
  const { createTrafficTools } = await vi.importActual<
    typeof import('../../domains/information/traffic.js')
  >('../../domains/information/traffic.js');
  return createTrafficTools()[name] as unknown as Executable;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveCallerLocation', () => {
  it('uses the caller location when none is given or a placeholder is sent', () => {
    expect(resolveCallerLocation(undefined, stGeorge)).toBe('St. George, UT');
    expect(resolveCallerLocation('  ', stGeorge)).toBe('St. George, UT');
    expect(resolveCallerLocation('Current Location', stGeorge)).toBe('St. George, UT');
    expect(resolveCallerLocation('near me', stGeorge)).toBe('St. George, UT');
  });

  it('keeps an explicit place, even one containing a placeholder word', () => {
    expect(resolveCallerLocation('Denver', stGeorge)).toBe('Denver');
    expect(resolveCallerLocation('Here Street, Provo', stGeorge)).toBe('Here Street, Provo');
  });

  it('falls back to ctx.userLocation, and is undefined when nothing is known', () => {
    const ctx: ToolContext = { ...sharedCtx, userLocation: { city: 'Moab' } };
    expect(callerLocation(callFrom(undefined), ctx)).toBe('Moab');
    expect(resolveCallerLocation(undefined, callFrom(undefined))).toBeUndefined();
  });
});

describe('findRestaurants', () => {
  it('searches near the caller when the model gives no location', async () => {
    const tool = await domainTool(localSearch, 'findRestaurants');
    await tool.execute({ cuisine: 'tacos' }, stGeorge);
    expect(places.searchRestaurants).toHaveBeenCalledTimes(1);
    expect(places.searchRestaurants.mock.calls[0][0].location).toContain('St. George');
  });

  it('an explicit location still wins', async () => {
    const tool = await domainTool(localSearch, 'findRestaurants');
    await tool.execute({ cuisine: 'tacos', location: 'Las Vegas' }, stGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('Las Vegas');
  });

  it('asks where only when no location is known', async () => {
    const tool = await domainTool(localSearch, 'findRestaurants');
    expect(await tool.execute({ cuisine: 'tacos' }, callFrom(undefined))).toMatch(
      /Where should I look/
    );
    expect(places.searchRestaurants).not.toHaveBeenCalled();
  });
});

describe('searchLocalBusinesses', () => {
  it('searches near the caller when the model gives no location', async () => {
    const tool = await domainTool(localSearch, 'searchLocalBusinesses');
    await tool.execute({ query: 'taco place' }, stGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toContain('St. George');
  });

  it('an explicit location still wins', async () => {
    const tool = await domainTool(localSearch, 'searchLocalBusinesses');
    await tool.execute({ query: 'taco place', location: 'Cedar City' }, stGeorge);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('Cedar City');
  });
});

describe('getCommuteTime / getDirections (information/traffic.ts)', () => {
  const fetchSpy = vi.fn(
    async (_url: string): Promise<Response> => new Response(null, { status: 500 })
  );

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockClear();
  });

  /** The origin the tool sent to Google, read back from the request URL. */
  const sentOrigin = (param: 'origins' | 'origin') =>
    new URL(String(fetchSpy.mock.calls[0]?.[0])).searchParams.get(param);

  it('getCommuteTime routes from the caller when the model gives no origin', async () => {
    const tool = await legacyTrafficTool('getCommuteTime');
    await tool.execute({ destination: 'Zion National Park' }, stGeorge);
    expect(sentOrigin('origins')).toContain('St. George');
  });

  it('getCommuteTime: an explicit origin still wins', async () => {
    const tool = await legacyTrafficTool('getCommuteTime');
    await tool.execute({ origin: 'Hurricane, UT', destination: 'Zion National Park' }, stGeorge);
    expect(sentOrigin('origins')).toBe('Hurricane, UT');
  });

  it('getDirections routes from the caller when the origin is "current location"', async () => {
    const tool = await legacyTrafficTool('getDirections');
    await tool.execute({ origin: 'current location', destination: 'Zion National Park' }, stGeorge);
    expect(sentOrigin('origin')).toContain('St. George');
  });

  it('getDirections: an explicit origin still wins', async () => {
    const tool = await legacyTrafficTool('getDirections');
    await tool.execute({ origin: 'Springdale, UT', destination: 'Zion National Park' }, stGeorge);
    expect(sentOrigin('origin')).toBe('Springdale, UT');
  });

  it('asks for a starting point only when no location is known', async () => {
    const tool = await legacyTrafficTool('getDirections');
    expect(await tool.execute({ destination: 'Zion' }, callFrom(undefined))).toMatch(
      /Where are you starting/
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getCommuteTime (transportation)', () => {
  it('routes from the caller when the model gives no starting point', async () => {
    const tool = await domainTool(transportation, 'getCommuteTime');
    expect(await tool.execute({ to: 'Zion National Park' }, stGeorge)).toBe(
      'drive St. George, UT -> Zion National Park'
    );
  });

  it('an explicit starting point still wins', async () => {
    const tool = await domainTool(transportation, 'getCommuteTime');
    await tool.execute({ to: 'Zion National Park', from: 'Hurricane, UT' }, stGeorge);
    expect(traffic.getTrafficTime).toHaveBeenCalledWith('Hurricane, UT', 'Zion National Park');
  });
});
