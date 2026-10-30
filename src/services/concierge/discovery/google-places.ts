/**
 * Google Places Discovery
 *
 * Discovers businesses using Google Places API (New) for contact information.
 * This is the first step in the concierge flow - finding who to call.
 */

import { googleMapsKey } from '../../../config/google-maps-key.js';
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

/** The Places key, read per call (config/google-maps-key.ts). */
function placesApiKey(): string {
  return googleMapsKey('places');
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
    log.warn('Google Places API not configured, no businesses to offer');
    return [];
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
