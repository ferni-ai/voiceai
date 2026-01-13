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
export interface RestaurantSearchResult {
    id: string;
    name: string;
    address: string;
    city: string;
    cuisine: string[];
    priceRange: '$' | '$$' | '$$$' | '$$$$';
    rating?: number;
    phone?: string;
    imageUrl?: string;
    reservationProvider: 'opentable' | 'resy' | 'yelp' | 'phone_only';
    externalId?: string;
}
export interface AvailableSlot {
    time: string;
    partySize: number;
    tableType?: string;
}
export interface ReservationRequest {
    restaurantId: string;
    provider: 'opentable' | 'resy' | 'yelp';
    date: string;
    time: string;
    partySize: number;
    guestName: string;
    guestPhone: string;
    guestEmail?: string;
    specialRequests?: string;
}
export interface ReservationResult {
    success: boolean;
    confirmationNumber?: string;
    reservedTime?: string;
    message: string;
    provider: string;
    needsPhoneCall?: boolean;
}
/**
 * Search for restaurants across all providers
 */
export declare function searchRestaurants(query: string, location: string, date: string, time: string, partySize: number): Promise<RestaurantSearchResult[]>;
/**
 * Get available time slots for a restaurant
 */
export declare function getAvailability(restaurant: RestaurantSearchResult, date: string, partySize: number): Promise<AvailableSlot[]>;
/**
 * Book a reservation at a restaurant
 */
export declare function bookReservation(restaurant: RestaurantSearchResult, request: Omit<ReservationRequest, 'restaurantId' | 'provider'>): Promise<ReservationResult>;
/**
 * Quick check if any reservation services are configured
 */
export declare function isReservationServiceConfigured(): boolean;
/**
 * Format restaurant for speech
 */
export declare function formatRestaurantForSpeech(restaurant: RestaurantSearchResult): string;
/**
 * Format available slots for speech
 */
export declare function formatSlotsForSpeech(slots: AvailableSlot[]): string;
declare const _default: {
    searchRestaurants: typeof searchRestaurants;
    getAvailability: typeof getAvailability;
    bookReservation: typeof bookReservation;
    isReservationServiceConfigured: typeof isReservationServiceConfigured;
    formatRestaurantForSpeech: typeof formatRestaurantForSpeech;
    formatSlotsForSpeech: typeof formatSlotsForSpeech;
};
export default _default;
//# sourceMappingURL=restaurant-reservations.d.ts.map