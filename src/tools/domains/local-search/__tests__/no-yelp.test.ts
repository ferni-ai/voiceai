/**
 * Yelp is gone from local search (2026-10-30): Yelp's API terms (section 9.4)
 * ban feeding Yelp content to a generative model. Restaurant and business
 * search runs on Google Places alone; with no Places key the tools say they
 * can't search instead of "I couldn't find any".
 *
 * Real tool definitions and the real Places client; only fetch is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// services/google-places.ts reads its key when the module loads. A Yelp key in
// the environment must change nothing.
vi.hoisted(() => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
  process.env.YELP_API_KEY = 'yelp-key-that-must-never-be-used';
});

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    safeLog: () => logger,
  };
});
// The real Places client, with "is a key configured" under test control.
const places = vi.hoisted(() => ({ configured: true }));
vi.mock('../../../../services/google-places.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isGooglePlacesConfigured: () => places.configured,
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => config) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { definitions } from '../index.js';
import { LOCAL_SEARCH_UNAVAILABLE } from '../unified-search.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';

type Executable = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };

const THAI = {
  id: 'ChIJ-test-thai-1',
  displayName: { text: 'Bangkok Garden' },
  formattedAddress: '200 Central Ave, St. Petersburg, FL 33701, USA',
  location: { latitude: 27.771, longitude: -82.637 },
  rating: 4.5,
  userRatingCount: 320,
  types: ['thai_restaurant', 'restaurant', 'food'],
};

const fetchMock = vi.fn();

function respondWith(places: unknown[]): void {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ places }), { headers: { 'Content-Type': 'application/json' } })
  );
}

function tool(defs: ToolDefinition[], id: string): Executable {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  return def.create({ userId: 'u1' } as ToolContext) as unknown as Executable;
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url));
}

beforeEach(() => {
  places.configured = true;
  fetchMock.mockReset();
  respondWith([]);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local search without Yelp', () => {
  it('findRestaurants returns the Google Places result and calls only Places', async () => {
    respondWith([THAI]);

    const reply = await tool(definitions, 'findRestaurants').execute({
      cuisine: 'Thai',
      location: 'St. Petersburg FL',
    });

    expect(reply).toContain('Bangkok Garden');
    expect(reply).toContain('_via Google_');
    const urls = calledUrls();
    expect(urls).toEqual(['https://places.googleapis.com/v1/places:searchText']);
    expect(urls.join(' ')).not.toMatch(/yelp/i);
  });

  it('searchLocalBusinesses makes no Yelp call when Places finds nothing', async () => {
    const reply = await tool(definitions, 'searchLocalBusinesses').execute({
      query: 'pizza',
      location: 'Tampa',
    });

    expect(reply).toMatch(/couldn't find any "pizza" in Tampa/);
    expect(calledUrls()).toHaveLength(1);
    expect(calledUrls().join(' ')).not.toMatch(/yelp/i);
  });

  it('the Yelp-only review and phone-lookup tools are not registered', () => {
    const ids = definitions.map((d) => d.id);

    expect(ids).toContain('findRestaurants');
    expect(ids).not.toContain('getBusinessReviews');
    expect(ids).not.toContain('lookupBusinessByPhone');
  });

  it('checkLocalSearchStatus names only Google Places', async () => {
    const reply = await tool(definitions, 'checkLocalSearchStatus').execute({});

    expect(reply).toContain('Google Places: ✅ Active');
    expect(reply).not.toMatch(/yelp/i);
  });
});

describe('local search with no Places key', () => {
  it.each(['findRestaurants', 'searchLocalBusinesses', 'getBusinessInfo'])(
    '%s says it cannot search and makes no call',
    async (id) => {
      places.configured = false;

      const reply = await tool(definitions, id).execute({
        query: 'pizza',
        cuisine: 'Thai',
        location: 'Tampa',
        businessId: 'ChIJ-test-thai-1',
      });

      expect(reply).toBe(LOCAL_SEARCH_UNAVAILABLE);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
