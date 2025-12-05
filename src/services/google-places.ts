/**
 * Google Places API Integration (New API)
 * 
 * Provides restaurant search and details using Google Places API (New):
 * - Search for restaurants by query and location
 * - Get restaurant details (phone, address, hours, reviews)
 * - Get place photos
 * 
 * This replaces OpenTable/Resy/Yelp with a single, cost-effective API.
 * Reservations are handled via phone calls through the appointment system.
 * 
 * Requires: GOOGLE_API_KEY (same key used for Gemini)
 * Enable "Places API (New)" in Google Cloud Console
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const PLACES_API_NEW = 'https://places.googleapis.com/v1';
const PLACES_API_LEGACY = 'https://maps.googleapis.com/maps/api/place';
const PLACES_API_BASE = PLACES_API_LEGACY; // Alias for legacy endpoints

// ============================================================================
// TYPES
// ============================================================================

export interface PlaceSearchResult {
  placeId: string;
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number; // 0-4
  types: string[];
  openNow?: boolean;
  photoReference?: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  formattedPhoneNumber?: string;
  internationalPhoneNumber?: string;
  website?: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  openingHours?: {
    openNow: boolean;
    weekdayText: string[];
    periods: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  };
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    relativeTimeDescription: string;
  }>;
  photos?: Array<{
    photoReference: string;
    width: number;
    height: number;
  }>;
  types: string[];
  url: string; // Google Maps URL
}

export interface RestaurantSearchOptions {
  query?: string;
  location?: string; // Address or "lat,lng"
  radius?: number; // meters, max 50000
  type?: 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'meal_delivery' | 'meal_takeaway';
  minPrice?: number; // 0-4
  maxPrice?: number; // 0-4
  openNow?: boolean;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Search for restaurants using Google Places API (New) - Text Search
 */
