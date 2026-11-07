/**
 * A price is spoken only when the source gave one. Each search used to fill a
 * missing price with "$$", so Ferni told callers a place was moderately priced
 * when nobody knew. Real search and speech code; only fetch is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  // The reservation module reads its keys at import time.
  process.env.OPENTABLE_API_KEY = 'test-opentable-key';
  process.env.YELP_API_KEY = 'test-yelp-key';
  delete process.env.RESY_API_KEY;
});

import {
  searchRestaurants as searchProviders,
  formatRestaurantForSpeech,
} from '../restaurant-reservations.js';
import { searchRestaurants as searchTravel } from '../../../tools/domains/travel/restaurants.js';

const fetchMock = vi.fn();
const json = (body: object) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-places-key');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** One Bluebird Diner from OpenTable and one Harbor Noodle House from Yelp. */
function providersReply(price?: number) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('opentable.com')) {
      return json({
        restaurants: [
          {
            id: 'ot1',
            name: 'Bluebird Diner',
            address: { street: '100 Example Ave', city: 'Riverside' },
            cuisine: 'Diner',
            rating: 4.5,
            ...(price && { price }),
          },
        ],
      });
    }
    return json({
      businesses: [
        {
          id: 'y1',
          name: 'Harbor Noodle House',
          location: { address1: '200 Example Ave', city: 'Riverside' },
          categories: [{ title: 'Noodles' }],
          rating: 4.2,
          phone: '+15555550123',
          ...(price && { price: '$'.repeat(price) }),
        },
      ],
    });
  });
}

async function spokenProviders(): Promise<string[]> {
  const found = await searchProviders('pancakes', 'Riverside', '2026-12-01', '19:00', 2);
  expect(found.map((r) => r.name).sort()).toEqual(['Bluebird Diner', 'Harbor Noodle House']);
  return found.map(formatRestaurantForSpeech);
}

describe('reservation provider search (formatRestaurantForSpeech)', () => {
  it('says no price when the provider gave none', async () => {
    providersReply();
    for (const line of await spokenProviders()) expect(line).not.toContain('$');
  });

  it('says the price the provider gave', async () => {
    providersReply(2);
    for (const line of await spokenProviders()) expect(line).toContain('- $$ -');
  });
});

const travelPlaces = (priceLevel?: string) =>
  fetchMock.mockResolvedValue(
    json({
      places: [
        {
          id: 'p1',
          displayName: { text: 'Bluebird Diner' },
          formattedAddress: '100 Example Ave, Riverside',
          location: { latitude: 0, longitude: 0 },
          rating: 4.5,
          userRatingCount: 120,
          types: ['restaurant', 'diner'],
          ...(priceLevel && { priceLevel }),
        },
      ],
    })
  );

describe('travel restaurant search', () => {
  it('says no price when Places gave none', async () => {
    travelPlaces();
    const reply = await searchTravel({ location: 'Riverside' });
    expect(reply).toContain('Bluebird Diner');
    expect(reply).not.toContain('$');
  });

  it('says the price Places gave', async () => {
    travelPlaces('PRICE_LEVEL_MODERATE');
    expect(await searchTravel({ location: 'Riverside' })).toContain('Bluebird Diner** $$\n');
  });

  it('says it could not look when Places fails, never "none found"', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    const reply = await searchTravel({ location: 'Riverside' });
    expect(reply).toBe("I can't search restaurants right now.");
  });
});
