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
import { getCircuitBreaker, CircuitOpenError } from '../utils/circuit-breaker.js';
const YELP_API_BASE = 'https://api.yelp.com/v3';
// Circuit breaker for Yelp API
const yelpCircuitBreaker = getCircuitBreaker('yelp-api', {
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
    successThreshold: 2,
});
// ============================================================================
// API HELPERS
// ============================================================================
function getApiKey() {
    const config = getConfig();
    return config.integrations.yelp || process.env.YELP_API_KEY || null;
}
async function yelpFetch(endpoint, params) {
    const apiKey = getApiKey();
    if (!apiKey) {
        getLogger().debug('Yelp API key not configured');
        return null;
    }
    // Check circuit breaker first
    if (!yelpCircuitBreaker.canRequest()) {
        getLogger().debug('Yelp circuit breaker is open, skipping request');
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
        const response = await yelpCircuitBreaker.execute(async () => {
            const res = await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) {
                const errorData = (await res.json().catch(() => ({})));
                getLogger().warn({
                    status: res.status,
                    error: errorData.error,
                    endpoint,
                }, 'Yelp API error');
                throw new Error(`Yelp API error: ${res.status}`);
            }
            return res;
        });
        return (await response.json());
    }
    catch (error) {
        if (error instanceof CircuitOpenError) {
            getLogger().debug('Yelp circuit breaker opened');
            return null;
        }
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
export async function searchBusinesses(params) {
    const searchParams = {};
    if (params.term)
        searchParams.term = params.term;
    if (params.location)
        searchParams.location = params.location;
    if (params.latitude)
        searchParams.latitude = params.latitude;
    if (params.longitude)
        searchParams.longitude = params.longitude;
    if (params.radius)
        searchParams.radius = Math.min(params.radius, 40000);
    if (params.categories)
        searchParams.categories = params.categories;
    if (params.limit)
        searchParams.limit = Math.min(params.limit, 50);
    if (params.offset)
        searchParams.offset = params.offset;
    if (params.sort_by)
        searchParams.sort_by = params.sort_by;
    if (params.price)
        searchParams.price = params.price;
    if (params.open_now !== undefined)
        searchParams.open_now = params.open_now;
    if (params.open_at)
        searchParams.open_at = params.open_at;
    if (params.attributes)
        searchParams.attributes = params.attributes;
    const result = await yelpFetch('/businesses/search', searchParams);
    if (!result)
        return [];
    getLogger().info({
        term: params.term,
        location: params.location,
        resultsCount: result.businesses.length,
        totalAvailable: result.total,
    }, '🍽️ Yelp search completed');
    return result.businesses;
}
/**
 * Search specifically for restaurants
 */
export async function searchRestaurants(query, location, options) {
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
export async function searchWithReservations(query, location, options) {
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
export async function getBusinessDetails(businessId) {
    return yelpFetch(`/businesses/${businessId}`);
}
/**
 * Get business by phone number
 */
export async function getBusinessByPhone(phone) {
    // Format phone to E.164 if needed
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
        formattedPhone = `+1${formattedPhone}`;
    }
    else if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+${formattedPhone}`;
    }
    const result = await yelpFetch('/businesses/search/phone', {
        phone: formattedPhone,
    });
    return result?.businesses?.[0] || null;
}
/**
 * Get business reviews
 */
export async function getBusinessReviews(businessId, options) {
    const result = await yelpFetch(`/businesses/${businessId}/reviews`, {
        locale: options?.locale || 'en_US',
        limit: options?.limit || 3,
        offset: options?.offset || 0,
    });
    return result?.reviews || [];
}
// ============================================================================
// AUTOCOMPLETE
// ============================================================================
/**
 * Get autocomplete suggestions
 */
export async function getAutocomplete(text, location) {
    const params = { text };
    if (location) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
    }
    const result = await yelpFetch('/autocomplete', params);
    return result || { terms: [], businesses: [], categories: [] };
}
// ============================================================================
// FORMATTING HELPERS
// ============================================================================
/**
 * Format business hours for speech
 */
export function formatHoursForSpeech(business) {
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
    const formatTime = (time) => {
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
export function formatBusinessForSpeech(business, includeDetails = false) {
    const parts = [business.name];
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
        parts.push(business.categories
            .slice(0, 2)
            .map((c) => c.title)
            .join(', '));
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
export function formatReviewForSpeech(review) {
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
export function isYelpConfigured() {
    return !!getApiKey();
}
/**
 * Test the Yelp API connection
 */
export async function testConnection() {
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
//# sourceMappingURL=yelp.js.map