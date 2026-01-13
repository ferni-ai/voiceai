/**
 * Uber API Client
 *
 * Integration with Uber for ride requests.
 *
 * @module services/integrations/uber
 */
import type { ApiResponse } from '../types.js';
export interface UberProduct {
    productId: string;
    displayName: string;
    description: string;
    capacity: number;
    imageUrl?: string;
    upfrontFareEnabled: boolean;
}
export interface UberLocation {
    latitude: number;
    longitude: number;
    address?: string;
    nickname?: string;
}
export interface UberPriceEstimate {
    productId: string;
    displayName: string;
    estimatedFare: number;
    currencyCode: string;
    distance: number;
    duration: number;
    highEstimate?: number;
    lowEstimate?: number;
    surgePricing?: boolean;
    surgeMultiplier?: number;
}
export interface UberTimeEstimate {
    productId: string;
    displayName: string;
    estimate: number;
}
export interface UberFareEstimate {
    fareId: string;
    expiresAt: Date;
    fare: {
        value: number;
        currencyCode: string;
    };
    trip: {
        distance: number;
        distanceUnit: string;
        duration: number;
    };
}
export type UberRideStatus = 'processing' | 'no_drivers_available' | 'accepted' | 'arriving' | 'in_progress' | 'driver_canceled' | 'rider_canceled' | 'completed';
export interface UberRide {
    requestId: string;
    status: UberRideStatus;
    product: {
        productId: string;
        displayName: string;
    };
    driver?: {
        name: string;
        phoneNumber: string;
        rating: number;
        pictureUrl?: string;
    };
    vehicle?: {
        make: string;
        model: string;
        licensePlate: string;
        pictureUrl?: string;
    };
    location?: {
        latitude: number;
        longitude: number;
        bearing?: number;
    };
    pickup: UberLocation;
    destination: UberLocation;
    eta?: number;
    surge?: number;
    fare?: number;
    currencyCode?: string;
    createdAt: Date;
}
export interface UberReceipt {
    requestId: string;
    chargeAdjustments: Array<{
        name: string;
        amount: number;
    }>;
    subtotal: number;
    total: number;
    totalCharged: number;
    totalOwed: number;
    currencyCode: string;
    distance: number;
    distanceUnit: string;
    duration: number;
    pickupTime: Date;
    dropoffTime: Date;
}
export declare class UberClient {
    private hub;
    private userId;
    constructor(userId: string);
    /**
     * Check if user is connected to Uber
     */
    isConnected(): boolean;
    /**
     * Get OAuth authorization URL
     */
    getAuthUrl(redirectPath?: string): Promise<string>;
    /**
     * Get available products at a location
     */
    getProducts(latitude: number, longitude: number): Promise<ApiResponse<{
        products: UberProduct[];
    }>>;
    /**
     * Get price estimates for a trip
     */
    getPriceEstimates(startLatitude: number, startLongitude: number, endLatitude: number, endLongitude: number): Promise<ApiResponse<{
        prices: UberPriceEstimate[];
    }>>;
    /**
     * Get time estimates (ETAs) for pickup
     */
    getTimeEstimates(latitude: number, longitude: number, productId?: string): Promise<ApiResponse<{
        times: UberTimeEstimate[];
    }>>;
    /**
     * Get upfront fare estimate (required before requesting ride)
     */
    getFareEstimate(params: {
        productId: string;
        startLatitude: number;
        startLongitude: number;
        startAddress?: string;
        endLatitude: number;
        endLongitude: number;
        endAddress?: string;
    }): Promise<ApiResponse<UberFareEstimate>>;
    /**
     * Request a ride
     */
    requestRide(params: {
        productId: string;
        fareId: string;
        startLatitude: number;
        startLongitude: number;
        startAddress?: string;
        startNickname?: string;
        endLatitude: number;
        endLongitude: number;
        endAddress?: string;
        endNickname?: string;
    }): Promise<ApiResponse<UberRide>>;
    /**
     * Get current ride status
     */
    getCurrentRide(): Promise<ApiResponse<UberRide>>;
    /**
     * Get ride details
     */
    getRide(requestId: string): Promise<ApiResponse<UberRide>>;
    /**
     * Cancel a ride
     */
    cancelRide(requestId?: string): Promise<ApiResponse<void>>;
    /**
     * Get ride receipt
     */
    getRideReceipt(requestId: string): Promise<ApiResponse<UberReceipt>>;
    /**
     * Get ride history
     */
    getRideHistory(limit?: number, offset?: number): Promise<ApiResponse<{
        count: number;
        history: UberRide[];
    }>>;
    /**
     * Get saved places (home, work)
     */
    getSavedPlaces(): Promise<ApiResponse<{
        places: UberLocation[];
    }>>;
    /**
     * Get a specific saved place
     */
    getSavedPlace(placeId: 'home' | 'work'): Promise<ApiResponse<UberLocation>>;
    /**
     * Update a saved place
     */
    updateSavedPlace(placeId: 'home' | 'work', address: string): Promise<ApiResponse<UberLocation>>;
}
export declare function getUberClient(userId: string): UberClient;
export declare function resetUberClient(userId: string): void;
//# sourceMappingURL=uber-client.d.ts.map