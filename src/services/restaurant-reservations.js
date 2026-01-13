/**
 * Restaurant Reservation Service
 *
 * Integrates with multiple reservation platforms:
 * - OpenTable API (most restaurants)
 * - Resy API (trendy/upscale restaurants)
 * - Yelp Reservations (fallback)
 * - Direct phone call (fallback when APIs unavailable)
 *
 * This allows Alex to book tables instantly without calling when possible.
 */
import { getLogger } from '../utils/safe-logger.js';
// API Keys
const OPENTABLE_API_KEY = process.env.OPENTABLE_API_KEY || '';
const RESY_API_KEY = process.env.RESY_API_KEY || '';
const YELP_API_KEY = process.env.YELP_API_KEY || '';
// ============================================================================
// OPENTABLE INTEGRATION
// ============================================================================
/**
 * Search restaurants on OpenTable
 */
async function searchOpenTable(query, location, date, time, partySize) {
    if (!OPENTABLE_API_KEY) {
        getLogger().debug('OpenTable API not configured');
        return [];
    }
    try {
        // OpenTable API endpoint (simplified - actual API may differ)
        const params = new URLSearchParams({
            term: query,
            location,
            covers: partySize.toString(),
            datetime: `${date}T${time}:00`,
        });
        const response = await fetch(`https://platform.opentable.com/v2/restaurants?${params}`, {
            headers: {
                Authorization: `Bearer ${OPENTABLE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            getLogger().warn({ status: response.status }, 'OpenTable search failed');
            return [];
        }
        const data = (await response.json());
        return (data.restaurants || []).map((r) => ({
            id: `opentable_${r.id}`,
            name: r.name,
            address: r.address.street,
            city: r.address.city,
            cuisine: [r.cuisine],
            priceRange: '$'.repeat(r.price || 2),
            rating: r.rating,
            phone: r.phone,
            imageUrl: r.photos?.[0]?.url,
            reservationProvider: 'opentable',
            externalId: r.id,
        }));
    }
    catch (error) {
        getLogger().error({ error }, 'OpenTable search error');
        return [];
    }
}
/**
 * Get available time slots from OpenTable
 */
async function getOpenTableAvailability(restaurantId, date, partySize) {
    if (!OPENTABLE_API_KEY)
        return [];
    try {
        const response = await fetch(`https://platform.opentable.com/v2/restaurants/${restaurantId}/availability?date=${date}&covers=${partySize}`, {
            headers: {
                Authorization: `Bearer ${OPENTABLE_API_KEY}`,
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
            return [];
        const data = (await response.json());
        return (data.timeslots || []).map((slot) => ({
            time: slot.time,
            partySize,
            tableType: slot.type,
        }));
    }
    catch (error) {
        getLogger().error({ error }, 'OpenTable availability error');
        return [];
    }
}
/**
 * Make a reservation via OpenTable
 */
async function bookOpenTable(request) {
    if (!OPENTABLE_API_KEY) {
        return {
            success: false,
            message: 'OpenTable integration not configured',
            provider: 'opentable',
            needsPhoneCall: true,
        };
    }
    try {
        const response = await fetch(`https://platform.opentable.com/v2/reservations`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENTABLE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                restaurant_id: request.restaurantId,
                datetime: `${request.date}T${request.time}:00`,
                covers: request.partySize,
                first_name: request.guestName.split(' ')[0],
                last_name: request.guestName.split(' ').slice(1).join(' ') || 'Guest',
                phone: request.guestPhone,
                email: request.guestEmail,
                special_requests: request.specialRequests,
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
            const data = (await response.json());
            return {
                success: true,
                confirmationNumber: data.confirmation_number,
                reservedTime: data.datetime,
                message: `Reservation confirmed! Confirmation #${data.confirmation_number}`,
                provider: 'opentable',
            };
        }
        else {
            const errorData = (await response.json());
            return {
                success: false,
                message: errorData.message || 'Unable to complete reservation',
                provider: 'opentable',
                needsPhoneCall: true,
            };
        }
    }
    catch (error) {
        getLogger().error({ error }, 'OpenTable booking error');
        return {
            success: false,
            message: 'Connection error - please try again',
            provider: 'opentable',
            needsPhoneCall: true,
        };
    }
}
// ============================================================================
// RESY INTEGRATION
// ============================================================================
/**
 * Search restaurants on Resy
 */
async function searchResy(query, location, date, partySize) {
    if (!RESY_API_KEY) {
        getLogger().debug('Resy API not configured');
        return [];
    }
    try {
        const params = new URLSearchParams({
            query,
            geo: location,
            day: date,
            party_size: partySize.toString(),
        });
        const response = await fetch(`https://api.resy.com/4/find?${params}`, {
            headers: {
                Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
            return [];
        const data = (await response.json());
        return (data.results?.venues || []).map((v) => ({
            id: `resy_${v.id.resy}`,
            name: v.name,
            address: v.location.address,
            city: v.location.locality,
            cuisine: [v.type],
            priceRange: '$'.repeat(v.price_range || 2),
            rating: v.rating,
            phone: v.contact?.phone,
            imageUrl: v.images?.[0],
            reservationProvider: 'resy',
            externalId: v.id.resy,
        }));
    }
    catch (error) {
        getLogger().error({ error }, 'Resy search error');
        return [];
    }
}
/**
 * Get available slots from Resy
 */
async function getResyAvailability(venueId, date, partySize) {
    if (!RESY_API_KEY)
        return [];
    try {
        const response = await fetch(`https://api.resy.com/4/find?venue_id=${venueId}&day=${date}&party_size=${partySize}`, {
            headers: {
                Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
            return [];
        const data = (await response.json());
        const venue = data.results?.venues?.[0];
        return (venue?.slots || []).map((slot) => ({
            time: slot.date.start,
            partySize,
            tableType: slot.config?.type,
        }));
    }
    catch (error) {
        getLogger().error({ error }, 'Resy availability error');
        return [];
    }
}
/**
 * Book via Resy
 */
async function bookResy(request) {
    if (!RESY_API_KEY) {
        return {
            success: false,
            message: 'Resy integration not configured',
            provider: 'resy',
            needsPhoneCall: true,
        };
    }
    try {
        // Resy requires a booking token from availability check
        // This is simplified - actual implementation needs more steps
        const response = await fetch(`https://api.resy.com/3/book`, {
            method: 'POST',
            headers: {
                Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                venue_id: request.restaurantId,
                day: request.date,
                party_size: request.partySize,
                first_name: request.guestName.split(' ')[0],
                last_name: request.guestName.split(' ').slice(1).join(' ') || 'Guest',
                phone_number: request.guestPhone,
                email: request.guestEmail,
                special_request: request.specialRequests,
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (response.ok) {
            const data = (await response.json());
            return {
                success: true,
                confirmationNumber: data.resy_token,
                reservedTime: `${data.reservation?.day} ${data.reservation?.time_slot}`,
                message: `Booked via Resy! Confirmation: ${data.resy_token}`,
                provider: 'resy',
            };
        }
        else {
            return {
                success: false,
                message: 'Unable to complete Resy reservation',
                provider: 'resy',
                needsPhoneCall: true,
            };
        }
    }
    catch (error) {
        getLogger().error({ error }, 'Resy booking error');
        return {
            success: false,
            message: 'Resy connection error',
            provider: 'resy',
            needsPhoneCall: true,
        };
    }
}
// ============================================================================
// YELP INTEGRATION (Search + Reservation if available)
// ============================================================================
/**
 * Search restaurants on Yelp (good for finding phone numbers)
 */
async function searchYelp(query, location) {
    if (!YELP_API_KEY) {
        getLogger().debug('Yelp API not configured');
        return [];
    }
    try {
        const params = new URLSearchParams({
            term: query,
            location,
            categories: 'restaurants',
            limit: '10',
        });
        const response = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
            headers: {
                Authorization: `Bearer ${YELP_API_KEY}`,
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
            return [];
        const data = (await response.json());
        return (data.businesses || []).map((b) => ({
            id: `yelp_${b.id}`,
            name: b.name,
            address: b.location.address1,
            city: b.location.city,
            cuisine: b.categories.map((c) => c.title),
            priceRange: (b.price || '$$'),
            rating: b.rating,
            phone: b.phone,
            imageUrl: b.image_url,
            reservationProvider: b.transactions?.includes('restaurant_reservation')
                ? 'yelp'
                : 'phone_only',
            externalId: b.id,
        }));
    }
    catch (error) {
        getLogger().error({ error }, 'Yelp search error');
        return [];
    }
}
// ============================================================================
// UNIFIED RESERVATION SERVICE
// ============================================================================
/**
 * Search for restaurants across all providers
 */
export async function searchRestaurants(query, location, date, time, partySize) {
    getLogger().info({ query, location, date, partySize }, '🍽️ Searching restaurants');
    // Search all providers in parallel
    const [openTableResults, resyResults, yelpResults] = await Promise.all([
        searchOpenTable(query, location, date, time, partySize),
        searchResy(query, location, date, partySize),
        searchYelp(query, location),
    ]);
    // Combine and deduplicate by name
    const allResults = [...openTableResults, ...resyResults, ...yelpResults];
    const uniqueByName = new Map();
    for (const result of allResults) {
        const key = result.name.toLowerCase();
        const existing = uniqueByName.get(key);
        // Prefer results with online reservations over phone-only
        if (!existing ||
            (existing.reservationProvider === 'phone_only' && result.reservationProvider !== 'phone_only')) {
            uniqueByName.set(key, result);
        }
    }
    const results = Array.from(uniqueByName.values());
    getLogger().info({ count: results.length }, 'Restaurant search complete');
    return results;
}
/**
 * Get available time slots for a restaurant
 */
export async function getAvailability(restaurant, date, partySize) {
    if (!restaurant.externalId)
        return [];
    switch (restaurant.reservationProvider) {
        case 'opentable':
            return getOpenTableAvailability(restaurant.externalId, date, partySize);
        case 'resy':
            return getResyAvailability(restaurant.externalId, date, partySize);
        default:
            return [];
    }
}
/**
 * Book a reservation at a restaurant
 */
export async function bookReservation(restaurant, request) {
    if (!restaurant.externalId) {
        return {
            success: false,
            message: `${restaurant.name} doesn't support online reservations. I can call them instead!`,
            provider: 'none',
            needsPhoneCall: true,
        };
    }
    const fullRequest = {
        ...request,
        restaurantId: restaurant.externalId,
        provider: restaurant.reservationProvider,
    };
    getLogger().info({
        restaurant: restaurant.name,
        provider: restaurant.reservationProvider,
        date: request.date,
        time: request.time,
        partySize: request.partySize,
    }, '🍽️ Booking reservation');
    switch (restaurant.reservationProvider) {
        case 'opentable':
            return bookOpenTable(fullRequest);
        case 'resy':
            return bookResy(fullRequest);
        default:
            return {
                success: false,
                message: `${restaurant.name} requires a phone call to book. Want me to call them?`,
                provider: restaurant.reservationProvider,
                needsPhoneCall: true,
            };
    }
}
/**
 * Quick check if any reservation services are configured
 */
export function isReservationServiceConfigured() {
    return !!(OPENTABLE_API_KEY || RESY_API_KEY || YELP_API_KEY);
}
/**
 * Format restaurant for speech
 */
export function formatRestaurantForSpeech(restaurant) {
    const parts = [restaurant.name];
    if (restaurant.cuisine.length > 0) {
        parts.push(`(${restaurant.cuisine[0]})`);
    }
    if (restaurant.rating) {
        parts.push(`- ${restaurant.rating} stars`);
    }
    if (restaurant.priceRange) {
        parts.push(`- ${restaurant.priceRange}`);
    }
    const canBook = restaurant.reservationProvider !== 'phone_only';
    parts.push(canBook ? '- can book online!' : '- requires a call');
    return parts.join(' ');
}
/**
 * Format available slots for speech
 */
export function formatSlotsForSpeech(slots) {
    if (slots.length === 0) {
        return 'No available slots found for that date.';
    }
    const timeStrings = slots.slice(0, 5).map((slot) => {
        const time = new Date(slot.time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });
        return slot.tableType ? `${time} (${slot.tableType})` : time;
    });
    return `Available times: ${timeStrings.join(', ')}${slots.length > 5 ? `, and ${slots.length - 5} more` : ''}`;
}
export default {
    searchRestaurants,
    getAvailability,
    bookReservation,
    isReservationServiceConfigured,
    formatRestaurantForSpeech,
    formatSlotsForSpeech,
};
//# sourceMappingURL=restaurant-reservations.js.map