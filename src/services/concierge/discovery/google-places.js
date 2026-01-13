/**
 * Google Places Discovery
 *
 * Discovers businesses using Google Places API for contact information.
 * This is the first step in the concierge flow - finding who to call.
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'concierge-discovery' });
// Map domains to Google Places types
const DOMAIN_TO_PLACE_TYPES = {
    hotel: ['lodging', 'hotel'],
    restaurant: ['restaurant', 'cafe', 'bar'],
    healthcare: ['doctor', 'dentist', 'hospital', 'health', 'physiotherapist'],
    local_service: ['plumber', 'electrician', 'locksmith', 'moving_company', 'painter'],
    airline: ['airport', 'travel_agency'],
    car_rental: ['car_rental'],
    insurance: ['insurance_agency'],
    utility: ['local_government_office'],
    government: ['local_government_office', 'post_office', 'courthouse'],
    other: ['point_of_interest'],
};
// Domain-specific search terms for better results
const DOMAIN_SEARCH_TERMS = {
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
/**
 * Check if Google Places API is configured
 */
export function isGooglePlacesConfigured() {
    return !!process.env.GOOGLE_API_KEY;
}
/**
 * Discover businesses matching the criteria
 */
export async function discoverBusinesses(options) {
    const { domain, location, radius = 10000, keyword, limit = 5, minRating, priceLevel, openNow, } = options;
    log.info({ domain, location, limit }, 'Discovering businesses');
    // Check if API is configured
    if (!isGooglePlacesConfigured()) {
        log.warn('Google Places API not configured, returning mock data');
        return getMockBusinesses(domain, location, limit);
    }
    const apiKey = process.env.GOOGLE_API_KEY;
    try {
        // First, geocode the location to get coordinates
        const coords = await geocodeLocation(location, apiKey);
        if (!coords) {
            log.warn({ location }, 'Could not geocode location');
            return getMockBusinesses(domain, location, limit);
        }
        // Build the Places API request
        const placeTypes = DOMAIN_TO_PLACE_TYPES[domain] || ['point_of_interest'];
        const searchTerm = keyword || DOMAIN_SEARCH_TERMS[domain];
        // Use Text Search for better results with natural language
        const textQuery = searchTerm ? `${searchTerm} in ${location}` : `${domain} in ${location}`;
        const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
        searchUrl.searchParams.set('query', textQuery);
        searchUrl.searchParams.set('location', `${coords.lat},${coords.lng}`);
        searchUrl.searchParams.set('radius', radius.toString());
        searchUrl.searchParams.set('key', apiKey);
        if (openNow) {
            searchUrl.searchParams.set('opennow', 'true');
        }
        const response = await fetch(searchUrl.toString());
        const data = await response.json();
        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            log.error({ status: data.status, error: data.error_message }, 'Places API error');
            return getMockBusinesses(domain, location, limit);
        }
        // Transform results
        let businesses = (data.results || []).map((place) => ({
            placeId: place.place_id,
            name: place.name,
            address: place.formatted_address,
            rating: place.rating,
            userRatingsTotal: place.user_ratings_total,
            priceLevel: place.price_level,
            types: place.types || [],
            openNow: place.opening_hours?.open_now,
            location: place.geometry?.location || { lat: 0, lng: 0 },
        }));
        // Filter by rating if specified
        if (minRating) {
            businesses = businesses.filter((b) => (b.rating || 0) >= minRating);
        }
        // Filter by price level if specified
        if (priceLevel && priceLevel.length > 0) {
            businesses = businesses.filter((b) => b.priceLevel && priceLevel.includes(b.priceLevel));
        }
        // Sort by rating (descending) then by number of reviews
        businesses.sort((a, b) => {
            const ratingDiff = (b.rating || 0) - (a.rating || 0);
            if (Math.abs(ratingDiff) > 0.2)
                return ratingDiff;
            return (b.userRatingsTotal || 0) - (a.userRatingsTotal || 0);
        });
        // Limit results
        businesses = businesses.slice(0, limit);
        // Get phone numbers for each business (requires Place Details API)
        const enrichedBusinesses = await Promise.all(businesses.map((biz) => enrichBusinessDetails(biz, apiKey)));
        // Filter out businesses without phone numbers (we can't call them)
        const contactableBusinesses = enrichedBusinesses.filter((b) => b.phone || b.website);
        log.info({ domain, location, found: contactableBusinesses.length }, 'Business discovery complete');
        return contactableBusinesses;
    }
    catch (error) {
        log.error({ error: String(error), domain, location }, 'Failed to discover businesses');
        return getMockBusinesses(domain, location, limit);
    }
}
/**
 * Geocode a location string to coordinates
 */
async function geocodeLocation(location, apiKey) {
    try {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('address', location);
        url.searchParams.set('key', apiKey);
        const response = await fetch(url.toString());
        const data = await response.json();
        if (data.status === 'OK' && data.results.length > 0) {
            return data.results[0].geometry.location;
        }
        return null;
    }
    catch (error) {
        log.error({ error: String(error), location }, 'Geocoding failed');
        return null;
    }
}
/**
 * Enrich a business with phone number and website from Place Details
 */
async function enrichBusinessDetails(business, apiKey) {
    try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        url.searchParams.set('place_id', business.placeId);
        url.searchParams.set('fields', 'formatted_phone_number,website,opening_hours');
        url.searchParams.set('key', apiKey);
        const response = await fetch(url.toString());
        const data = await response.json();
        if (data.status === 'OK' && data.result) {
            return {
                ...business,
                phone: data.result.formatted_phone_number,
                website: data.result.website,
                businessHours: data.result.opening_hours?.weekday_text,
            };
        }
        return business;
    }
    catch (error) {
        log.warn({ error: String(error), placeId: business.placeId }, 'Failed to enrich business');
        return business;
    }
}
/**
 * Get mock businesses for development/testing
 */
function getMockBusinesses(domain, location, limit) {
    const mockData = {
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
//# sourceMappingURL=google-places.js.map