/**
 * Lyft API Client
 *
 * Integration with Lyft for ride requests.
 *
 * @module services/integrations/lyft
 */
import type { ApiResponse } from '../types.js';
export type LyftRideType = 'lyft' | 'lyft_plus' | 'lyft_lux' | 'lyft_lux_suv' | 'lyft_shared';
export interface LyftRideTypeInfo {
    rideType: LyftRideType;
    displayName: string;
    seats: number;
    imageUrl?: string;
    pricing: {
        baseCharge: number;
        costPerMile: number;
        costPerMinute: number;
        cancelPenalty: number;
        currencyCode: string;
    };
}
export interface LyftLocation {
    lat: number;
    lng: number;
    address?: string;
}
export interface LyftCostEstimate {
    rideType: LyftRideType;
    displayName: string;
    estimatedCostMin: number;
    estimatedCostMax: number;
    estimatedDurationSeconds: number;
    estimatedDistanceMiles: number;
    primetimePercentage: number;
    primetimeConfirmationToken?: string;
    currencyCode: string;
}
export interface LyftEta {
    rideType: LyftRideType;
    displayName: string;
    etaSeconds: number;
    isValid: boolean;
}
export type LyftRideStatus = 'pending' | 'accepted' | 'arrived' | 'pickedUp' | 'droppedOff' | 'canceled' | 'unknown';
export interface LyftDriver {
    firstName: string;
    phoneNumber: string;
    rating: number;
    imageUrl?: string;
}
export interface LyftVehicle {
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    color: string;
    imageUrl?: string;
}
export interface LyftRide {
    rideId: string;
    status: LyftRideStatus;
    rideType: LyftRideType;
    origin: LyftLocation;
    destination: LyftLocation;
    passenger?: {
        firstName: string;
        rating: number;
    };
    driver?: LyftDriver;
    vehicle?: LyftVehicle;
    pickup?: {
        time: Date;
        location: LyftLocation;
    };
    dropoff?: {
        time: Date;
        location: LyftLocation;
    };
    priceQuote?: {
        estimatedCostMin: number;
        estimatedCostMax: number;
        currencyCode: string;
    };
    primetimePercentage?: number;
    distanceMiles?: number;
    durationSeconds?: number;
    requestedAt: Date;
    canceledBy?: 'driver' | 'passenger' | 'system';
}
export interface LyftRideReceipt {
    rideId: string;
    price: {
        amount: number;
        currencyCode: string;
    };
    lineItems: Array<{
        type: string;
        amount: number;
    }>;
    charges: Array<{
        amount: number;
        currencyCode: string;
        paymentMethod: string;
    }>;
    requestedAt: Date;
    rideProfile: 'personal' | 'business';
}
export declare class LyftClient {
    private hub;
    private userId;
    constructor(userId: string);
    /**
     * Check if user is connected to Lyft
     */
    isConnected(): boolean;
    /**
     * Get OAuth authorization URL
     */
    getAuthUrl(redirectPath?: string): Promise<string>;
    /**
     * Get available ride types at a location
     */
    getRideTypes(latitude: number, longitude: number): Promise<ApiResponse<{
        rideTypes: LyftRideTypeInfo[];
    }>>;
    /**
     * Get cost estimates for a trip
     */
    getCostEstimates(startLat: number, startLng: number, endLat: number, endLng: number, rideType?: LyftRideType): Promise<ApiResponse<{
        costEstimates: LyftCostEstimate[];
    }>>;
    /**
     * Get ETA estimates for pickup
     */
    getEtaEstimates(latitude: number, longitude: number, rideType?: LyftRideType): Promise<ApiResponse<{
        etaEstimates: LyftEta[];
    }>>;
    /**
     * Request a ride
     */
    requestRide(params: {
        rideType: LyftRideType;
        origin: LyftLocation;
        destination: LyftLocation;
        primetimeConfirmationToken?: string;
    }): Promise<ApiResponse<LyftRide>>;
    /**
     * Get ride details
     */
    getRide(rideId: string): Promise<ApiResponse<LyftRide>>;
    /**
     * Cancel a ride
     */
    cancelRide(rideId: string, cancelConfirmationToken?: string): Promise<ApiResponse<void>>;
    /**
     * Rate a ride
     */
    rateRide(rideId: string, rating: number, tip?: number, feedback?: string): Promise<ApiResponse<void>>;
    /**
     * Get ride receipt
     */
    getRideReceipt(rideId: string): Promise<ApiResponse<LyftRideReceipt>>;
    /**
     * Get ride history
     */
    getRideHistory(startTime: Date, endTime?: Date, limit?: number): Promise<ApiResponse<{
        rideHistory: LyftRide[];
    }>>;
    /**
     * Get driver location for active ride
     */
    getDriverLocation(rideId: string): Promise<ApiResponse<{
        lat: number;
        lng: number;
        bearing?: number;
    }>>;
}
export declare function getLyftClient(userId: string): LyftClient;
export declare function resetLyftClient(userId: string): void;
//# sourceMappingURL=lyft-client.d.ts.map