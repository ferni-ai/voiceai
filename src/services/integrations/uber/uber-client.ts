/**
 * Uber API Client
 *
 * Integration with Uber for ride requests.
 *
 * @module services/integrations/uber
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getIntegrationHub } from '../integration-hub.js';
import type { ApiResponse } from '../types.js';

const log = createLogger({ module: 'uber-client' });

// ============================================================================
// TYPES
// ============================================================================

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
  distance: number; // miles
  duration: number; // seconds
  highEstimate?: number;
  lowEstimate?: number;
  surgePricing?: boolean;
  surgeMultiplier?: number;
}

export interface UberTimeEstimate {
  productId: string;
  displayName: string;
  estimate: number; // seconds until pickup
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

export type UberRideStatus =
  | 'processing'
  | 'no_drivers_available'
  | 'accepted'
  | 'arriving'
  | 'in_progress'
  | 'driver_canceled'
  | 'rider_canceled'
  | 'completed';

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
  eta?: number; // minutes
  surge?: number;
  fare?: number;
  currencyCode?: string;
  createdAt: Date;
}

export interface UberReceipt {
  requestId: string;
  chargeAdjustments: Array<{ name: string; amount: number }>;
  subtotal: number;
  total: number;
  totalCharged: number;
  totalOwed: number;
  currencyCode: string;
  distance: number;
  distanceUnit: string;
  duration: number; // minutes
  pickupTime: Date;
  dropoffTime: Date;
}

// ============================================================================
// UBER CLIENT CLASS
// ============================================================================

export class UberClient {
  private hub = getIntegrationHub();
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Check if user is connected to Uber
   */
  isConnected(): boolean {
    return this.hub.isConnected(this.userId, 'uber');
  }

  /**
   * Get OAuth authorization URL
   */
  async getAuthUrl(redirectPath?: string): Promise<string> {
    return this.hub.getAuthorizationUrl(this.userId, 'uber', redirectPath);
  }

  // ==========================================================================
  // PRODUCTS & ESTIMATES
  // ==========================================================================

  /**
   * Get available products at a location
   */
  async getProducts(
    latitude: number,
    longitude: number
  ): Promise<ApiResponse<{ products: UberProduct[] }>> {
    return this.hub.request<{ products: UberProduct[] }>(this.userId, 'uber', {
      method: 'GET',
      path: '/products',
      params: { latitude, longitude },
    });
  }

  /**
   * Get price estimates for a trip
   */
  async getPriceEstimates(
    startLatitude: number,
    startLongitude: number,
    endLatitude: number,
    endLongitude: number
  ): Promise<ApiResponse<{ prices: UberPriceEstimate[] }>> {
    return this.hub.request<{ prices: UberPriceEstimate[] }>(this.userId, 'uber', {
      method: 'GET',
      path: '/estimates/price',
      params: {
        start_latitude: startLatitude,
        start_longitude: startLongitude,
        end_latitude: endLatitude,
        end_longitude: endLongitude,
      },
    });
  }

  /**
   * Get time estimates (ETAs) for pickup
   */
  async getTimeEstimates(
    latitude: number,
    longitude: number,
    productId?: string
  ): Promise<ApiResponse<{ times: UberTimeEstimate[] }>> {
    return this.hub.request<{ times: UberTimeEstimate[] }>(this.userId, 'uber', {
      method: 'GET',
      path: '/estimates/time',
      params: {
        start_latitude: latitude,
        start_longitude: longitude,
        ...(productId && { product_id: productId }),
      },
    });
  }

  /**
   * Get upfront fare estimate (required before requesting ride)
   */
  async getFareEstimate(params: {
    productId: string;
    startLatitude: number;
    startLongitude: number;
    startAddress?: string;
    endLatitude: number;
    endLongitude: number;
    endAddress?: string;
  }): Promise<ApiResponse<UberFareEstimate>> {
    return this.hub.request<UberFareEstimate>(this.userId, 'uber', {
      method: 'POST',
      path: '/requests/estimate',
      body: {
        product_id: params.productId,
        start_latitude: params.startLatitude,
        start_longitude: params.startLongitude,
        start_address: params.startAddress,
        end_latitude: params.endLatitude,
        end_longitude: params.endLongitude,
        end_address: params.endAddress,
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
  }): Promise<ApiResponse<UberRide>> {
    return this.hub.request<UberRide>(this.userId, 'uber', {
      method: 'POST',
      path: '/requests',
      body: {
        product_id: params.productId,
        fare_id: params.fareId,
        start_latitude: params.startLatitude,
        start_longitude: params.startLongitude,
        start_address: params.startAddress,
        start_nickname: params.startNickname,
        end_latitude: params.endLatitude,
        end_longitude: params.endLongitude,
        end_address: params.endAddress,
        end_nickname: params.endNickname,
      },
    });
  }

  /**
   * Get current ride status
   */
  async getCurrentRide(): Promise<ApiResponse<UberRide>> {
    return this.hub.request<UberRide>(this.userId, 'uber', {
      method: 'GET',
      path: '/requests/current',
    });
  }

  /**
   * Get ride details
   */
  async getRide(requestId: string): Promise<ApiResponse<UberRide>> {
    return this.hub.request<UberRide>(this.userId, 'uber', {
      method: 'GET',
      path: `/requests/${requestId}`,
    });
  }

  /**
   * Cancel a ride
   */
  async cancelRide(requestId?: string): Promise<ApiResponse<void>> {
    const path = requestId ? `/requests/${requestId}` : '/requests/current';

    return this.hub.request<void>(this.userId, 'uber', {
      method: 'DELETE',
      path,
    });
  }

  /**
   * Get ride receipt
   */
  async getRideReceipt(requestId: string): Promise<ApiResponse<UberReceipt>> {
    return this.hub.request<UberReceipt>(this.userId, 'uber', {
      method: 'GET',
      path: `/requests/${requestId}/receipt`,
    });
  }

  /**
   * Get ride history
   */
  async getRideHistory(
    limit: number = 10,
    offset: number = 0
  ): Promise<ApiResponse<{ count: number; history: UberRide[] }>> {
    return this.hub.request<{ count: number; history: UberRide[] }>(this.userId, 'uber', {
      method: 'GET',
      path: '/history',
      params: { limit, offset },
    });
  }

  // ==========================================================================
  // SAVED PLACES
  // ==========================================================================

  /**
   * Get saved places (home, work)
   */
  async getSavedPlaces(): Promise<ApiResponse<{ places: UberLocation[] }>> {
    return this.hub.request<{ places: UberLocation[] }>(this.userId, 'uber', {
      method: 'GET',
      path: '/places',
    });
  }

  /**
   * Get a specific saved place
   */
  async getSavedPlace(placeId: 'home' | 'work'): Promise<ApiResponse<UberLocation>> {
    return this.hub.request<UberLocation>(this.userId, 'uber', {
      method: 'GET',
      path: `/places/${placeId}`,
    });
  }

  /**
   * Update a saved place
   */
  async updateSavedPlace(
    placeId: 'home' | 'work',
    address: string
  ): Promise<ApiResponse<UberLocation>> {
    return this.hub.request<UberLocation>(this.userId, 'uber', {
      method: 'PUT',
      path: `/places/${placeId}`,
      body: { address },
    });
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const instances: Map<string, UberClient> = new Map();

export function getUberClient(userId: string): UberClient {
  let instance = instances.get(userId);
  if (!instance) {
    instance = new UberClient(userId);
    instances.set(userId, instance);
  }
  return instance;
}

export function resetUberClient(userId: string): void {
  instances.delete(userId);
}
