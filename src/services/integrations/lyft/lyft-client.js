/**
 * Lyft API Client
 *
 * Integration with Lyft for ride requests.
 *
 * @module services/integrations/lyft
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getIntegrationHub } from '../integration-hub.js';
const log = createLogger({ module: 'lyft-client' });
// ============================================================================
// LYFT CLIENT CLASS
// ============================================================================
export class LyftClient {
    hub = getIntegrationHub();
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    /**
     * Check if user is connected to Lyft
     */
    isConnected() {
        return this.hub.isConnected(this.userId, 'lyft');
    }
    /**
     * Get OAuth authorization URL
     */
    async getAuthUrl(redirectPath) {
        return this.hub.getAuthorizationUrl(this.userId, 'lyft', redirectPath);
    }
    // ==========================================================================
    // RIDE TYPES & ESTIMATES
    // ==========================================================================
    /**
     * Get available ride types at a location
     */
    async getRideTypes(latitude, longitude) {
        return this.hub.request(this.userId, 'lyft', {
            method: 'GET',
            path: '/ridetypes',
            params: { lat: latitude, lng: longitude },
        });
    }
    /**
     * Get cost estimates for a trip
     */
    async getCostEstimates(startLat, startLng, endLat, endLng, rideType) {
        return this.hub.request(this.userId, 'lyft', {
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
    async getEtaEstimates(latitude, longitude, rideType) {
        return this.hub.request(this.userId, 'lyft', {
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
    async requestRide(params) {
        return this.hub.request(this.userId, 'lyft', {
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
    async getRide(rideId) {
        return this.hub.request(this.userId, 'lyft', {
            method: 'GET',
            path: `/rides/${rideId}`,
        });
    }
    /**
     * Cancel a ride
     */
    async cancelRide(rideId, cancelConfirmationToken) {
        return this.hub.request(this.userId, 'lyft', {
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
    async rateRide(rideId, rating, tip, feedback) {
        return this.hub.request(this.userId, 'lyft', {
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
    async getRideReceipt(rideId) {
        return this.hub.request(this.userId, 'lyft', {
            method: 'GET',
            path: `/rides/${rideId}/receipt`,
        });
    }
    /**
     * Get ride history
     */
    async getRideHistory(startTime, endTime, limit = 10) {
        return this.hub.request(this.userId, 'lyft', {
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
    async getDriverLocation(rideId) {
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
const instances = new Map();
export function getLyftClient(userId) {
    let instance = instances.get(userId);
    if (!instance) {
        instance = new LyftClient(userId);
        instances.set(userId, instance);
    }
    return instance;
}
export function resetLyftClient(userId) {
    instances.delete(userId);
}
//# sourceMappingURL=lyft-client.js.map