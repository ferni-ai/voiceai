/**
 * Every Google Places lookup goes to Places API (New). The Places key in
 * Secret Manager returns REQUEST_DENIED on the legacy
 * maps.googleapis.com/maps/api/place endpoints, so a legacy call means no
 * results in production.
 *
 * These tests pin the request (URL, method, X-Goog-Api-Key, X-Goog-FieldMask)
 * and the mapping from a Places (New) response to the shapes callers read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// external-apis/google-places.ts reads its key at import.
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

import { getPlaceDetails, searchRestaurants } from '../google-places.js';
import {
  DISCOVERY_FIELD_MASK,
  discoverBusinesses,
} from '../../concierge/discovery/google-places.js';

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

/** A Places (New) place as searchText returns it for the fields we request. */
const CAFE = {
  id: 'ChIJ-test-cafe-1',
  types: ['coffee_shop', 'cafe', 'food', 'point_of_interest', 'establishment'],
  nationalPhoneNumber: '(727) 555-0100',
  formattedAddress: '100 Central Ave, St. Petersburg, FL 33701, USA',
  location: { latitude: 27.7712, longitude: -82.6374 },
  rating: 4.6,
  websiteUri: 'https://cafe.example.com/',
  userRatingCount: 812,
  priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
  displayName: { text: 'Harbor Test Coffee', languageCode: 'en' },
  currentOpeningHours: {
    openNow: true,
    periods: [{ open: { day: 1, hour: 7, minute: 0 }, close: { day: 1, hour: 15, minute: 30 } }],
    weekdayDescriptions: ['Monday: 7:00 AM – 3:30 PM', 'Tuesday: 7:00 AM – 3:30 PM'],
  },
};
/** No phone, no website: concierge cannot reach it. */
const NO_CONTACT = {
  ...CAFE,
  id: 'ChIJ-test-cafe-2',
  displayName: { text: 'Unlisted Test Cafe', languageCode: 'en' },
  nationalPhoneNumber: undefined,
  websiteUri: undefined,
  rating: 4.9,
  priceLevel: 'PRICE_LEVEL_MODERATE',
};

const fetchMock = vi.fn();

function respond(body: unknown, status = 200): void {
  // A fresh Response per call: a body can only be read once.
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  );
}

