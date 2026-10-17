/**
 * Google Places Discovery
 *
 * Discovers businesses using Google Places API (New) for contact information.
 * This is the first step in the concierge flow - finding who to call.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ConciergeDomain, DiscoveryOptions, DiscoveredBusiness } from '../types.js';
import { PLACES_API_NEW, priceLevelToNumber } from '../../google-places.js';

const log = createLogger({ module: 'concierge-discovery' });

// Domain-specific search terms for better results
const DOMAIN_SEARCH_TERMS: Record<ConciergeDomain, string> = {
  hotel: 'hotel',
  restaurant: 'restaurant',
  healthcare: 'medical clinic',
  local_service: '',
  airline: 'airline office',
  car_rental: 'car rental',
  insurance: 'insurance agency',
  utility: 'utility company',
  government: 'government office',
  other: '',
};

/** The Places key, read per call (GOOGLE_PLACES_API_KEY, else GOOGLE_API_KEY). */
function placesApiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY || '';
}

/**
 * Check if Google Places API is configured
 */
export function isGooglePlacesConfigured(): boolean {
  return !!placesApiKey();
}

/**
 * One Text Search (New) returns the phone and website too, so there is no
 * geocode call and no Place Details call per result. Only the fields mapped
 * below are requested.
 */
export const DISCOVERY_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.types',
  'places.currentOpeningHours',
  'places.nationalPhoneNumber',
  'places.websiteUri',
].join(',');

/**
 * Discover businesses matching the criteria
 */
