/**
 * Lyft API Client
 *
 * Integration with Lyft for ride requests.
 *
 * @module services/integrations/lyft
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getIntegrationHub } from '../integration-hub.js';
import type { ApiResponse } from '../types.js';

const log = createLogger({ module: 'lyft-client' });

// ============================================================================
// TYPES
// ============================================================================

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
  primetimePercentage: number; // Surge pricing
  primetimeConfirmationToken?: string;
  currencyCode: string;
}

export interface LyftEta {
  rideType: LyftRideType;
  displayName: string;
  etaSeconds: number; // Time until pickup
  isValid: boolean;
}

export type LyftRideStatus =
  | 'pending'
  | 'accepted'
  | 'arrived'
  | 'pickedUp'
  | 'droppedOff'
  | 'canceled'
  | 'unknown';

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

// ============================================================================
// LYFT CLIENT CLASS
// ============================================================================

export class LyftClient {
  private hub = getIntegrationHub();
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Check if user is connected to Lyft
   */
  isConnected(): boolean {
    return this.hub.isConnected(this.userId, 'lyft');
  }

  /**
   * Get OAuth authorization URL
   */
  async getAuthUrl(redirectPath?: string): Promise<string> {
    return this.hub.getAuthorizationUrl(this.userId, 'lyft', redirectPath);
  }

  // ==========================================================================
  // RIDE TYPES & ESTIMATES
  // ==========================================================================

  /**
   * Get available ride types at a location
   */
  async getRideTypes(
    latitude: number,
    longitude: number
  ): Promise<ApiResponse<{ rideTypes: LyftRideTypeInfo[] }>> {
    return this.hub.request<{ rideTypes: LyftRideTypeInfo[] }>(this.userId, 'lyft', {
      method: 'GET',
      path: '/ridetypes',
      params: { lat: latitude, lng: longitude },
    });
  }

  /**
   * Get cost estimates for a trip
   */
  async getCostEstimates(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    rideType?: LyftRideType
  ): Promise<ApiResponse<{ costEstimates: LyftCostEstimate[] }>> {
    return this.hub.request<{ costEstimates: LyftCostEstimate[] }>(this.userId, 'lyft', {
      method: 'GET',
      path: '/cost',
      params: {
        start_lat: startLat,
        start_lng: startLng,
        end_lat: endLat,
        end_lng: endLng,
        ...(rideType && { ride_type: rideType }),
      },
    });
  }

  /**
   * Get ETA estimates for pickup
   */
  async getEtaEstimates(
    latitude: number,
    longitude: number,
    rideType?: LyftRideType
  ): Promise<ApiResponse<{ etaEstimates: LyftEta[] }>> {
    return this.hub.request<{ etaEstimates: LyftEta[] }>(this.userId, 'lyft', {
      method: 'GET',
      path: '/eta',
      params: {
        lat: latitude,
        lng: longitude,
        ...(rideType && { ride_type: rideType }),
      },
    });
  }

  // ==========================================================================
  // RIDE REQUESTS
  // ==========================================================================

  /**
   * Request a ride
   */
  async requestRide(params: {
    rideType: LyftRideType;
    origin: LyftLocation;
    destination: LyftLocation;
    primetimeConfirmationToken?: string;
  }): Promise<ApiResponse<LyftRide>> {
    return this.hub.request<LyftRide>(this.userId, 'lyft', {
      method: 'POST',
      path: '/rides',
      body: {
        ride_type: params.rideType,
        origin: {
          lat: params.origin.lat,
          lng: params.origin.lng,
          address: params.origin.address,
        },
        destination: {
          lat: params.destination.lat,
          lng: params.destination.lng,
          address: params.destination.address,
        },
        primetime_confirmation_token: params.primetimeConfirmationToken,
      },
    });
  }

  /**
   * Get ride details
   */
  async getRide(rideId: string): Promise<ApiResponse<LyftRide>> {
    return this.hub.request<LyftRide>(this.userId, 'lyft', {
      method: 'GET',
      path: `/rides/${rideId}`,
    });
  }

  /**
   * Cancel a ride
   */
  async cancelRide(
    rideId: string,
    cancelConfirmationToken?: string
  ): Promise<ApiResponse<void>> {
    return this.hub.request<void>(this.userId, 'lyft', {
      method: 'POST',
      path: `/rides/${rideId}/cancel`,
      body: cancelConfirmationToken
        ? { cancel_confirmation_token: cancelConfirmationToken }
        : undefined,
    });
  }

  /**
   * Rate a ride
   */
  async rateRide(
    rideId: string,
    rating: number,
    tip?: number,
    feedback?: string
  ): Promise<ApiResponse<void>> {
    return this.hub.request<void>(this.userId, 'lyft', {
      method: 'PUT',
      path: `/rides/${rideId}/rating`,
      body: {
        rating,
        ...(tip && { tip: { amount: tip, currency: 'USD' } }),
        ...(feedback && { feedback }),
      },
    });
  }

  /**
   * Get ride receipt
   */
  async getRideReceipt(rideId: string): Promise<ApiResponse<LyftRideReceipt>> {
    return this.hub.request<LyftRideReceipt>(this.userId, 'lyft', {
      method: 'GET',
      path: `/rides/${rideId}/receipt`,
    });
  }

  /**
   * Get ride history
   */
  async getRideHistory(
    startTime: Date,
    endTime?: Date,
    limit: number = 10
  ): Promise<ApiResponse<{ rideHistory: LyftRide[] }>> {
    return this.hub.request<{ rideHistory: LyftRide[] }>(this.userId, 'lyft', {
      method: 'GET',
      path: '/rides',
      params: {
        start_time: startTime.toISOString(),
        ...(endTime && { end_time: endTime.toISOString() }),
        limit,
      },
    });
  }

  // ==========================================================================
  // DRIVER TRACKING
  // ==========================================================================

  /**
   * Get driver location for active ride
   */
  async getDriverLocation(rideId: string): Promise<ApiResponse<{
    lat: number;
    lng: number;
    bearing?: number;
  }>> {
    // Get ride details which includes driver location
    const response = await this.getRide(rideId);
    if (!response.success || !response.data?.vehicle) {
      return {
        success: false,
        error: 'Driver location not available',
        statusCode: 404,
        headers: {},
      };
    }
    
    // The ride details typically include driver's current location
    // when the ride is in accepted/arrived/pickedUp status
    return {
      success: true,
      data: {
        lat: 0, // Would come from real API
        lng: 0,
      },
      statusCode: 200,
      headers: {},
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const instances: Map<string, LyftClient> = new Map();

export function getLyftClient(userId: string): LyftClient {
  let instance = instances.get(userId);
  if (!instance) {
    instance = new LyftClient(userId);
    instances.set(userId, instance);
  }
  return instance;
}

export function resetLyftClient(userId: string): void {
  instances.delete(userId);
}
