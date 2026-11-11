/**
 * A price is spoken only when the source gave one. Each search used to fill a
 * missing price with "$$", so Ferni told callers a place was moderately priced
 * when nobody knew. Real search and speech code; only fetch is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
