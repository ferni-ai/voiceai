/**
 * Food Delivery Service
 *
 * Integrates with food delivery platforms:
 * - DoorDash (Drive API for direct ordering where available)
 * - Uber Eats (Direct API for restaurants)
 * - Grubhub (search and deep links)
 *
 * Note: Full ordering requires merchant partnerships. For consumer orders,
 * we search and prepare the order, then help user complete via app/web.
 *
 * Alex can:
 * - Search restaurants on delivery platforms
 * - Check if a restaurant delivers to user's address
 * - Get menus and pricing
 * - Build an order and estimate total
 * - Send order link to user's phone to complete payment
 */
export type DeliveryPlatform = 'doordash' | 'ubereats' | 'grubhub' | 'postmates';
export interface DeliveryRestaurant {
    id: string;
    platform: DeliveryPlatform;
    name: string;
    imageUrl?: string;
    cuisines: string[];
    rating?: number;
    reviewCount?: number;
    priceRange?: string;
    deliveryFee?: number;
    deliveryTime?: {
        min: number;
        max: number;
    };
    distance?: number;
    isOpen: boolean;
    acceptsOrders: boolean;
    menuUrl?: string;
    deepLink?: string;
}
export interface MenuItem {
    id: string;
    name: string;
    description?: string;
    price: number;
    imageUrl?: string;
    category: string;
    customizations?: MenuCustomization[];
    popular?: boolean;
}
export interface MenuCustomization {
    id: string;
    name: string;
    required: boolean;
    maxSelections?: number;
    options: Array<{
        id: string;
        name: string;
        price: number;
    }>;
}
export interface OrderItem {
    menuItem: MenuItem;
    quantity: number;
    customizations?: Array<{
        customizationId: string;
        optionIds: string[];
    }>;
    specialInstructions?: string;
}
export interface DeliveryOrder {
    id: string;
    platform: DeliveryPlatform;
    restaurant: DeliveryRestaurant;
    items: OrderItem[];
    subtotal: number;
    deliveryFee: number;
    serviceFee: number;
    tax: number;
    tip?: number;
    total: number;
    estimatedDelivery?: {
        min: number;
        max: number;
    };
    status: 'building' | 'ready' | 'submitted' | 'confirmed' | 'preparing' | 'on_the_way' | 'delivered';
    checkoutUrl?: string;
    deepLink?: string;
}
export interface DeliveryAddress {
    street: string;
    apt?: string;
    city: string;
    state: string;
    zipCode: string;
    instructions?: string;
}
/**
 * Create a DoorDash delivery (requires Drive API partnership)
 */
declare function createDoorDashDelivery(order: {
    pickupAddress: string;
    pickupPhone: string;
    pickupInstructions?: string;
    dropoffAddress: string;
    dropoffPhone: string;
    dropoffInstructions?: string;
    orderValue: number;
    tip?: number;
}): Promise<{
    success: boolean;
    deliveryId?: string;
    trackingUrl?: string;
    error?: string;
}>;
/**
 * Search across all delivery platforms
 */
export declare function searchDeliveryRestaurants(query: string, address: DeliveryAddress, platforms?: DeliveryPlatform[]): Promise<DeliveryRestaurant[]>;
/**
 * Get user's order history
 */
export declare function getOrderHistory(userId: string, limit?: number): Promise<DeliveryOrder[]>;
/**
 * Start building an order
 */
export declare function startOrder(restaurant: DeliveryRestaurant, userId?: string): DeliveryOrder;
/**
 * Add item to order
 */
export declare function addToOrder(orderId: string, item: MenuItem, quantity?: number, options?: {
    customizations?: Array<{
        customizationId: string;
        optionIds: string[];
    }>;
    specialInstructions?: string;
}): DeliveryOrder | null;
/**
 * Remove item from order
 */
export declare function removeFromOrder(orderId: string, itemIndex: number): DeliveryOrder | null;
/**
 * Set tip amount
 */
export declare function setTip(orderId: string, tip: number): DeliveryOrder | null;
/**
 * Finalize order and get checkout URL
 */
export declare function finalizeOrder(orderId: string): DeliveryOrder | null;
/**
 * Get order by ID
 */
export declare function getOrder(orderId: string): DeliveryOrder | undefined;
/**
 * Format restaurant for speech
 */
export declare function formatRestaurantForSpeech(restaurant: DeliveryRestaurant): string;
/**
 * Format order summary for speech
 */
export declare function formatOrderForSpeech(order: DeliveryOrder): string;
/**
 * Generate a message to send to user with order link
 */
export declare function getOrderCompletionMessage(order: DeliveryOrder): string;
/**
 * Check if delivery services are configured
 */
export declare function isDeliveryConfigured(): {
    doordash: boolean;
    ubereats: boolean;
    anyConfigured: boolean;
};
declare const _default: {
    searchDeliveryRestaurants: typeof searchDeliveryRestaurants;
    startOrder: typeof startOrder;
    addToOrder: typeof addToOrder;
    removeFromOrder: typeof removeFromOrder;
    setTip: typeof setTip;
    finalizeOrder: typeof finalizeOrder;
    getOrder: typeof getOrder;
    formatRestaurantForSpeech: typeof formatRestaurantForSpeech;
    formatOrderForSpeech: typeof formatOrderForSpeech;
    getOrderCompletionMessage: typeof getOrderCompletionMessage;
    isDeliveryConfigured: typeof isDeliveryConfigured;
    createDoorDashDelivery: typeof createDoorDashDelivery;
};
export default _default;
//# sourceMappingURL=food-delivery.d.ts.map