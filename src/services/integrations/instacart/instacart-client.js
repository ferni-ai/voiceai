/**
 * Instacart API Client
 *
 * Integration with Instacart for grocery ordering.
 * NOTE: Requires business partnership with Instacart.
 *
 * @module services/integrations/instacart
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getIntegrationHub } from '../integration-hub.js';
const log = createLogger({ module: 'instacart-client' });
// ============================================================================
// INSTACART CLIENT CLASS
// ============================================================================
export class InstacartClient {
    hub = getIntegrationHub();
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    /**
     * Check if user is connected to Instacart
     */
    isConnected() {
        return this.hub.isConnected(this.userId, 'instacart');
    }
    /**
     * Get OAuth authorization URL
     */
    async getAuthUrl(redirectPath) {
        return this.hub.getAuthorizationUrl(this.userId, 'instacart', redirectPath);
    }
    // ==========================================================================
    // STORES
    // ==========================================================================
    /**
     * Search for nearby stores
     */
    async searchStores(latitude, longitude, query) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'GET',
            path: '/stores',
            params: {
                latitude,
                longitude,
                ...(query && { query }),
            },
        });
    }
    /**
     * Get store details
     */
    async getStore(storeId) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'GET',
            path: `/stores/${storeId}`,
        });
    }
    // ==========================================================================
    // PRODUCTS
    // ==========================================================================
    /**
     * Search for products at a store
     */
    async searchProducts(storeId, query, limit = 20) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'GET',
            path: `/stores/${storeId}/products`,
            params: { query, limit },
        });
    }
    /**
     * Get product details
     */
    async getProduct(storeId, productId) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'GET',
            path: `/stores/${storeId}/products/${productId}`,
        });
    }
    // ==========================================================================
    // CART
    // ==========================================================================
    /**
     * Create a new cart
     */
    async createCart(storeId) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'POST',
            path: '/carts',
            body: { storeId },
        });
    }
    /**
     * Add item to cart
     */
    async addToCart(cartId, productId, quantity, notes) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'POST',
            path: `/carts/${cartId}/items`,
            body: { productId, quantity, notes },
        });
    }
    /**
     * Update cart item quantity
     */
    async updateCartItem(cartId, productId, quantity) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'PUT',
            path: `/carts/${cartId}/items/${productId}`,
            body: { quantity },
        });
    }
    /**
     * Remove item from cart
     */
    async removeFromCart(cartId, productId) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'DELETE',
            path: `/carts/${cartId}/items/${productId}`,
        });
    }
    /**
     * Get cart
     */
    async getCart(cartId) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'GET',
            path: `/carts/${cartId}`,
        });
    }
    // ==========================================================================
    // DELIVERY
    // ==========================================================================
    /**
     * Get available delivery windows
     */
    async getDeliveryWindows(cartId, address) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'GET',
            path: `/carts/${cartId}/delivery-windows`,
            params: { address },
        });
    }
    // ==========================================================================
    // ORDERS
    // ==========================================================================
    /**
     * Create order from cart
     */
    async createOrder(params) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'POST',
            path: '/orders',
            body: params,
        });
    }
    /**
     * Get order status
     */
    async getOrder(orderId) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'GET',
            path: `/orders/${orderId}`,
        });
    }
    /**
     * Get order history
     */
    async getOrderHistory(limit = 10) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'GET',
            path: '/orders',
            params: { limit },
        });
    }
    /**
     * Cancel an order
     */
    async cancelOrder(orderId) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'POST',
            path: `/orders/${orderId}/cancel`,
        });
    }
    /**
     * Update tip for order
     */
    async updateTip(orderId, tip) {
        return this.hub.request(this.userId, 'instacart', {
            method: 'PUT',
            path: `/orders/${orderId}/tip`,
            body: { tip },
        });
    }
}
// ============================================================================
// FACTORY
// ============================================================================
const instances = new Map();
export function getInstacartClient(userId) {
    let instance = instances.get(userId);
    if (!instance) {
        instance = new InstacartClient(userId);
        instances.set(userId, instance);
    }
    return instance;
}
export function resetInstacartClient(userId) {
    instances.delete(userId);
}
//# sourceMappingURL=instacart-client.js.map