export async function searchRestaurants(
  options: RestaurantSearchOptions
): Promise<PlaceSearchResult[]> {
  if (!GOOGLE_API_KEY) {
    getLogger().warn('Google API key not configured for Places API');
    return [];
  }

  const { query = 'restaurant', location, type = 'restaurant', openNow } = options;

  try {
    // Build search query
    let searchQuery = query;
    if (location && !query.includes(location)) {
      searchQuery = `${query} near ${location}`;
    }

    getLogger().info({ query: searchQuery, type }, '🍽️ Searching restaurants via Google Places (New)');

    // Use the new Places API format
    const requestBody: Record<string, unknown> = {
      textQuery: searchQuery,
      includedType: type,
      languageCode: 'en',
    };

    if (openNow) {
      requestBody.openNow = true;
    }

    const response = await fetch(`${PLACES_API_NEW}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.currentOpeningHours,places.photos',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      getLogger().error({ status: response.status, error: errorText }, 'Google Places search failed');
      return [];
    }

    const data = (await response.json()) as {
      places?: Array<{
        id: string;
        displayName: { text: string };
        formattedAddress: string;
        location: { latitude: number; longitude: number };
        rating?: number;
        userRatingCount?: number;
        priceLevel?: string;
        types: string[];
        currentOpeningHours?: { openNow: boolean };
        photos?: Array<{ name: string }>;
      }>;
    };

    const results: PlaceSearchResult[] = (data.places || []).map((place) => ({
      placeId: place.id,
      name: place.displayName.text,
      address: place.formattedAddress,
      location: { lat: place.location.latitude, lng: place.location.longitude },
      rating: place.rating,
      userRatingsTotal: place.userRatingCount,
      priceLevel: priceLevelToNumber(place.priceLevel),
      types: place.types,
      openNow: place.currentOpeningHours?.openNow,
      photoReference: place.photos?.[0]?.name,
    }));

    getLogger().info({ count: results.length }, 'Restaurant search complete');
    return results;
  } catch (error) {
    getLogger().error({ error }, 'Google Places search error');
    return [];
  }
}

/**
 * Convert new API price level string to number
 */
function priceLevelToNumber(priceLevel?: string): number | undefined {
  if (!priceLevel) return undefined;
  const levels: Record<string, number> = {
    'PRICE_LEVEL_FREE': 0,
    'PRICE_LEVEL_INEXPENSIVE': 1,
    'PRICE_LEVEL_MODERATE': 2,
    'PRICE_LEVEL_EXPENSIVE': 3,
    'PRICE_LEVEL_VERY_EXPENSIVE': 4,
  };
  return levels[priceLevel];
}

/**
 * Get detailed information about a place using Places API (New)
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  if (!GOOGLE_API_KEY) {
    getLogger().warn('Google API key not configured for Places API');
    return null;
  }

  try {
    const fieldMask = [
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
      'reviews',
      'photos',
      'types',
      'googleMapsUri',
    ].join(',');

    const response = await fetch(`${PLACES_API_NEW}/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      getLogger().error({ status: response.status, error: errorText }, 'Google Places details failed');
      return null;
    }

    const place = (await response.json()) as {
      id: string;
      displayName: { text: string };
      formattedAddress: string;
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      websiteUri?: string;
      rating?: number;
      userRatingCount?: number;
      priceLevel?: string;
      currentOpeningHours?: {
        openNow: boolean;
        weekdayDescriptions: string[];
        periods: Array<{
          open: { day: number; hour: number; minute: number };
          close?: { day: number; hour: number; minute: number };
        }>;
      };
      reviews?: Array<{
        authorAttribution: { displayName: string };
        rating: number;
        text: { text: string };
        relativePublishTimeDescription: string;
      }>;
      photos?: Array<{
        name: string;
        widthPx: number;
        heightPx: number;
      }>;
      types: string[];
      googleMapsUri: string;
    };

    return {
      placeId: place.id,
      name: place.displayName.text,
      formattedAddress: place.formattedAddress,
      formattedPhoneNumber: place.nationalPhoneNumber,
      internationalPhoneNumber: place.internationalPhoneNumber,
      website: place.websiteUri,
      rating: place.rating,
      userRatingsTotal: place.userRatingCount,
      priceLevel: priceLevelToNumber(place.priceLevel),
      openingHours: place.currentOpeningHours
        ? {
            openNow: place.currentOpeningHours.openNow,
            weekdayText: place.currentOpeningHours.weekdayDescriptions,
            periods: place.currentOpeningHours.periods.map((p) => ({
              open: { day: p.open.day, time: `${p.open.hour.toString().padStart(2, '0')}${p.open.minute.toString().padStart(2, '0')}` },
              close: p.close ? { day: p.close.day, time: `${p.close.hour.toString().padStart(2, '0')}${p.close.minute.toString().padStart(2, '0')}` } : undefined,
            })),
          }
        : undefined,
      reviews: place.reviews?.map((r) => ({
        authorName: r.authorAttribution.displayName,
        rating: r.rating,
        text: r.text.text,
        relativeTimeDescription: r.relativePublishTimeDescription,
      })),
      photos: place.photos?.map((p) => ({
        photoReference: p.name,
        width: p.widthPx,
        height: p.heightPx,
      })),
      types: place.types,
      url: place.googleMapsUri,
    };
  } catch (error) {
    getLogger().error({ error }, 'Google Places details error');
    return null;
  }
}

/**
 * Get a photo URL for a place
 */
