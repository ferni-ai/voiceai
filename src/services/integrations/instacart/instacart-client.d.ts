/**
 * Instacart API Client
 *
 * Integration with Instacart for grocery ordering.
 * NOTE: Requires business partnership with Instacart.
 *
 * @module services/integrations/instacart
 */
import type { ApiResponse } from '../types.js';
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
    items: Array<InstacartCartItem & {
        product: InstacartProduct;
    }>;
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
export declare class InstacartClient {
    private hub;
    private userId;
    constructor(userId: string);
    /**
     * Check if user is connected to Instacart
     */
    isConnected(): boolean;
    /**
     * Get OAuth authorization URL
     */
    getAuthUrl(redirectPath?: string): Promise<string>;
    /**
     * Search for nearby stores
     */
    searchStores(latitude: number, longitude: number, query?: string): Promise<ApiResponse<InstacartStore[]>>;
    /**
     * Get store details
     */
    getStore(storeId: string): Promise<ApiResponse<InstacartStore>>;
    /**
     * Search for products at a store
     */
    searchProducts(storeId: string, query: string, limit?: number): Promise<ApiResponse<InstacartProduct[]>>;
    /**
     * Get product details
     */
    getProduct(storeId: string, productId: string): Promise<ApiResponse<InstacartProduct>>;
    /**
     * Create a new cart
     */
    createCart(storeId: string): Promise<ApiResponse<InstacartCart>>;
    /**
     * Add item to cart
     */
    addToCart(cartId: string, productId: string, quantity: number, notes?: string): Promise<ApiResponse<InstacartCart>>;
    /**
     * Update cart item quantity
     */
    updateCartItem(cartId: string, productId: string, quantity: number): Promise<ApiResponse<InstacartCart>>;
    /**
     * Remove item from cart
     */
    removeFromCart(cartId: string, productId: string): Promise<ApiResponse<InstacartCart>>;
    /**
     * Get cart
     */
    getCart(cartId: string): Promise<ApiResponse<InstacartCart>>;
    /**
     * Get available delivery windows
     */
    getDeliveryWindows(cartId: string, address: string): Promise<ApiResponse<InstacartDeliveryWindow[]>>;
    /**
     * Create order from cart
     */
    createOrder(params: {
        cartId: string;
        deliveryWindowId: string;
        deliveryAddress: string;
        tip?: number;
        notes?: string;
    }): Promise<ApiResponse<InstacartOrder>>;
    /**
     * Get order status
     */
    getOrder(orderId: string): Promise<ApiResponse<InstacartOrder>>;
    /**
     * Get order history
     */
    getOrderHistory(limit?: number): Promise<ApiResponse<InstacartOrder[]>>;
    /**
     * Cancel an order
     */
    cancelOrder(orderId: string): Promise<ApiResponse<{
        success: boolean;
    }>>;
    /**
     * Update tip for order
     */
    updateTip(orderId: string, tip: number): Promise<ApiResponse<InstacartOrder>>;
}
export declare function getInstacartClient(userId: string): InstacartClient;
export declare function resetInstacartClient(userId: string): void;
//# sourceMappingURL=instacart-client.d.ts.map