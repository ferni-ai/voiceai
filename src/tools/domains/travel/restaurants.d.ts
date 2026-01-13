/**
 * Restaurant Search & Reservation Tools
 *
 * Find restaurants, read reviews, and make reservations.
 *
 * APIs:
 * - Google Places API (search, details, reviews)
 * - OpenTable/Resy (reservations) - future integration
 *
 * @module tools/restaurants
 */
import { llm } from '@livekit/agents';
interface SearchParams {
    query?: string;
    location: string;
    cuisine?: string;
    priceLevel?: number;
    openNow?: boolean;
    sortBy?: 'rating' | 'distance' | 'review_count';
    limit?: number;
}
export declare function searchRestaurants(params: SearchParams): Promise<string>;
/**
 * Generate a reservation request message
 * Since we don't have direct API access to OpenTable/Resy,
 * we help users make reservations by providing the info they need
 */
export declare function getReservationHelp(restaurantName: string, partySize: number, date: string, time: string): string;
export declare function createRestaurantTools(): {
    searchRestaurants: llm.FunctionTool<{
        location: string;
        cuisine?: string | undefined;
        priceLevel?: number | undefined;
        openNow?: boolean | undefined;
        query?: string | undefined;
    }, unknown, string>;
    makeReservation: llm.FunctionTool<{
        restaurantName: string;
        partySize: number;
        date: string;
        time: string;
    }, unknown, string>;
    suggestRestaurant: llm.FunctionTool<{
        location: string;
        occasion?: "celebration" | "family" | "casual" | "quick" | "comfort" | "adventurous" | "romantic" | "healthy" | undefined;
        preferences?: string | undefined;
    }, unknown, string>;
};
export default createRestaurantTools;
//# sourceMappingURL=restaurants.d.ts.map