/**
 * Uber API Client
 *
 * Integration with Uber for ride requests.
 *
 * @module services/integrations/uber
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getIntegrationHub } from '../integration-hub.js';
const log = createLogger({ module: 'uber-client' });
// ============================================================================
// UBER CLIENT CLASS
// ============================================================================
export class UberClient {
    hub = getIntegrationHub();
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    /**
     * Check if user is connected to Uber
     */
    isConnected() {
        return this.hub.isConnected(this.userId, 'uber');
    }
    /**
     * Get OAuth authorization URL
     */
    async getAuthUrl(redirectPath) {
        return this.hub.getAuthorizationUrl(this.userId, 'uber', redirectPath);
    }
    // ==========================================================================
    // PRODUCTS & ESTIMATES
    // ==========================================================================
    /**
     * Get available products at a location
     */
    async getProducts(latitude, longitude) {
        return this.hub.request(this.userId, 'uber', {
            method: 'GET',
            path: '/products',
            params: { latitude, longitude },
        });
    }
    /**
     * Get price estimates for a trip
     */
    async getPriceEstimates(startLatitude, startLongitude, endLatitude, endLongitude) {
        return this.hub.request(this.userId, 'uber', {
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
    async getTimeEstimates(latitude, longitude, productId) {
        return this.hub.request(this.userId, 'uber', {
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
    async getFareEstimate(params) {
        return this.hub.request(this.userId, 'uber', {
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
    async requestRide(params) {
        return this.hub.request(this.userId, 'uber', {
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
    async getCurrentRide() {
        return this.hub.request(this.userId, 'uber', {
            method: 'GET',
            path: '/requests/current',
        });
    }
    /**
     * Get ride details
     */
    async getRide(requestId) {
        return this.hub.request(this.userId, 'uber', {
            method: 'GET',
            path: `/requests/${requestId}`,
        });
    }
    /**
     * Cancel a ride
     */
    async cancelRide(requestId) {
        const path = requestId
            ? `/requests/${requestId}`
            : '/requests/current';
        return this.hub.request(this.userId, 'uber', {
            method: 'DELETE',
            path,
        });
    }
    /**
     * Get ride receipt
     */
    async getRideReceipt(requestId) {
        return this.hub.request(this.userId, 'uber', {
            method: 'GET',
            path: `/requests/${requestId}/receipt`,
        });
    }
    /**
     * Get ride history
     */
    async getRideHistory(limit = 10, offset = 0) {
        return this.hub.request(this.userId, 'uber', {
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
    async getSavedPlaces() {
        return this.hub.request(this.userId, 'uber', {
            method: 'GET',
            path: '/places',
        });
    }
    /**
     * Get a specific saved place
     */
    async getSavedPlace(placeId) {
        return this.hub.request(this.userId, 'uber', {
            method: 'GET',
            path: `/places/${placeId}`,
        });
    }
    /**
     * Update a saved place
     */
    async updateSavedPlace(placeId, address) {
        return this.hub.request(this.userId, 'uber', {
            method: 'PUT',
            path: `/places/${placeId}`,
            body: { address },
        });
    }
}
// ============================================================================
// FACTORY
// ============================================================================
const instances = new Map();
export function getUberClient(userId) {
    let instance = instances.get(userId);
    if (!instance) {
        instance = new UberClient(userId);
        instances.set(userId, instance);
    }
    return instance;
}
export function resetUberClient(userId) {
    instances.delete(userId);
}
//# sourceMappingURL=uber-client.js.map