/**
 * Yelp Fusion API Service
 *
 * Provides restaurant search, details, reviews, and phone lookup.
 * Used by Alex for finding restaurants and getting contact info.
 *
 * API Docs: https://docs.developer.yelp.com/docs/fusion-intro
 *
 * Features:
 * - Business search (restaurants, services, etc.)
 * - Business details (hours, photos, attributes)
 * - Reviews and ratings
 * - Phone number lookup
 * - Autocomplete for suggestions
 */

import { getLogger } from '../utils/safe-logger.js';
import { getConfig } from '../config/environment.js';

const YELP_API_BASE = 'https://api.yelp.com/v3';

// ============================================================================
// TYPES
// ============================================================================

export interface YelpBusiness {
  id: string;
  alias: string;
  name: string;
  image_url?: string;
  is_closed: boolean;
  url: string;
  review_count: number;
  categories: Array<{ alias: string; title: string }>;
  rating: number;
  coordinates: { latitude: number; longitude: number };
  transactions: string[]; // ['pickup', 'delivery', 'restaurant_reservation']
  price?: string; // '$', '$$', '$$$', '$$$$'
  location: {
    address1: string;
    address2?: string;
    address3?: string;
    city: string;
    zip_code: string;
    country: string;
    state: string;
    display_address: string[];
  };
  phone: string;
  display_phone: string;
  distance?: number; // meters from search location
}

export interface YelpBusinessDetails extends YelpBusiness {
  photos: string[];
  hours?: Array<{
    open: Array<{
      is_overnight: boolean;
      start: string; // "1000" = 10:00 AM
      end: string;
      day: number; // 0 = Monday
    }>;
    hours_type: string;
    is_open_now: boolean;
  }>;
  special_hours?: Array<{
    date: string;
    is_closed: boolean;
    start?: string;
    end?: string;
  }>;
  messaging?: {
    url: string;
    use_case_text: string;
  };
}

export interface YelpReview {
  id: string;
  url: string;
  text: string;
  rating: number;
  time_created: string;
  user: {
    id: string;
    profile_url: string;
    image_url?: string;
    name: string;
  };
}

export interface YelpSearchParams {
  term?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  radius?: number; // meters, max 40000
  categories?: string; // comma-separated
  locale?: string;
  limit?: number; // max 50
  offset?: number;
  sort_by?: 'best_match' | 'rating' | 'review_count' | 'distance';
  price?: string; // '1', '2', '3', '4' or '1,2,3'
  open_now?: boolean;
  open_at?: number; // Unix timestamp
  attributes?: string; // 'hot_and_new', 'reservation', 'deals', etc.
}

// ============================================================================
// API HELPERS
// ============================================================================

function getApiKey(): string | null {
  const config = getConfig();
  return config.integrations.yelp || process.env.YELP_API_KEY || null;
}