function call(i = 0): { url: string; init: RequestInit; headers: Record<string, string> } {
  const [url, init = {}] = fetchMock.mock.calls[i] as [string, RequestInit | undefined];
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
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

describe('searchRestaurants (findRestaurants, searchLocalBusinesses, pickRestaurant)', () => {
  it('POSTs places:searchText with the key and a field mask without photos', async () => {
    respond({ places: [CAFE] });

    await searchRestaurants({ query: 'coffee', location: 'St. Petersburg FL', openNow: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = call();
    expect(url).toBe(SEARCH_TEXT_URL);
    expect(init.method).toBe('POST');
    expect(headers['X-Goog-Api-Key']).toBe('test-places-key');
    expect(headers['X-Goog-FieldMask']).toBe(
      'places.id,places.displayName,places.formattedAddress,places.location,places.rating,' +
        'places.userRatingCount,places.priceLevel,places.types,places.currentOpeningHours'
    );
    expect(JSON.parse(String(init.body))).toEqual({
      textQuery: 'coffee near St. Petersburg FL',
      includedType: 'restaurant',
      languageCode: 'en',
      openNow: true,
    });
  });

  it('maps a Places (New) place to PlaceSearchResult', async () => {
    respond({ places: [CAFE] });

    const [place] = await searchRestaurants({ query: 'coffee', location: 'St. Petersburg FL' });

    expect(place).toEqual({
      placeId: 'ChIJ-test-cafe-1',
      name: 'Harbor Test Coffee',
      address: '100 Central Ave, St. Petersburg, FL 33701, USA',
      location: { lat: 27.7712, lng: -82.6374 },
      rating: 4.6,
      userRatingsTotal: 812,
      priceLevel: 1,
      types: CAFE.types,
      openNow: true,
    });
  });

  it('returns [] when Places answers with an error status', async () => {
    respond({ error: { code: 403, status: 'PERMISSION_DENIED' } }, 403);
    expect(await searchRestaurants({ query: 'coffee', location: 'Tampa' })).toEqual([]);
  });
});

describe('getPlaceDetails (getBusinessInfo, findBusinessPhone)', () => {
  it('GETs places/{id} with a field mask that leaves out reviews and photos', async () => {
    respond(CAFE);

    await getPlaceDetails('ChIJ-test/../x');

    const { url, init, headers } = call();
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJ-test%2F..%2Fx');
    expect(init.method).toBeUndefined(); // GET
    expect(headers['X-Goog-Api-Key']).toBe('test-places-key');
    expect(headers['X-Goog-FieldMask'].split(',')).toEqual([
      'id',
      'displayName',
      'formattedAddress',
      'nationalPhoneNumber',
      'internationalPhoneNumber',
      'websiteUri',
      'rating',
      'userRatingCount',
      'priceLevel',
      'currentOpeningHours',
      'types',
      'googleMapsUri',
    ]);
  });

  it('maps phone, website and hours', async () => {
    respond({ ...CAFE, googleMapsUri: 'https://maps.google.com/?cid=1' });

    const details = await getPlaceDetails('ChIJ-test-cafe-1');

    expect(details).toMatchObject({
      name: 'Harbor Test Coffee',
      formattedPhoneNumber: '(727) 555-0100',
      website: 'https://cafe.example.com/',
      priceLevel: 1,
      url: 'https://maps.google.com/?cid=1',
      openingHours: {
        openNow: true,
        weekdayText: CAFE.currentOpeningHours.weekdayDescriptions,
        periods: [{ open: { day: 1, time: '0700' }, close: { day: 1, time: '1530' } }],
      },
    });
  });

  it('keeps hours when Places omits periods', async () => {
    respond({ ...CAFE, currentOpeningHours: { openNow: false, weekdayDescriptions: [] } });

    const details = await getPlaceDetails('ChIJ-test-cafe-1');

    expect(details?.openingHours).toEqual({ openNow: false, weekdayText: [], periods: [] });
  });
});

describe('discoverBusinesses (concierge)', () => {
  it('makes one searchText call that also returns phone and website', async () => {
    respond({ places: [CAFE] });

    await discoverBusinesses({
      domain: 'local_service',
      location: 'St. Petersburg FL',
      keyword: 'plumber',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1); // no geocode, no per-place details
    const { url, init, headers } = call();
    expect(url).toBe(SEARCH_TEXT_URL);
    expect(init.method).toBe('POST');
    expect(headers['X-Goog-Api-Key']).toBe('test-places-key');
    expect(headers['X-Goog-FieldMask']).toBe(DISCOVERY_FIELD_MASK);
    expect(DISCOVERY_FIELD_MASK.split(',')).toEqual(
      expect.arrayContaining(['places.nationalPhoneNumber', 'places.websiteUri'])
    );
    expect(DISCOVERY_FIELD_MASK).not.toMatch(/photos|reviews/);
    expect(JSON.parse(String(init.body))).toEqual({
      textQuery: 'plumber in St. Petersburg FL',
      languageCode: 'en',
    });
  });

  it('maps places and drops the ones nobody can contact', async () => {
    respond({ places: [NO_CONTACT, CAFE] });

    const found = await discoverBusinesses({ domain: 'restaurant', location: 'Tampa' });

    expect(found).toEqual([
      {
        placeId: 'ChIJ-test-cafe-1',
        name: 'Harbor Test Coffee',
        address: '100 Central Ave, St. Petersburg, FL 33701, USA',
        phone: '(727) 555-0100',
        website: 'https://cafe.example.com/',
        rating: 4.6,
        userRatingsTotal: 812,
        priceLevel: 1,
        types: CAFE.types,
        openNow: true,
        businessHours: CAFE.currentOpeningHours.weekdayDescriptions,
        location: { lat: 27.7712, lng: -82.6374 },
      },
    ]);
  });

  it('applies minRating and priceLevel filters', async () => {
    respond({ places: [CAFE, { ...NO_CONTACT, websiteUri: 'https://b.example.com/' }] });

    const pricey = await discoverBusinesses({
      domain: 'restaurant',
      location: 'Tampa',
      priceLevel: [2],
    });
    expect(pricey.map((b) => b.placeId)).toEqual(['ChIJ-test-cafe-2']);

    const rated = await discoverBusinesses({
      domain: 'restaurant',
      location: 'Tampa',
      minRating: 4.7,
    });
    expect(rated.map((b) => b.placeId)).toEqual(['ChIJ-test-cafe-2']);
  });

  it('returns no businesses, not mock ones, when Places fails', async () => {
    respond({ error: { code: 403, status: 'PERMISSION_DENIED' } }, 403);
    expect(await discoverBusinesses({ domain: 'hotel', location: 'Tampa' })).toEqual([]);
  });

  it('returns no businesses, and calls nothing, when no Places key is set', async () => {
    const saved = {
      places: process.env.GOOGLE_PLACES_API_KEY,
      google: process.env.GOOGLE_API_KEY,
    };
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      expect(await discoverBusinesses({ domain: 'hotel', location: 'Tampa' })).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (saved.places !== undefined) process.env.GOOGLE_PLACES_API_KEY = saved.places;
      if (saved.google !== undefined) process.env.GOOGLE_API_KEY = saved.google;
    }
  });
});
