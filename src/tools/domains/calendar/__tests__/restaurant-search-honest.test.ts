/**
 * The calendar 'restaurant' tool's search action, with no booking provider set
 * up (prod has no OpenTable, Resy or Yelp key, but does have a Places key).
 * It used to ask only those providers and told every caller "I couldn't find
 * any" without looking. It now searches Places, and says it couldn't look when
 * the search did not run. Places itself is real here; only fetch is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  // The reservation module reads its keys at import time.
  for (const name of ['OPENTABLE_API_KEY', 'RESY_API_KEY', 'YELP_API_KEY'])
    delete process.env[name];
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({ description: config.description, execute: config.execute })),
  },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';
import { LOCAL_SEARCH_UNAVAILABLE } from '../../local-search/unified-search.js';

type Exec = { execute: (args: object, opts: unknown) => Promise<unknown> };
const ctx = { userId: 'u-sam', agentId: 'ferni' } as ToolContext;
const call = { toolCallId: 't', ctx: { userData: { userId: 'u-sam' } } };

async function searchRestaurants(args: object = {}): Promise<string> {
  const def = (await getToolDefinitions()).find((d: ToolDefinition) => d.id === 'restaurant');
  if (!def) throw new Error('restaurant not registered');
  const tool = def.create(ctx) as Exec;
  return String(
    await tool.execute(
      { action: 'search', query: 'pancakes', location: 'Riverside', dateTime: 'tomorrow', ...args },
      call
    )
  );
}

const place = (name: string, priceLevel?: string) => ({
  id: `place-${name.length}`,
  displayName: { text: name },
  formattedAddress: '100 Example Ave, Riverside',
  location: { latitude: 0, longitude: 0 },
  rating: 4.5,
  userRatingCount: 120,
  types: ['restaurant'],
  ...(priceLevel && { priceLevel }),
});

const fetchMock = vi.fn();
const placesReply = (places: object[]) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ places }), { status: 200 }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-places-key');
  vi.stubEnv('PLACES_NEEDS_LOCATION', 'off');
  vi.stubEnv('PLACES_LOCATION', 'off');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('restaurant search with no booking provider', () => {
  it('searches Places and speaks the places it found', async () => {
    placesReply([
      place('Bluebird Diner'),
      place('Maple Street Cafe'),
      place('Harbor Noodle House'),
    ]);
    const reply = await searchRestaurants();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('places.googleapis.com');
    for (const name of ['Bluebird Diner', 'Maple Street Cafe', 'Harbor Noodle House']) {
      expect(reply).toContain(name);
    }
    expect(reply).not.toMatch(/couldn't find/i);
  });

  it('says none were found only when Places answered with none', async () => {
    placesReply([]);
    const reply = await searchRestaurants();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reply).toBe(
      "I couldn't find pancakes restaurants in Riverside. Try a different area or cuisine?"
    );
  });

  it.each([
    [
      'Places answers with an error',
      () => fetchMock.mockResolvedValue(new Response('', { status: 503 })),
    ],
    [
      'the lookup times out',
      () =>
        fetchMock.mockRejectedValue(
          Object.assign(new Error('timed out'), { name: 'TimeoutError' })
        ),
    ],
    ['Places is not set up', () => vi.stubEnv('GOOGLE_PLACES_API_KEY', '')],
  ])('%s: says it could not look, never "none found"', async (_case, arrange) => {
    arrange();
    const reply = await searchRestaurants();
    expect(reply).toBe(LOCAL_SEARCH_UNAVAILABLE);
    expect(reply).not.toMatch(/couldn't find/i);
  });

  it('with no place to look, runs no search and asks where', async () => {
    placesReply([place('Bluebird Diner')]);
    const reply = await searchRestaurants({ location: undefined });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(reply).status).toBe('need_location');
  });
});

describe('restaurant search price', () => {
  it('says no price when Places gave none', async () => {
    placesReply([place('Bluebird Diner')]);
    const reply = await searchRestaurants();
    expect(reply).toContain('Bluebird Diner');
    expect(reply).not.toContain('$');
  });

  it('says the price Places gave', async () => {
    placesReply([place('Bluebird Diner', 'PRICE_LEVEL_MODERATE')]);
    expect(await searchRestaurants()).toContain('Bluebird Diner** $$\n');
  });
});

describe('findBusiness when Places fails', () => {
  it('says it could not look, not the raw error and not "none found"', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    const def = (await getToolDefinitions()).find((d: ToolDefinition) => d.id === 'findBusiness');
    if (!def) throw new Error('findBusiness not registered');
    const tool = def.create(ctx) as Exec;
    const reply = String(
      await tool.execute({ action: 'phone', query: 'Bluebird Diner', location: 'Riverside' }, call)
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reply).toBe(LOCAL_SEARCH_UNAVAILABLE);
  });
});