export function getPhotoUrl(photoReference: string, maxWidth: number = 400): string {
  if (!GOOGLE_API_KEY || !photoReference) {
    return '';
  }

  return `${PLACES_API_BASE}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
}

/**
 * Find nearby restaurants using Places API (New) - Nearby Search
 */
export async function findNearbyRestaurants(
  lat: number,
  lng: number,
  radius: number = 1500,
  keyword?: string
): Promise<PlaceSearchResult[]> {
  if (!GOOGLE_API_KEY) {
    getLogger().warn('Google API key not configured for Places API');
    return [];
  }

  try {
    const requestBody: Record<string, unknown> = {
      includedTypes: ['restaurant'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radius,
        },
      },
    };

    // Use text search with location if keyword provided
    if (keyword) {
      return searchRestaurants({
        query: `${keyword} restaurant`,
        location: `${lat},${lng}`,
      });
    }

    const response = await fetch(`${PLACES_API_NEW}/places:searchNearby`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.currentOpeningHours,places.photos',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      getLogger().error({ status: response.status, error: errorText }, 'Google Places nearby search failed');
      return [];
    }

    const data = (await response.json()) as {
      places?: Array<{
        id: string;
        displayName: { text: string };
        formattedAddress: string;
        location: { latitude: number; longitude: number };
        rating?: number;
        userRatingCount?: number;
        priceLevel?: string;
        types: string[];
        currentOpeningHours?: { openNow: boolean };
        photos?: Array<{ name: string }>;
      }>;
    };

    return (data.places || []).map((place) => ({
      placeId: place.id,
      name: place.displayName.text,
      address: place.formattedAddress,
      location: { lat: place.location.latitude, lng: place.location.longitude },
      rating: place.rating,
      userRatingsTotal: place.userRatingCount,
      priceLevel: priceLevelToNumber(place.priceLevel),
      types: place.types,
      openNow: place.currentOpeningHours?.openNow,
      photoReference: place.photos?.[0]?.name,
    }));
  } catch (error) {
    getLogger().error({ error }, 'Google Places nearby search error');
    return [];
  }
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format price level for speech
 */
export function formatPriceLevel(level?: number): string {
  if (level === undefined) return 'price not listed';
  const symbols = ['free', 'inexpensive', 'moderate', 'expensive', 'very expensive'];
  return symbols[level] || 'price not listed';
}

/**
 * Format rating for speech
 */
export function formatRating(rating?: number, totalRatings?: number): string {
  if (!rating) return 'no reviews yet';
  const stars = rating.toFixed(1);
  if (totalRatings) {
    return `${stars} stars from ${totalRatings.toLocaleString()} reviews`;
  }
  return `${stars} stars`;
}

/**
 * Format restaurant for speech
 */
export function formatRestaurantForSpeech(place: PlaceSearchResult | PlaceDetails): string {
  const parts = [place.name];

  if ('rating' in place && place.rating) {
    parts.push(`- ${place.rating.toFixed(1)} stars`);
  }

  if ('priceLevel' in place && place.priceLevel !== undefined) {
    parts.push(`- ${formatPriceLevel(place.priceLevel)}`);
  }

  if ('openNow' in place) {
    parts.push(place.openNow ? '- open now' : '- currently closed');
  }

  return parts.join(' ');
}

/**
 * Format multiple restaurants for speech
 */
export function formatRestaurantListForSpeech(places: PlaceSearchResult[], limit: number = 3): string {
  if (places.length === 0) {
    return "I couldn't find any restaurants matching that search.";
  }

  const topPlaces = places.slice(0, limit);
  const formatted = topPlaces.map((p, i) => `${i + 1}. ${formatRestaurantForSpeech(p)}`);

  let result = `I found ${places.length} restaurant${places.length > 1 ? 's' : ''}. Here are the top ${topPlaces.length}: ${formatted.join('. ')}`;

  if (places.length > limit) {
    result += `. Would you like to hear more options?`;
  }

  return result;
}

// ============================================================================
// CONFIGURATION CHECK
// ============================================================================

/**
 * Check if Google Places API is configured
 */
export function isGooglePlacesConfigured(): boolean {
  return !!GOOGLE_API_KEY;
}

export default {
  searchRestaurants,
  getPlaceDetails,
  getPhotoUrl,
  findNearbyRestaurants,
  formatPriceLevel,
  formatRating,
  formatRestaurantForSpeech,
  formatRestaurantListForSpeech,
  isGooglePlacesConfigured,
};