async function yelpFetch<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<T | null> {
  const apiKey = getApiKey();

  if (!apiKey) {
    getLogger().debug('Yelp API key not configured');
    return null;
  }

  try {
    const url = new URL(`${YELP_API_BASE}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { code?: string; description?: string };
      };
      getLogger().warn(
        {
          status: response.status,
          error: errorData.error,
          endpoint,
        },
        'Yelp API error'
      );
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    getLogger().error({ error, endpoint }, 'Yelp API request failed');
    return null;
  }
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

/**
 * Search for businesses (restaurants, services, etc.)
 */
export async function searchBusinesses(params: YelpSearchParams): Promise<YelpBusiness[]> {
  const searchParams: Record<string, string | number | boolean> = {};

  if (params.term) searchParams.term = params.term;
  if (params.location) searchParams.location = params.location;
  if (params.latitude) searchParams.latitude = params.latitude;
  if (params.longitude) searchParams.longitude = params.longitude;
  if (params.radius) searchParams.radius = Math.min(params.radius, 40000);
  if (params.categories) searchParams.categories = params.categories;
  if (params.limit) searchParams.limit = Math.min(params.limit, 50);
  if (params.offset) searchParams.offset = params.offset;
  if (params.sort_by) searchParams.sort_by = params.sort_by;
  if (params.price) searchParams.price = params.price;
  if (params.open_now !== undefined) searchParams.open_now = params.open_now;
  if (params.open_at) searchParams.open_at = params.open_at;
  if (params.attributes) searchParams.attributes = params.attributes;

  const result = await yelpFetch<{ businesses: YelpBusiness[]; total: number }>(
    '/businesses/search',
    searchParams
  );

  if (!result) return [];

  getLogger().info(
    {
      term: params.term,
      location: params.location,
      resultsCount: result.businesses.length,
      totalAvailable: result.total,
    },
    '🍽️ Yelp search completed'
  );

  return result.businesses;
}

/**
 * Search specifically for restaurants
 */
export async function searchRestaurants(
  query: string,
  location: string,
  options?: {
    openNow?: boolean;
    price?: string;
    sortBy?: 'best_match' | 'rating' | 'review_count' | 'distance';
    limit?: number;
  }
): Promise<YelpBusiness[]> {
  return searchBusinesses({
    term: query,
    location,
    categories: 'restaurants,food',
    open_now: options?.openNow,
    price: options?.price,
    sort_by: options?.sortBy || 'best_match',
    limit: options?.limit || 10,
  });
}

/**
 * Search for businesses that take reservations
 */
export async function searchWithReservations(
  query: string,
  location: string,
  options?: { limit?: number }
): Promise<YelpBusiness[]> {
  const businesses = await searchBusinesses({
    term: query,
    location,
    categories: 'restaurants',
    attributes: 'reservation',
    limit: options?.limit || 10,
  });

  // Filter to only those with reservation transaction
  return businesses.filter((b) => b.transactions.includes('restaurant_reservation'));
}

// ============================================================================
// BUSINESS DETAILS
// ============================================================================

/**
 * Get detailed info about a specific business
 */
export async function getBusinessDetails(businessId: string): Promise<YelpBusinessDetails | null> {
  return yelpFetch<YelpBusinessDetails>(`/businesses/${businessId}`);
}

/**
 * Get business by phone number
 */
export async function getBusinessByPhone(phone: string): Promise<YelpBusiness | null> {
  // Format phone to E.164 if needed
  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.length === 10) {
    formattedPhone = `+1${formattedPhone}`;
  } else if (!formattedPhone.startsWith('+')) {
    formattedPhone = `+${formattedPhone}`;
  }

  const result = await yelpFetch<{ businesses: YelpBusiness[] }>('/businesses/search/phone', {
    phone: formattedPhone,
  });

  return result?.businesses?.[0] || null;
}

/**
 * Get business reviews
 */
export async function getBusinessReviews(
  businessId: string,
  options?: { locale?: string; limit?: number; offset?: number }
): Promise<YelpReview[]> {
  const result = await yelpFetch<{ reviews: YelpReview[]; total: number }>(
    `/businesses/${businessId}/reviews`,
    {
      locale: options?.locale || 'en_US',
      limit: options?.limit || 3,
      offset: options?.offset || 0,
    }
  );

  return result?.reviews || [];
}

// ============================================================================
// AUTOCOMPLETE
// ============================================================================

/**
 * Get autocomplete suggestions
 */
export async function getAutocomplete(
  text: string,
  location?: { latitude: number; longitude: number }
): Promise<{
  terms: Array<{ text: string }>;
  businesses: Array<{ id: string; name: string }>;
  categories: Array<{ alias: string; title: string }>;
}> {
  const params: Record<string, string | number> = { text };
  if (location) {
    params.latitude = location.latitude;
    params.longitude = location.longitude;
  }

  const result = await yelpFetch<{
    terms: Array<{ text: string }>;
    businesses: Array<{ id: string; name: string }>;
    categories: Array<{ alias: string; title: string }>;
  }>('/autocomplete', params);

  return result || { terms: [], businesses: [], categories: [] };
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format business hours for speech
 */
export function formatHoursForSpeech(business: YelpBusinessDetails): string {
  if (!business.hours?.[0]) {
    return 'Hours not available';
  }

  const hours = business.hours[0];
  const isOpen = hours.is_open_now;

  // Get today's hours
  const today = new Date().getDay();
  // Yelp uses Monday = 0, JS uses Sunday = 0
  const yelpDay = today === 0 ? 6 : today - 1;
  const todayHours = hours.open.filter((h) => h.day === yelpDay);

  if (todayHours.length === 0) {
    return isOpen ? 'Open now' : 'Closed today';
  }

  const formatTime = (time: string) => {
    const hour = parseInt(time.slice(0, 2));
    const minute = time.slice(2);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return minute === '00' ? `${displayHour} ${ampm}` : `${displayHour}:${minute} ${ampm}`;
  };

  const hoursStr = todayHours
    .map((h) => `${formatTime(h.start)} to ${formatTime(h.end)}`)
    .join(', ');

  return isOpen ? `Open now, today ${hoursStr}` : `Closed now, today ${hoursStr}`;
}

/**
 * Format business for speech
 */
export function formatBusinessForSpeech(business: YelpBusiness, includeDetails = false): string {
  const parts: string[] = [business.name];

  if (business.rating) {
    parts.push(`${business.rating} stars`);
  }

  if (business.review_count) {
    parts.push(`${business.review_count} reviews`);
  }

  if (business.price) {
    parts.push(business.price);
  }

  if (business.categories.length > 0) {
    parts.push(
      business.categories
        .slice(0, 2)
        .map((c) => c.title)
        .join(', ')
    );
  }

  if (includeDetails) {
    if (business.location.display_address.length > 0) {
      parts.push(`at ${business.location.display_address[0]}`);
    }

    if (business.transactions.includes('restaurant_reservation')) {
      parts.push('takes reservations');
    }
  }

  return parts.join(' - ');
}

/**
 * Format a review snippet for speech
 */
export function formatReviewForSpeech(review: YelpReview): string {
  // Get first ~100 chars of review, ending at a sentence or word boundary
  let { text } = review;
  if (text.length > 100) {
    const cutoff = text.lastIndexOf('.', 100);
    text = cutoff > 50 ? text.slice(0, cutoff + 1) : `${text.slice(0, 100).trim()}...`;
  }

  return `${review.user.name} says: "${text}" - ${review.rating} stars`;
}

// ============================================================================
// SERVICE STATUS
// ============================================================================

/**
 * Check if Yelp API is configured
 */
export function isYelpConfigured(): boolean {
  return !!getApiKey();
}

/**
 * Test the Yelp API connection
 */
export async function testConnection(): Promise<boolean> {
  if (!isYelpConfigured()) {
    return false;
  }

  // Try a simple search
  const result = await searchBusinesses({
    term: 'coffee',
    location: 'San Francisco, CA',
    limit: 1,
  });

  return result.length > 0;
}

export default {
  searchBusinesses,
  searchRestaurants,
  searchWithReservations,
  getBusinessDetails,
  getBusinessByPhone,
  getBusinessReviews,
  getAutocomplete,
  formatHoursForSpeech,
  formatBusinessForSpeech,
  formatReviewForSpeech,
  isYelpConfigured,
  testConnection,
};
