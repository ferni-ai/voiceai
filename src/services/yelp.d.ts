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
export interface YelpBusiness {
    id: string;
    alias: string;
    name: string;
    image_url?: string;
    is_closed: boolean;
    url: string;
    review_count: number;
    categories: Array<{
        alias: string;
        title: string;
    }>;
    rating: number;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    transactions: string[];
    price?: string;
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
    distance?: number;
}
export interface YelpBusinessDetails extends YelpBusiness {
    photos: string[];
    hours?: Array<{
        open: Array<{
            is_overnight: boolean;
            start: string;
            end: string;
            day: number;
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
    radius?: number;
    categories?: string;
    locale?: string;
    limit?: number;
    offset?: number;
    sort_by?: 'best_match' | 'rating' | 'review_count' | 'distance';
    price?: string;
    open_now?: boolean;
    open_at?: number;
    attributes?: string;
}
/**
 * Search for businesses (restaurants, services, etc.)
 */
export declare function searchBusinesses(params: YelpSearchParams): Promise<YelpBusiness[]>;
/**
 * Search specifically for restaurants
 */
export declare function searchRestaurants(query: string, location: string, options?: {
    openNow?: boolean;
    price?: string;
    sortBy?: 'best_match' | 'rating' | 'review_count' | 'distance';
    limit?: number;
}): Promise<YelpBusiness[]>;
/**
 * Search for businesses that take reservations
 */
export declare function searchWithReservations(query: string, location: string, options?: {
    limit?: number;
}): Promise<YelpBusiness[]>;
/**
 * Get detailed info about a specific business
 */
export declare function getBusinessDetails(businessId: string): Promise<YelpBusinessDetails | null>;
/**
 * Get business by phone number
 */
export declare function getBusinessByPhone(phone: string): Promise<YelpBusiness | null>;
/**
 * Get business reviews
 */
export declare function getBusinessReviews(businessId: string, options?: {
    locale?: string;
    limit?: number;
    offset?: number;
}): Promise<YelpReview[]>;
/**
 * Get autocomplete suggestions
 */
export declare function getAutocomplete(text: string, location?: {
    latitude: number;
    longitude: number;
}): Promise<{
    terms: Array<{
        text: string;
    }>;
    businesses: Array<{
        id: string;
        name: string;
    }>;
    categories: Array<{
        alias: string;
        title: string;
    }>;
}>;
/**
 * Format business hours for speech
 */
export declare function formatHoursForSpeech(business: YelpBusinessDetails): string;
/**
 * Format business for speech
 */
export declare function formatBusinessForSpeech(business: YelpBusiness, includeDetails?: boolean): string;
/**
 * Format a review snippet for speech
 */
export declare function formatReviewForSpeech(review: YelpReview): string;
/**
 * Check if Yelp API is configured
 */
export declare function isYelpConfigured(): boolean;
/**
 * Test the Yelp API connection
 */
export declare function testConnection(): Promise<boolean>;
declare const _default: {
    searchBusinesses: typeof searchBusinesses;
    searchRestaurants: typeof searchRestaurants;
    searchWithReservations: typeof searchWithReservations;
    getBusinessDetails: typeof getBusinessDetails;
    getBusinessByPhone: typeof getBusinessByPhone;
    getBusinessReviews: typeof getBusinessReviews;
    getAutocomplete: typeof getAutocomplete;
    formatHoursForSpeech: typeof formatHoursForSpeech;
    formatBusinessForSpeech: typeof formatBusinessForSpeech;
    formatReviewForSpeech: typeof formatReviewForSpeech;
    isYelpConfigured: typeof isYelpConfigured;
    testConnection: typeof testConnection;
};
export default _default;
//# sourceMappingURL=yelp.d.ts.map