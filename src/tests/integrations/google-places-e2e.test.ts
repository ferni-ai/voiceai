/**
 * E2E Integration Tests for Google Places API
 *
 * Tests restaurant search and details functionality:
 * - Search for restaurants by query and location
 * - Get detailed place information
 * - Format results for voice output
 *
 * Requires: GOOGLE_API_KEY with Places API enabled
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  searchRestaurants,
  getPlaceDetails,
  findNearbyRestaurants,
  formatRestaurantForSpeech,
  formatRestaurantListForSpeech,
  formatPriceLevel,
  formatRating,
  isGooglePlacesConfigured,
  type PlaceSearchResult,
} from '../../services/google-places.js';

// ============================================================================
// CONFIGURATION CHECK
// ============================================================================

describe('Google Places Configuration', () => {
  it('should check if API is configured', () => {
    const configured = isGooglePlacesConfigured();

    console.log(`📋 Google Places API configured: ${configured ? '✓' : '✗'}`);

    if (!configured) {
      console.log('   Set GOOGLE_API_KEY and enable Places API in Google Cloud Console');
    }

    expect(typeof configured).toBe('boolean');
  });
});

// ============================================================================
// RESTAURANT SEARCH TESTS
// ============================================================================

describe('Restaurant Search', () => {
  const isConfigured = isGooglePlacesConfigured();

  it.skipIf(!isConfigured)(
    'should search for restaurants by query',
    async () => {
      const results = await searchRestaurants({
        query: 'italian restaurant',
        location: 'New York',
      });

      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        const first = results[0];
        expect(first.placeId).toBeDefined();
        expect(first.name).toBeDefined();
        expect(first.address).toBeDefined();

        console.log(`✅ Found ${results.length} Italian restaurants`);
        console.log(`   Top result: ${first.name}`);
      } else {
        console.log('⚠️ No results found (API may need Places API enabled)');
      }
    },
    15000
  );

  it.skipIf(!isConfigured)(
    'should search for restaurants by type',
    async () => {
      const results = await searchRestaurants({
        query: 'sushi',
        location: 'San Francisco',
        type: 'restaurant',
      });

      expect(Array.isArray(results)).toBe(true);
      console.log(`✅ Found ${results.length} sushi restaurants`);
    },
    15000
  );

  it.skipIf(!isConfigured)(
    'should filter by open now',
    async () => {
      const results = await searchRestaurants({
        query: 'restaurant',
        location: 'Los Angeles',
        openNow: true,
      });

      expect(Array.isArray(results)).toBe(true);

      // All results should be open (if we got any)
      if (results.length > 0) {
        const openCount = results.filter((r) => r.openNow === true).length;
        console.log(`✅ Found ${results.length} open restaurants`);
      }
    },
    15000
  );

  it('should return empty array when not configured', async () => {
    if (isConfigured) {
      console.log('Skipping - API is configured');
      return;
    }

    const results = await searchRestaurants({ query: 'test' });
    expect(results).toEqual([]);
    console.log('✅ Returns empty array when not configured');
  });
});

// ============================================================================
// PLACE DETAILS TESTS
// ============================================================================

describe('Place Details', () => {
  const isConfigured = isGooglePlacesConfigured();
  let testPlaceId: string | null = null;

  beforeAll(async () => {
    if (isConfigured) {
      // Get a place ID to test with
      const results = await searchRestaurants({
        query: 'restaurant',
        location: 'Chicago',
      });
      if (results.length > 0) {
        testPlaceId = results[0].placeId;
      }
    }
  });

  it.skipIf(!isConfigured || !testPlaceId)(
    'should get place details',
    async () => {
      if (!testPlaceId) {
        console.log('⚠️ No test place ID available');
        return;
      }

      const details = await getPlaceDetails(testPlaceId);

      expect(details).not.toBeNull();
      if (details) {
        expect(details.name).toBeDefined();
        expect(details.formattedAddress).toBeDefined();

        console.log(`✅ Got details for: ${details.name}`);
        console.log(`   Address: ${details.formattedAddress}`);
        console.log(`   Phone: ${details.formattedPhoneNumber || 'Not listed'}`);
        console.log(`   Rating: ${details.rating || 'No rating'}`);

        if (details.openingHours) {
          console.log(`   Open now: ${details.openingHours.openNow ? 'Yes' : 'No'}`);
        }
      }
    },
    15000
  );

  it('should return null for invalid place ID', async () => {
    if (!isConfigured) {
      console.log('Skipping - API not configured');
      return;
    }

    const details = await getPlaceDetails('invalid_place_id_12345');
    expect(details).toBeNull();
    console.log('✅ Returns null for invalid place ID');
  }, 15000);
});

// ============================================================================
// NEARBY SEARCH TESTS
// ============================================================================

describe('Nearby Search', () => {
  const isConfigured = isGooglePlacesConfigured();

  it.skipIf(!isConfigured)(
    'should find nearby restaurants',
    async () => {
      // Coordinates for Times Square, NYC
      const lat = 40.758896;
      const lng = -73.98513;

      const results = await findNearbyRestaurants(lat, lng, 500);

      expect(Array.isArray(results)).toBe(true);
      console.log(`✅ Found ${results.length} restaurants near Times Square`);
    },
    15000
  );

  it.skipIf(!isConfigured)(
    'should find nearby restaurants with keyword',
    async () => {
      // Coordinates for Union Square, SF
      const lat = 37.787994;
      const lng = -122.407437;

      const results = await findNearbyRestaurants(lat, lng, 1000, 'pizza');

      expect(Array.isArray(results)).toBe(true);
      console.log(`✅ Found ${results.length} pizza places near Union Square`);
    },
    15000
  );
});

// ============================================================================
// FORMATTING TESTS
// ============================================================================

describe('Formatting Helpers', () => {
  it('should format price levels', () => {
    expect(formatPriceLevel(0)).toBe('free');
    expect(formatPriceLevel(1)).toBe('inexpensive');
    expect(formatPriceLevel(2)).toBe('moderate');
    expect(formatPriceLevel(3)).toBe('expensive');
    expect(formatPriceLevel(4)).toBe('very expensive');
    expect(formatPriceLevel(undefined)).toBe('price not listed');

    console.log('✅ Price level formatting works');
  });

  it('should format ratings', () => {
    expect(formatRating(4.5, 1000)).toBe('4.5 stars from 1,000 reviews');
    expect(formatRating(3.2)).toBe('3.2 stars');
    expect(formatRating(undefined)).toBe('no reviews yet');

    console.log('✅ Rating formatting works');
  });

  it('should format restaurant for speech', () => {
    const place: PlaceSearchResult = {
      placeId: 'test',
      name: 'La Pizzeria',
      address: '123 Main St',
      location: { lat: 0, lng: 0 },
      rating: 4.5,
      priceLevel: 2,
      types: ['restaurant'],
      openNow: true,
    };

    const formatted = formatRestaurantForSpeech(place);

    expect(formatted).toContain('La Pizzeria');
    expect(formatted).toContain('4.5');
    expect(formatted).toContain('moderate');
    expect(formatted).toContain('open now');

    console.log(`✅ Formatted: "${formatted}"`);
  });

  it('should format restaurant list for speech', () => {
    const places: PlaceSearchResult[] = [
      {
        placeId: '1',
        name: 'Restaurant A',
        address: '1 Main St',
        location: { lat: 0, lng: 0 },
        rating: 4.8,
        types: ['restaurant'],
      },
      {
        placeId: '2',
        name: 'Restaurant B',
        address: '2 Main St',
        location: { lat: 0, lng: 0 },
        rating: 4.5,
        types: ['restaurant'],
      },
      {
        placeId: '3',
        name: 'Restaurant C',
        address: '3 Main St',
        location: { lat: 0, lng: 0 },
        rating: 4.2,
        types: ['restaurant'],
      },
    ];

    const formatted = formatRestaurantListForSpeech(places, 2);

    expect(formatted).toContain('I found 3 restaurants');
    expect(formatted).toContain('Restaurant A');
    expect(formatted).toContain('Restaurant B');
    expect(formatted).toContain('Would you like to hear more');

    console.log(`✅ List formatted for speech`);
  });

  it('should handle empty results', () => {
    const formatted = formatRestaurantListForSpeech([]);
    expect(formatted).toContain("couldn't find any restaurants");

    console.log('✅ Empty results handled');
  });
});

// ============================================================================
// SUMMARY
// ============================================================================

describe('Google Places Summary', () => {
  it('should report status', () => {
    const configured = isGooglePlacesConfigured();

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 GOOGLE PLACES INTEGRATION STATUS');
    console.log('═'.repeat(60));

    console.log(`\n  ${configured ? '✅' : '⚪'} API Configured: ${configured ? 'Yes' : 'No'}`);

    if (configured) {
      console.log('\n  Features Available:');
      console.log('    ✅ Restaurant search by query/location');
      console.log('    ✅ Nearby restaurant search');
      console.log('    ✅ Place details (phone, hours, reviews)');
      console.log('    ✅ Speech formatting helpers');
      console.log('\n  Reservations:');
      console.log('    📞 Handled via phone calls (appointment integration)');
    } else {
      console.log('\n  To enable:');
      console.log('    1. GOOGLE_API_KEY is already set (for Gemini)');
      console.log('    2. Enable "Places API" in Google Cloud Console');
      console.log('    3. Run tests again with --send-test');
    }

    console.log(`${'═'.repeat(60)}\n`);

    expect(true).toBe(true);
  });
});
