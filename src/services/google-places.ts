/**
 * Google Places API Service
 *
 * Provides business lookup for Alex to find:
 * - Phone numbers (to make calls)
 * - Business hours
 * - Addresses
 * - Ratings and reviews
 *
 * Perfect for "call the nearest coffee shop" or "what's the number for that restaurant"
 *
 * API Docs: https://developers.google.com/maps/documentation/places/web-service
 */

import { getLogger } from '../utils/safe-logger.js';
import { getConfig } from '../config/environment.js';

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';

// ============================================================================
// TYPES
// ============================================================================

export interface PlacesSearchResult {
  placeId: string;
  name: string;
  address: string;
  phone?: string;
  phoneInternational?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number; // 0-4
  types: string[];
  isOpen?: boolean;
  hours?: string[];
  location: {
    lat: number;
    lng: number;
  };
  photos?: string[];
}

export interface PlaceDetails extends PlacesSearchResult {
  formattedAddress: string;
  formattedPhone?: string;
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    relativeTime: string;
  }>;
  openingHours?: {
    openNow: boolean;
    weekdayText: string[];
    periods: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  };
  utcOffset?: number;
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
}

// ============================================================================
// API HELPERS
// ============================================================================

function getApiKey(): string | null {
  const config = getConfig();
  return config.apis.googleApiKey || process.env.GOOGLE_API_KEY || null;
}

async function placesFetch<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  const apiKey = getApiKey();

  if (!apiKey) {
    getLogger().warn('Google API key not configured for Places');
    return null;
  }

  try {
    const url = new URL(`${PLACES_API_BASE}${endpoint}/json`);
    url.searchParams.append('key', apiKey);

    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      getLogger().warn({ status: response.status, endpoint }, 'Google Places API error');
      return null;
    }

    const data = (await response.json()) as { status: string; error_message?: string };

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      getLogger().warn(
        {
          status: data.status,
          error: data.error_message,
          endpoint,
        },
        'Google Places API status error'
      );
      return null;
    }

    return data as T;
  } catch (error) {
    getLogger().error({ error, endpoint }, 'Google Places API request failed');
    return null;
  }
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

/**
 * Search for businesses by text query
 * Great for "find pizza near me" or "coffee shops in Oakland"
 */
