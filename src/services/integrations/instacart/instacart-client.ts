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
import type { ApiResponse } from '../types.js';

const log = createLogger({ module: 'instacart-client' });

// ============================================================================
// TYPES
// ============================================================================

export interface InstacartStore {
  id: string;
  name: string;
  address: string;
  distance?: number;
  logoUrl?: string;
  deliveryFee?: number;
  minimumOrder?: number;
  estimatedDeliveryMinutes?: number;
}

export interface InstacartProduct {
  id: string;
  name: string;
  brand?: string;
  size?: string;
  price: number;
  priceUnit?: string;
  imageUrl?: string;
  inStock: boolean;
  category?: string;
}

export interface InstacartCartItem {
  productId: string;
  quantity: number;
  notes?: string;
}

export interface InstacartCart {
  id: string;
  storeId: string;
  items: InstacartCartItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  total: number;
}

export interface InstacartDeliveryWindow {
  id: string;
  startTime: Date;
  endTime: Date;
  fee: number;
  available: boolean;
}

export interface InstacartOrder {
  id: string;
  status: 'pending' | 'confirmed' | 'shopping' | 'delivering' | 'delivered' | 'cancelled';
  storeId: string;
  storeName: string;
  items: Array<InstacartCartItem & { product: InstacartProduct }>;
  deliveryWindow: InstacartDeliveryWindow;
  deliveryAddress: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tip: number;
  tax: number;
  total: number;
  createdAt: Date;
  estimatedDeliveryAt?: Date;
  deliveredAt?: Date;
  shopperName?: string;
  shopperPhone?: string;
}

// ============================================================================
// INSTACART CLIENT CLASS
// ============================================================================

export class InstacartClient {
  private hub = getIntegrationHub();
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Check if user is connected to Instacart
   */
  isConnected(): boolean {
    return this.hub.isConnected(this.userId, 'instacart');
  }

  /**
   * Get OAuth authorization URL
   */
  async getAuthUrl(redirectPath?: string): Promise<string> {
    return this.hub.getAuthorizationUrl(this.userId, 'instacart', redirectPath);
  }

  // ==========================================================================
  // STORES
  // ==========================================================================

  /**
   * Search for nearby stores
   */
  async searchStores(
    latitude: number,
    longitude: number,
    query?: string
  ): Promise<ApiResponse<InstacartStore[]>> {
    return this.hub.request<InstacartStore[]>(this.userId, 'instacart', {
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
  async getStore(storeId: string): Promise<ApiResponse<InstacartStore>> {
    return this.hub.request<InstacartStore>(this.userId, 'instacart', {
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
  async searchProducts(
    storeId: string,
    query: string,
    limit: number = 20
  ): Promise<ApiResponse<InstacartProduct[]>> {
    return this.hub.request<InstacartProduct[]>(this.userId, 'instacart', {
      method: 'GET',
      path: `/stores/${storeId}/products`,
      params: { query, limit },
    });
  }

  /**
   * Get product details
   */
  async getProduct(
    storeId: string,
    productId: string
  ): Promise<ApiResponse<InstacartProduct>> {
    return this.hub.request<InstacartProduct>(this.userId, 'instacart', {
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
  async createCart(storeId: string): Promise<ApiResponse<InstacartCart>> {
    return this.hub.request<InstacartCart>(this.userId, 'instacart', {
      method: 'POST',
      path: '/carts',
      body: { storeId },
    });
  }

  /**
   * Add item to cart
   */
  async addToCart(
    cartId: string,
    productId: string,
    quantity: number,
    notes?: string
  ): Promise<ApiResponse<InstacartCart>> {
    return this.hub.request<InstacartCart>(this.userId, 'instacart', {
      method: 'POST',
      path: `/carts/${cartId}/items`,
      body: { productId, quantity, notes },
    });
  }

  /**
   * Update cart item quantity
   */
  async updateCartItem(
    cartId: string,
    productId: string,
    quantity: number
  ): Promise<ApiResponse<InstacartCart>> {
    return this.hub.request<InstacartCart>(this.userId, 'instacart', {
      method: 'PUT',
      path: `/carts/${cartId}/items/${productId}`,
      body: { quantity },
    });
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(
    cartId: string,
    productId: string
  ): Promise<ApiResponse<InstacartCart>> {
    return this.hub.request<InstacartCart>(this.userId, 'instacart', {
      method: 'DELETE',
      path: `/carts/${cartId}/items/${productId}`,
    });
  }

  /**
   * Get cart
   */
  async getCart(cartId: string): Promise<ApiResponse<InstacartCart>> {
    return this.hub.request<InstacartCart>(this.userId, 'instacart', {
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
  async getDeliveryWindows(
    cartId: string,
    address: string
  ): Promise<ApiResponse<InstacartDeliveryWindow[]>> {
    return this.hub.request<InstacartDeliveryWindow[]>(this.userId, 'instacart', {
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
  async createOrder(params: {
    cartId: string;
    deliveryWindowId: string;
    deliveryAddress: string;
    tip?: number;
    notes?: string;
  }): Promise<ApiResponse<InstacartOrder>> {
    return this.hub.request<InstacartOrder>(this.userId, 'instacart', {
      method: 'POST',
      path: '/orders',
      body: params,
    });
  }

  /**
   * Get order status
   */
  async getOrder(orderId: string): Promise<ApiResponse<InstacartOrder>> {
    return this.hub.request<InstacartOrder>(this.userId, 'instacart', {
      method: 'GET',
      path: `/orders/${orderId}`,
    });
  }

  /**
   * Get order history
   */
  async getOrderHistory(limit: number = 10): Promise<ApiResponse<InstacartOrder[]>> {
    return this.hub.request<InstacartOrder[]>(this.userId, 'instacart', {
      method: 'GET',
      path: '/orders',
      params: { limit },
    });
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.hub.request<{ success: boolean }>(this.userId, 'instacart', {
      method: 'POST',
      path: `/orders/${orderId}/cancel`,
    });
  }

  /**
   * Update tip for order
   */
  async updateTip(orderId: string, tip: number): Promise<ApiResponse<InstacartOrder>> {
    return this.hub.request<InstacartOrder>(this.userId, 'instacart', {
      method: 'PUT',
      path: `/orders/${orderId}/tip`,
      body: { tip },
    });
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const instances: Map<string, InstacartClient> = new Map();

export function getInstacartClient(userId: string): InstacartClient {
  let instance = instances.get(userId);
  if (!instance) {
    instance = new InstacartClient(userId);
    instances.set(userId, instance);
  }
  return instance;
}

export function resetInstacartClient(userId: string): void {
  instances.delete(userId);
}
