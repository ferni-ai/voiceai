/**
 * PLACES_NEEDS_LOCATION: findBusiness never searches Places without knowing
 * where the caller is. Live (prod, 2026-10-21) "a good taco place nearby" ran
 * with no location, and Ferni named "Roberto's Taco Shop… open right now" from
 * whatever Places returned for "tacos" anywhere.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({ description: config.description, execute: config.execute })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const places = vi.hoisted(() => ({
  searchRestaurants: vi.fn(async (_opts: { query?: string; location?: string }) => [
    { placeId: 'p1', name: "Roberto's Taco Shop", address: '1 Main St', openNow: true },
  ]),
}));
vi.mock('../../../../services/google-places.js', () => ({
  searchRestaurants: places.searchRestaurants,
  getPlaceDetails: vi.fn(async () => null),
  findNearbyRestaurants: vi.fn(async () => []),
  isGooglePlacesConfigured: () => true,
  formatRestaurantListForSpeech: (rs: Array<{ name: string }>) =>
    rs.map((r) => `${r.name}, open now`).join('; '),
}));

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

type Exec = { execute: (args: object, opts: unknown) => Promise<unknown> };
const ctx = { userId: 'u-places', agentId: 'ferni' } as ToolContext;
/** LiveKit's RunContext: the caller's device location rides on userData. */
const call = (userLocation?: { city: string; regionCode?: string }) => ({
  toolCallId: 't',
  ctx: { userData: { userId: 'u-places', ...(userLocation && { userLocation }) } },
});

async function runTool(id: string, args: object, opts: unknown = call()): Promise<string> {
  const def = (await getToolDefinitions()).find((d: ToolDefinition) => d.id === id);
  if (!def) throw new Error(`${id} not registered`);
  return String(await (def.create(ctx) as Exec).execute(args, opts));
}
const findBusiness = (args: object, opts?: unknown) => runTool('findBusiness', args, opts);

const tacos = { action: 'search', query: 'tacos' };

beforeEach(() => {
  places.searchRestaurants.mockClear();
  vi.unstubAllEnvs();
  vi.stubEnv('PLACES_LOCATION', 'off');
});

describe('findBusiness with no caller location', () => {
  it('flag off: searches anyway and names a place (the prod bug, kept as is)', async () => {
    vi.stubEnv('PLACES_NEEDS_LOCATION', 'off');
    const reply = await findBusiness(tacos);
    expect(places.searchRestaurants).toHaveBeenCalledTimes(1);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBeUndefined();
    expect(reply).toContain("Roberto's Taco Shop");
  });

  it('flag on: runs no search, names no place, and says to ask where they are', async () => {
    vi.stubEnv('PLACES_NEEDS_LOCATION', 'on');
    const reply = await findBusiness(tacos);
    expect(places.searchRestaurants).not.toHaveBeenCalled();
    expect(reply).not.toContain('Roberto');
    expect(JSON.parse(reply)).toMatchObject({ status: 'need_location' });
    expect(JSON.parse(reply).instruction).toMatch(/ask/i);
  });

  it('flag on: a "near me" placeholder is no location either', async () => {
    vi.stubEnv('PLACES_NEEDS_LOCATION', 'on');
    const reply = await findBusiness({ ...tacos, location: 'near me' });
    expect(places.searchRestaurants).not.toHaveBeenCalled();
    expect(JSON.parse(reply).status).toBe('need_location');
  });

  it('flag on: every Places action asks first (phone, details, call)', async () => {
    vi.stubEnv('PLACES_NEEDS_LOCATION', 'on');
    for (const action of ['details', 'phone', 'call']) {
      const reply = await findBusiness({ action, query: "Roberto's Taco Shop" });
      expect(JSON.parse(reply).status, action).toBe('need_location');
    }
    expect(places.searchRestaurants).not.toHaveBeenCalled();
  });
});

describe('findBusiness with a caller location (flag on)', () => {
  beforeEach(() => vi.stubEnv('PLACES_NEEDS_LOCATION', 'on'));

  it('searches where the caller said', async () => {
    const reply = await findBusiness({ ...tacos, location: 'St. George, UT' });
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('St. George, UT');
    expect(reply).toContain("Roberto's Taco Shop");
  });

  it("searches near the city the caller's device shows", async () => {
    await findBusiness(tacos, call({ city: 'St. George', regionCode: 'UT' }));
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('St. George, UT');
  });
});

describe('the restaurant tool searches "nearby" only when it knows where that is', () => {
  const search = { action: 'search', query: 'tacos', dateTime: 'tomorrow at 7pm' };

  it('flag off: searches "nearby" with no location (unchanged)', async () => {
    vi.stubEnv('PLACES_NEEDS_LOCATION', 'off');
    await runTool('restaurant', search);
    expect(places.searchRestaurants).toHaveBeenCalledTimes(1);
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('nearby');
  });

  it('flag on: asks instead, and searches the device city when there is one', async () => {
    vi.stubEnv('PLACES_NEEDS_LOCATION', 'on');
    expect(JSON.parse(await runTool('restaurant', search)).status).toBe('need_location');
    expect(places.searchRestaurants).not.toHaveBeenCalled();
    await runTool('restaurant', search, call({ city: 'St. George', regionCode: 'UT' }));
    expect(places.searchRestaurants.mock.calls[0][0].location).toBe('St. George, UT');
  });
});