export async function searchPlaces(
  query: string,
  options?: {
    location?: { lat: number; lng: number };
    radius?: number; // meters
    type?: string; // restaurant, cafe, etc.
    openNow?: boolean;
  }
): Promise<PlacesSearchResult[]> {
  const params: Record<string, string> = {
    query,
  };

  if (options?.location) {
    params.location = `${options.location.lat},${options.location.lng}`;
  }
  if (options?.radius) {
    params.radius = String(Math.min(options.radius, 50000));
  }
  if (options?.type) {
    params.type = options.type;
  }
  if (options?.openNow) {
    params.opennow = 'true';
  }

  const result = await placesFetch<{
    status: string;
    results: Array<{
      place_id: string;
      name: string;
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
      rating?: number;
      user_ratings_total?: number;
      price_level?: number;
      types: string[];
      opening_hours?: { open_now: boolean };
      photos?: Array<{ photo_reference: string }>;
    }>;
  }>('/textsearch', params);

  if (!result?.results) return [];

  getLogger().info({ query, count: result.results.length }, '📍 Google Places search completed');

  return result.results.map((place) => ({
    placeId: place.place_id,
    name: place.name,
    address: place.formatted_address,
    location: place.geometry.location,
    rating: place.rating,
    reviewCount: place.user_ratings_total,
    priceLevel: place.price_level,
    types: place.types,
    isOpen: place.opening_hours?.open_now,
    photos: place.photos
      ?.slice(0, 3)
      .map(
        (p) =>
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${getApiKey()}`
      ),
  }));
}

/**
 * Search for nearby businesses
 * Great for "nearest gas station" or "restaurants within 1 mile"
 */
export async function searchNearby(
  location: { lat: number; lng: number },
  options?: {
    keyword?: string;
    type?: string;
    radius?: number;
    openNow?: boolean;
    rankBy?: 'prominence' | 'distance';
  }
): Promise<PlacesSearchResult[]> {
  const params: Record<string, string> = {
    location: `${location.lat},${location.lng}`,
  };

  if (options?.rankBy === 'distance') {
    params.rankby = 'distance';
    // When using rankby=distance, must specify keyword, name, or type
    if (options?.keyword) params.keyword = options.keyword;
    if (options?.type) params.type = options.type;
  } else {
    params.radius = String(options?.radius || 5000);
    if (options?.keyword) params.keyword = options.keyword;
    if (options?.type) params.type = options.type;
  }

  if (options?.openNow) {
    params.opennow = 'true';
  }

  const result = await placesFetch<{
    status: string;
    results: Array<{
      place_id: string;
      name: string;
      vicinity: string;
      geometry: { location: { lat: number; lng: number } };
      rating?: number;
      user_ratings_total?: number;
      price_level?: number;
      types: string[];
      opening_hours?: { open_now: boolean };
    }>;
  }>('/nearbysearch', params);

  if (!result?.results) return [];

  return result.results.map((place) => ({
    placeId: place.place_id,
    name: place.name,
    address: place.vicinity,
    location: place.geometry.location,
    rating: place.rating,
    reviewCount: place.user_ratings_total,
    priceLevel: place.price_level,
    types: place.types,
    isOpen: place.opening_hours?.open_now,
  }));
}

/**
 * Find a specific business by name
 * Great for "get the phone number for Olive Garden on Main Street"
 */
export async function findBusiness(
  businessName: string,
  location?: string | { lat: number; lng: number }
): Promise<PlacesSearchResult | null> {
  let query = businessName;

  if (location) {
    if (typeof location === 'string') {
      query = `${businessName} ${location}`;
    }
  }

  const results = await searchPlaces(query, {
    location: typeof location === 'object' ? location : undefined,
  });

  if (results.length === 0) return null;

  // Get details for the first result to get phone number
  const details = await getPlaceDetails(results[0].placeId);
  return details || results[0];
}

// ============================================================================
// PLACE DETAILS
// ============================================================================

/**
 * Get detailed info about a place including phone number
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const fields = [
    'place_id',
    'name',
    'formatted_address',
    'formatted_phone_number',
    'international_phone_number',
    'website',
    'rating',
    'user_ratings_total',
    'price_level',
    'types',
    'opening_hours',
    'geometry',
    'business_status',
    'reviews',
    'utc_offset',
  ].join(',');

  const result = await placesFetch<{
    status: string;
    result: {
      place_id: string;
      name: string;
      formatted_address: string;
      formatted_phone_number?: string;
      international_phone_number?: string;
      website?: string;
      rating?: number;
      user_ratings_total?: number;
      price_level?: number;
      types: string[];
      geometry: { location: { lat: number; lng: number } };
      opening_hours?: {
        open_now: boolean;
        weekday_text: string[];
        periods: Array<{
          open: { day: number; time: string };
          close?: { day: number; time: string };
        }>;
      };
      business_status?: string;
      reviews?: Array<{
        author_name: string;
        rating: number;
        text: string;
        relative_time_description: string;
      }>;
      utc_offset?: number;
    };
  }>('/details', { place_id: placeId, fields });

  if (!result?.result) return null;

  const place = result.result;

  getLogger().info(
    {
      name: place.name,
      hasPhone: !!place.formatted_phone_number,
      businessStatus: place.business_status,
    },
    '📍 Got place details'
  );

  return {
    placeId: place.place_id,
    name: place.name,
    address: place.formatted_address,
    formattedAddress: place.formatted_address,
    phone: place.formatted_phone_number,
    phoneInternational: place.international_phone_number,
    formattedPhone: place.formatted_phone_number,
    website: place.website,
    rating: place.rating,
    reviewCount: place.user_ratings_total,
    priceLevel: place.price_level,
    types: place.types,
    location: place.geometry.location,
    businessStatus: place.business_status as PlaceDetails['businessStatus'],
    openingHours: place.opening_hours
      ? {
          openNow: place.opening_hours.open_now,
          weekdayText: place.opening_hours.weekday_text,
          periods: place.opening_hours.periods,
        }
      : undefined,
    isOpen: place.opening_hours?.open_now,
    hours: place.opening_hours?.weekday_text,
    reviews: place.reviews?.slice(0, 3).map((r) => ({
      authorName: r.author_name,
      rating: r.rating,
      text: r.text,
      relativeTime: r.relative_time_description,
    })),
    utcOffset: place.utc_offset,
  };
}

/**
 * Get just the phone number for a business
 */
export async function getBusinessPhone(
  businessName: string,
  location?: string
): Promise<{ phone: string; name: string; address: string } | null> {
  const business = await findBusiness(businessName, location);

  if (!business) {
    return null;
  }

  // If we don't have phone yet, get details
  if (!business.phone) {
    const details = await getPlaceDetails(business.placeId);
    if (details?.phone) {
      return {
        phone: details.phone,
        name: details.name,
        address: details.address,
      };
    }
  }

  if (business.phone) {
    return {
      phone: business.phone,
      name: business.name,
      address: business.address,
    };
  }

  return null;
}

// ============================================================================
// AUTOCOMPLETE
// ============================================================================

/**
 * Get autocomplete suggestions for business names
 */
export async function autocomplete(
  input: string,
  options?: {
    location?: { lat: number; lng: number };
    radius?: number;
    types?: string; // 'establishment', 'address', etc.
  }
): Promise<
  Array<{ placeId: string; description: string; mainText: string; secondaryText: string }>
> {
  const params: Record<string, string> = {
    input,
    types: options?.types || 'establishment',
  };

  if (options?.location) {
    params.location = `${options.location.lat},${options.location.lng}`;
    params.radius = String(options?.radius || 50000);
  }

  const result = await placesFetch<{
    status: string;
    predictions: Array<{
      place_id: string;
      description: string;
      structured_formatting: {
        main_text: string;
        secondary_text: string;
      };
    }>;
  }>('/autocomplete', params);

  if (!result?.predictions) return [];

  return result.predictions.map((p) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting.main_text,
    secondaryText: p.structured_formatting.secondary_text,
  }));
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format place for speech
 */
export function formatPlaceForSpeech(place: PlacesSearchResult | PlaceDetails): string {
  const parts = [place.name];

  if (place.rating) {
    parts.push(`${place.rating} stars`);
  }

  if (place.priceLevel !== undefined) {
    parts.push('$'.repeat(place.priceLevel + 1));
  }

  if (place.isOpen !== undefined) {
    parts.push(place.isOpen ? 'open now' : 'closed');
  }

  return parts.join(' - ');
}

/**
 * Format place with phone for Alex to call
 */
export function formatPlaceWithPhone(place: PlaceDetails): string {
  let result = `${place.name}`;

  if (place.phone) {
    result += ` - Phone: ${place.phone}`;
  }

  if (place.address) {
    result += ` - ${place.address}`;
  }

  if (place.isOpen !== undefined) {
    result += place.isOpen ? ' (Open now)' : ' (Closed)';
  }

  return result;
}

/**
 * Format hours for speech
 */
export function formatHoursForSpeech(place: PlaceDetails): string {
  if (!place.openingHours) {
    return 'Hours not available';
  }

  const status = place.openingHours.openNow ? 'Open now' : 'Closed now';

  // Get today's hours
  const today = new Date().getDay();
  const todayHours = place.openingHours.weekdayText?.[today === 0 ? 6 : today - 1];

  if (todayHours) {
    return `${status}. Today: ${todayHours}`;
  }

  return status;
}

// ============================================================================
// SERVICE STATUS
// ============================================================================

/**
 * Check if Google Places is configured
 */
export function isPlacesConfigured(): boolean {
  return !!getApiKey();
}

/**
 * Test the API connection
 */
export async function testConnection(): Promise<boolean> {
  if (!isPlacesConfigured()) {
    return false;
  }

  const results = await searchPlaces('Starbucks San Francisco', { radius: 5000 });
  return results.length > 0;
}

export default {
  searchPlaces,
  searchNearby,
  findBusiness,
  getPlaceDetails,
  getBusinessPhone,
  autocomplete,
  formatPlaceForSpeech,
  formatPlaceWithPhone,
  formatHoursForSpeech,
  isPlacesConfigured,
  testConnection,
};
