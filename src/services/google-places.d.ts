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
    priceLevel?: number;
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
            open: {
                day: number;
                time: string;
            };
            close?: {
                day: number;
                time: string;
            };
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
    url: string;
}
export interface RestaurantSearchOptions {
    query?: string;
    location?: string;
    radius?: number;
    type?: 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'meal_delivery' | 'meal_takeaway';
    minPrice?: number;
    maxPrice?: number;
    openNow?: boolean;
}
/**
 * Search for restaurants using Google Places API (New) - Text Search
 */
export declare function searchRestaurants(options: RestaurantSearchOptions): Promise<PlaceSearchResult[]>;
/**
 * Get detailed information about a place using Places API (New)
 */
export declare function getPlaceDetails(placeId: string): Promise<PlaceDetails | null>;
/**
 * Get a photo URL for a place
 */
export declare function getPhotoUrl(photoReference: string, maxWidth?: number): string;
/**
 * Find nearby restaurants using Places API (New) - Nearby Search
 */
export declare function findNearbyRestaurants(lat: number, lng: number, radius?: number, keyword?: string): Promise<PlaceSearchResult[]>;
/**
 * Format price level for speech
 */
export declare function formatPriceLevel(level?: number): string;
/**
 * Format rating for speech
 */
export declare function formatRating(rating?: number, totalRatings?: number): string;
/**
 * Format restaurant for speech
 */
export declare function formatRestaurantForSpeech(place: PlaceSearchResult | PlaceDetails): string;
/**
 * Format multiple restaurants for speech
 */
export declare function formatRestaurantListForSpeech(places: PlaceSearchResult[], limit?: number): string;
/**
 * Check if Google Places API is configured
 */
export declare function isGooglePlacesConfigured(): boolean;
declare const _default: {
    searchRestaurants: typeof searchRestaurants;
    getPlaceDetails: typeof getPlaceDetails;
    getPhotoUrl: typeof getPhotoUrl;
    findNearbyRestaurants: typeof findNearbyRestaurants;
    formatPriceLevel: typeof formatPriceLevel;
    formatRating: typeof formatRating;
    formatRestaurantForSpeech: typeof formatRestaurantForSpeech;
    formatRestaurantListForSpeech: typeof formatRestaurantListForSpeech;
    isGooglePlacesConfigured: typeof isGooglePlacesConfigured;
};
export default _default;
//# sourceMappingURL=google-places.d.ts.map