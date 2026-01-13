/**
 * Travel Search & Planning Tool
 *
 * Search for flights, hotels, and plan trips.
 *
 * Features:
 * - Flight search
 * - Hotel search
 * - Trip planning
 * - Price tracking (future)
 *
 * Note: In production, this would integrate with:
 * - Google Flights API / Amadeus / Skyscanner
 * - Booking.com / Hotels.com API
 * - Google Maps for destinations
 */
import { llm } from '@livekit/agents';
export type TripType = 'roundtrip' | 'oneway' | 'multicity';
export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';
export interface FlightSearch {
    id: string;
    userId: string;
    origin: string;
    destination: string;
    departureDate: Date;
    returnDate?: Date;
    tripType: TripType;
    passengers: number;
    cabinClass: CabinClass;
    results?: FlightResult[];
    createdAt: Date;
}
export interface FlightResult {
    id: string;
    airline: string;
    price: number;
    departureTime: string;
    arrivalTime: string;
    duration: string;
    stops: number;
    bookingUrl?: string;
}
export interface HotelSearch {
    id: string;
    userId: string;
    destination: string;
    checkIn: Date;
    checkOut: Date;
    guests: number;
    rooms: number;
    results?: HotelResult[];
    createdAt: Date;
}
export interface HotelResult {
    id: string;
    name: string;
    rating: number;
    pricePerNight: number;
    totalPrice: number;
    amenities: string[];
    bookingUrl?: string;
}
export interface SavedTrip {
    id: string;
    userId: string;
    name: string;
    destination: string;
    startDate: Date;
    endDate: Date;
    flight?: FlightResult;
    hotel?: HotelResult;
    notes?: string;
    totalBudget?: number;
    createdAt: Date;
}
/**
 * Check if real travel APIs are configured
 */
export declare function isTravelApiConfigured(): {
    flights: boolean;
    hotels: boolean;
};
export declare function createTravelTools(): {
    searchFlights: llm.FunctionTool<{
        origin: string;
        destination: string;
        departureDate: string;
        passengers: number;
        cabinClass: "first" | "business" | "economy" | "premium_economy";
        returnDate?: string | undefined;
    }, unknown, string>;
    searchHotels: llm.FunctionTool<{
        destination: string;
        checkIn: string;
        checkOut: string;
        guests: number;
        rooms: number;
    }, unknown, string>;
    planTrip: llm.FunctionTool<{
        name: string;
        destination: string;
        startDate: string;
        endDate: string;
        budget?: number | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    getSavedTrips: llm.FunctionTool<Record<string, never>, unknown, string>;
    getTripSuggestions: llm.FunctionTool<{
        type: "adventure" | "budget" | "city" | "relaxation" | "beach" | "luxury";
        budget: "moderate" | "budget" | "luxury";
    }, unknown, string>;
    getFlightPrice: llm.FunctionTool<{
        origin: string;
        destination: string;
        when: string;
    }, unknown, string>;
};
export default createTravelTools;
//# sourceMappingURL=travel.d.ts.map