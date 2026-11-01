/**
 * The travel restaurant search goes through Places API
 * (New) via services/google-places. The Places key returns REQUEST_DENIED on
 * the legacy maps.googleapis.com/maps/api/place endpoints.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// google-places.ts reads keys at import.
vi.hoisted(() => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-places-key';
});

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    safeLog: () => logger,
  };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn() }));
vi.mock('../../automation/trust-level-system.js', () => ({
  checkActionPermission: vi.fn(),
  markActionExecuted: vi.fn(),
}));
vi.mock('@livekit/agents', () => ({ llm: { tool: vi.fn((c) => c) } }));

import { searchRestaurants as searchTravelRestaurants } from '../../../tools/domains/travel/restaurants.js';

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

/** A Places (New) place as searchText returns it. */
const CAFE = {
  id: 'ChIJ-test-cafe-1',
  types: ['coffee_shop', 'cafe', 'food', 'point_of_interest', 'establishment'],
  formattedAddress: '100 Central Ave, St. Petersburg, FL 33701, USA',
  location: { latitude: 27.7712, longitude: -82.6374 },
  rating: 4.6,
  userRatingCount: 812,
  priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
  displayName: { text: 'Harbor Test Coffee', languageCode: 'en' },
  currentOpeningHours: { openNow: true },
};

const fetchMock = vi.fn();

function respond(body: unknown): void {
  // A fresh Response per call: a body can only be read once.
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  );
}

function sent(): { url: string; textQuery: string; key: string } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const headers = init.headers as Record<string, string>;
  return {
    url,
    textQuery: (JSON.parse(String(init.body)) as { textQuery: string }).textQuery,
    key: headers['X-Goog-Api-Key'],
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  // No lookup may reach the legacy endpoints, which deny the Places key.
  for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toContain('maps.googleapis');
  vi.unstubAllGlobals();
});

describe('travel searchRestaurants', () => {
  it('searches Places (New) and formats the result', async () => {
    respond({ places: [CAFE] });

    const text = await searchTravelRestaurants({ location: 'Tampa', cuisine: 'Cuban', limit: 3 });

    expect(sent()).toEqual({
      url: SEARCH_TEXT_URL,
      textQuery: 'restaurants Cuban near Tampa',
      key: 'test-places-key',
    });
    expect(text).toContain('Harbor Test Coffee');
    expect(text).toContain('coffee_shop, cafe');
  });
});