export async function discoverBusinesses(options: DiscoveryOptions): Promise<DiscoveredBusiness[]> {
  const { domain, location, keyword, limit = 5, minRating, priceLevel, openNow } = options;

  log.info({ domain, location, limit }, 'Discovering businesses');

  const apiKey = placesApiKey();
  if (!apiKey) {
    log.warn('Google Places API not configured, returning mock data');
    return getMockBusinesses(domain, location, limit);
  }

  try {
    const searchTerm = keyword || DOMAIN_SEARCH_TERMS[domain];
    const textQuery = searchTerm ? `${searchTerm} in ${location}` : `${domain} in ${location}`;

    const response = await fetch(`${PLACES_API_NEW}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': DISCOVERY_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, languageCode: 'en', ...(openNow ? { openNow } : {}) }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      log.error({ status: response.status }, 'Places API (New) search failed');
      return [];
    }

    const data = (await response.json()) as { places?: PlaceNew[] };
    let businesses = (data.places || []).map(toDiscoveredBusiness);

    if (minRating) {
      businesses = businesses.filter((b) => (b.rating || 0) >= minRating);
    }
    if (priceLevel && priceLevel.length > 0) {
      businesses = businesses.filter((b) => b.priceLevel && priceLevel.includes(b.priceLevel));
    }

    // Sort by rating (descending) then by number of reviews
    businesses.sort((a, b) => {
      const ratingDiff = (b.rating || 0) - (a.rating || 0);
      if (Math.abs(ratingDiff) > 0.2) return ratingDiff;
      return (b.userRatingsTotal || 0) - (a.userRatingsTotal || 0);
    });

    // We can only reach a business with a phone number or website
    const contactable = businesses.slice(0, limit).filter((b) => b.phone || b.website);

    log.info({ domain, location, found: contactable.length }, 'Business discovery complete');
    return contactable;
  } catch (error) {
    log.error({ error: String(error), domain, location }, 'Failed to discover businesses');
    return [];
  }
}

function toDiscoveredBusiness(place: PlaceNew): DiscoveredBusiness {
  return {
    placeId: place.id,
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    phone: place.nationalPhoneNumber,
    website: place.websiteUri,
    rating: place.rating,
    userRatingsTotal: place.userRatingCount,
    priceLevel: priceLevelToNumber(place.priceLevel),
    types: place.types || [],
    openNow: place.currentOpeningHours?.openNow,
    businessHours: place.currentOpeningHours?.weekdayDescriptions,
    location: place.location
      ? { lat: place.location.latitude, lng: place.location.longitude }
      : { lat: 0, lng: 0 },
  };
}

/**
 * Get mock businesses for development/testing
 */
function getMockBusinesses(
  domain: ConciergeDomain,
  location: string,
  limit: number
): DiscoveredBusiness[] {
  const mockData: Record<ConciergeDomain, DiscoveredBusiness[]> = {
    hotel: [
      {
        placeId: 'mock_hotel_1',
        name: 'Grand Plaza Hotel',
        address: `123 Main St, ${location}`,
        phone: '+1-555-0101',
        website: 'https://grandplaza.example.com',
        rating: 4.5,
        userRatingsTotal: 1250,
        priceLevel: 3,
        types: ['lodging', 'hotel'],
        location: { lat: 0, lng: 0 },
      },
      {
        placeId: 'mock_hotel_2',
        name: 'Comfort Inn & Suites',
        address: `456 Oak Ave, ${location}`,
        phone: '+1-555-0102',
        website: 'https://comfortinn.example.com',
        rating: 4.2,
        userRatingsTotal: 890,
        priceLevel: 2,
        types: ['lodging', 'hotel'],
        location: { lat: 0, lng: 0 },
      },
      {
        placeId: 'mock_hotel_3',
        name: 'Luxury Resort & Spa',
        address: `789 Beach Blvd, ${location}`,
        phone: '+1-555-0103',
        website: 'https://luxuryresort.example.com',
        rating: 4.8,
        userRatingsTotal: 2100,
        priceLevel: 4,
        types: ['lodging', 'resort'],
        location: { lat: 0, lng: 0 },
      },
    ],
    restaurant: [
      {
        placeId: 'mock_restaurant_1',
        name: "Antonio's Italian Kitchen",
        address: `100 Food Court, ${location}`,
        phone: '+1-555-0201',
        rating: 4.6,
        userRatingsTotal: 560,
        priceLevel: 2,
        types: ['restaurant', 'italian'],
        location: { lat: 0, lng: 0 },
      },
      {
        placeId: 'mock_restaurant_2',
        name: 'The Seafood House',
        address: `200 Harbor View, ${location}`,
        phone: '+1-555-0202',
        rating: 4.4,
        userRatingsTotal: 890,
        priceLevel: 3,
        types: ['restaurant', 'seafood'],
        location: { lat: 0, lng: 0 },
      },
    ],
    healthcare: [
      {
        placeId: 'mock_doctor_1',
        name: 'City Medical Center',
        address: `500 Health Way, ${location}`,
        phone: '+1-555-0301',
        rating: 4.3,
        userRatingsTotal: 340,
        types: ['doctor', 'health'],
        location: { lat: 0, lng: 0 },
      },
      {
        placeId: 'mock_doctor_2',
        name: 'Family Care Clinic',
        address: `600 Wellness Dr, ${location}`,
        phone: '+1-555-0302',
        rating: 4.7,
        userRatingsTotal: 220,
        types: ['doctor', 'health'],
        location: { lat: 0, lng: 0 },
      },
    ],
    local_service: [
      {
        placeId: 'mock_plumber_1',
        name: "Mike's Plumbing Services",
        address: `${location}`,
        phone: '+1-555-0401',
        rating: 4.8,
        userRatingsTotal: 156,
        types: ['plumber'],
        location: { lat: 0, lng: 0 },
      },
      {
        placeId: 'mock_electrician_1',
        name: 'Quick Electric Co',
        address: `${location}`,
        phone: '+1-555-0402',
        rating: 4.5,
        userRatingsTotal: 89,
        types: ['electrician'],
        location: { lat: 0, lng: 0 },
      },
    ],
    airline: [],
    car_rental: [],
    insurance: [],
    utility: [],
    government: [],
    other: [],
  };

  return (mockData[domain] || []).slice(0, limit);
}

/** A Places API (New) place, limited to DISCOVERY_FIELD_MASK. */
interface PlaceNew {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  nationalPhoneNumber?: string;
  websiteUri?: string;
}
