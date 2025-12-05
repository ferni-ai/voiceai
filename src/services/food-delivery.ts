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

import { getLogger } from '../utils/safe-logger.js';
import { getConfig } from '../config/environment.js';

// ============================================================================
// TYPES
// ============================================================================

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
  deliveryTime?: { min: number; max: number }; // minutes
  distance?: number; // miles
  isOpen: boolean;
  acceptsOrders: boolean;
  menuUrl?: string;
  deepLink?: string; // Opens in app
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
  customizations?: Array<{ customizationId: string; optionIds: string[] }>;
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
  estimatedDelivery?: { min: number; max: number };
  status:
    | 'building'
    | 'ready'
    | 'submitted'
    | 'confirmed'
    | 'preparing'
    | 'on_the_way'
    | 'delivered';
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

// ============================================================================
// API CONFIGURATION
// ============================================================================

// DoorDash Drive API (for merchants/businesses)
const DOORDASH_API_KEY = process.env.DOORDASH_API_KEY || '';
const DOORDASH_DEVELOPER_ID = process.env.DOORDASH_DEVELOPER_ID || '';
const DOORDASH_KEY_ID = process.env.DOORDASH_KEY_ID || '';
const DOORDASH_SIGNING_SECRET = process.env.DOORDASH_SIGNING_SECRET || '';

// Uber Eats Direct API
const UBER_CLIENT_ID = process.env.UBER_CLIENT_ID || '';
const UBER_CLIENT_SECRET = process.env.UBER_CLIENT_SECRET || '';

// ============================================================================
// DOORDASH INTEGRATION
// ============================================================================

/**
 * Search restaurants on DoorDash
 * Uses public search when API not configured
 */
async function searchDoorDash(
  query: string,
  address: DeliveryAddress
): Promise<DeliveryRestaurant[]> {
  // If API configured, use it
  if (DOORDASH_API_KEY && DOORDASH_DEVELOPER_ID) {
    try {
      // DoorDash Drive API endpoint
      const response = await fetch('https://openapi.doordash.com/drive/v2/stores', {
        headers: {
          Authorization: `Bearer ${DOORDASH_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          stores?: Array<{
            external_store_id: string;
            name: string;
            phone_number?: string;
            address?: { city?: string };
          }>;
        };
        return (data.stores || []).map((store) => ({
          id: `doordash_${store.external_store_id}`,
          platform: 'doordash' as const,
          name: store.name,
          cuisines: [],
          isOpen: true,
          acceptsOrders: true,
          deepLink: `doordash://store/${store.external_store_id}`,
        }));
      }
    } catch (error) {
      getLogger().warn({ error }, 'DoorDash API error');
    }
  }

  // Fallback: Generate deep link for search
  const searchQuery = encodeURIComponent(query);
  const addressStr = encodeURIComponent(
    `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`
  );

  return [
    {
      id: 'doordash_search',
      platform: 'doordash',
      name: `Search "${query}" on DoorDash`,
      cuisines: [],
      isOpen: true,
      acceptsOrders: true,
      deepLink: `doordash://search?query=${searchQuery}`,
      menuUrl: `https://www.doordash.com/search/store/${searchQuery}/?address=${addressStr}`,
    },
  ];
}

/**
 * Create a DoorDash delivery (requires Drive API partnership)
 */
async function createDoorDashDelivery(order: {
  pickupAddress: string;
  pickupPhone: string;
  pickupInstructions?: string;
  dropoffAddress: string;
  dropoffPhone: string;
  dropoffInstructions?: string;
  orderValue: number;
  tip?: number;
}): Promise<{ success: boolean; deliveryId?: string; trackingUrl?: string; error?: string }> {
  if (!DOORDASH_DEVELOPER_ID || !DOORDASH_KEY_ID || !DOORDASH_SIGNING_SECRET) {
    return { success: false, error: 'DoorDash Drive API not configured' };
  }

  try {
    // Create JWT for authentication
    const jwt = await createDoorDashJWT();

    const response = await fetch('https://openapi.doordash.com/drive/v2/deliveries', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_delivery_id: `delivery_${Date.now()}`,
        pickup_address: order.pickupAddress,
        pickup_phone_number: order.pickupPhone,
        pickup_instructions: order.pickupInstructions,
        dropoff_address: order.dropoffAddress,
        dropoff_phone_number: order.dropoffPhone,
        dropoff_instructions: order.dropoffInstructions,
        order_value: Math.round(order.orderValue * 100), // cents
        tip: order.tip ? Math.round(order.tip * 100) : undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        external_delivery_id: string;
        tracking_url?: string;
      };
      return {
        success: true,
        deliveryId: data.external_delivery_id,
        trackingUrl: data.tracking_url,
      };
    } else {
      const error = (await response.json()) as { message?: string };
      return { success: false, error: error.message || 'DoorDash API error' };
    }
  } catch (error) {
    getLogger().error({ error }, 'DoorDash delivery creation failed');
    return { success: false, error: 'Failed to create delivery' };
  }
}

async function createDoorDashJWT(): Promise<string> {
  // In production, use proper JWT signing
  // This is a placeholder - implement with jsonwebtoken or similar
  return DOORDASH_API_KEY;
}

// ============================================================================
// UBER EATS INTEGRATION
// ============================================================================

let uberAccessToken: string | null = null;
let uberTokenExpiry: number = 0;

/**
 * Get Uber API access token
 */
async function getUberToken(): Promise<string | null> {
  if (!UBER_CLIENT_ID || !UBER_CLIENT_SECRET) {
    return null;
  }

  // Return cached token if valid
  if (uberAccessToken && Date.now() < uberTokenExpiry) {
    return uberAccessToken;
  }

  try {
    const response = await fetch('https://login.uber.com/oauth/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: UBER_CLIENT_ID,
        client_secret: UBER_CLIENT_SECRET,
        grant_type: 'client_credentials',
        scope: 'eats.deliveries',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = (await response.json()) as { access_token: string; expires_in: number };
      uberAccessToken = data.access_token;
      uberTokenExpiry = Date.now() + data.expires_in * 1000 - 60000; // 1 min buffer
      return uberAccessToken;
    }
  } catch (error) {
    getLogger().error({ error }, 'Uber token fetch failed');
  }

  return null;
}

/**
 * Search restaurants on Uber Eats
 */
async function searchUberEats(
  query: string,
  address: DeliveryAddress
): Promise<DeliveryRestaurant[]> {
  const token = await getUberToken();

  if (token) {
    try {
      // Uber Eats API endpoint (simplified)
      const response = await fetch(
        `https://api.uber.com/v1/eats/stores?` +
          new URLSearchParams({
            query,
            latitude: '0', // Would need geocoding
            longitude: '0',
          }),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          stores?: Array<{
            store_id: string;
            title: string;
            hero_image_url?: string;
            categories?: Array<{ name: string }>;
            rating?: { rating_value: number; review_count: number };
            price_range?: string;
            eta_range?: { min: number; max: number };
          }>;
        };

        return (data.stores || []).map((store) => ({
          id: `ubereats_${store.store_id}`,
          platform: 'ubereats' as const,
          name: store.title,
          imageUrl: store.hero_image_url,
          cuisines: store.categories?.map((c) => c.name) || [],
          rating: store.rating?.rating_value,
          reviewCount: store.rating?.review_count,
          priceRange: store.price_range,
          deliveryTime: store.eta_range,
          isOpen: true,
          acceptsOrders: true,
          deepLink: `ubereats://store/${store.store_id}`,
        }));
      }
    } catch (error) {
      getLogger().warn({ error }, 'Uber Eats API error');
    }
  }

  // Fallback: Generate deep link
  const searchQuery = encodeURIComponent(query);
  const addressStr = encodeURIComponent(`${address.street}, ${address.city}, ${address.state}`);

  return [
    {
      id: 'ubereats_search',
      platform: 'ubereats',
      name: `Search "${query}" on Uber Eats`,
      cuisines: [],
      isOpen: true,
      acceptsOrders: true,
      deepLink: `ubereats://search?q=${searchQuery}`,
      menuUrl: `https://www.ubereats.com/search?q=${searchQuery}&pl=${addressStr}`,
    },
  ];
}

// ============================================================================
// UNIFIED SEARCH
// ============================================================================

/**
 * Search across all delivery platforms
 */
export async function searchDeliveryRestaurants(
  query: string,
  address: DeliveryAddress,
  platforms?: DeliveryPlatform[]
): Promise<DeliveryRestaurant[]> {
  const targetPlatforms = platforms || ['doordash', 'ubereats'];
  const results: DeliveryRestaurant[] = [];

  getLogger().info({ query, platforms: targetPlatforms }, '🍕 Searching delivery platforms');

  const searches = targetPlatforms.map(async (platform) => {
    switch (platform) {
      case 'doordash':
        return searchDoorDash(query, address);
      case 'ubereats':
        return searchUberEats(query, address);
      default:
        return [];
    }
  });

  const allResults = await Promise.all(searches);
  allResults.forEach((r) => results.push(...r));

  return results;
}

// ============================================================================
// ORDER BUILDING
// ============================================================================

// In-memory order storage
const activeOrders: Map<string, DeliveryOrder> = new Map();

/**
 * Start building an order
 */
export function startOrder(restaurant: DeliveryRestaurant): DeliveryOrder {
  const order: DeliveryOrder = {
    id: `order_${Date.now()}`,
    platform: restaurant.platform,
    restaurant,
    items: [],
    subtotal: 0,
    deliveryFee: restaurant.deliveryFee || 2.99,
    serviceFee: 0,
    tax: 0,
    total: 0,
    status: 'building',
  };

  activeOrders.set(order.id, order);
  return order;
}

/**
 * Add item to order
 */
export function addToOrder(
  orderId: string,
  item: MenuItem,
  quantity: number = 1,
  options?: {
    customizations?: Array<{ customizationId: string; optionIds: string[] }>;
    specialInstructions?: string;
  }
): DeliveryOrder | null {
  const order = activeOrders.get(orderId);
  if (!order) return null;

  order.items.push({
    menuItem: item,
    quantity,
    customizations: options?.customizations,
    specialInstructions: options?.specialInstructions,
  });

  recalculateOrder(order);
  return order;
}

/**
 * Remove item from order
 */
export function removeFromOrder(orderId: string, itemIndex: number): DeliveryOrder | null {
  const order = activeOrders.get(orderId);
  if (!order || itemIndex < 0 || itemIndex >= order.items.length) return null;

  order.items.splice(itemIndex, 1);
  recalculateOrder(order);
  return order;
}

/**
 * Recalculate order totals
 */
function recalculateOrder(order: DeliveryOrder): void {
  order.subtotal = order.items.reduce((sum, item) => {
    let itemTotal = item.menuItem.price * item.quantity;
    // Add customization costs
    if (item.customizations) {
      for (const custom of item.customizations) {
        const menuCustomization = item.menuItem.customizations?.find(
          (c) => c.id === custom.customizationId
        );
        if (menuCustomization) {
          for (const optionId of custom.optionIds) {
            const option = menuCustomization.options.find((o) => o.id === optionId);
            if (option) {
              itemTotal += option.price * item.quantity;
            }
          }
        }
      }
    }
    return sum + itemTotal;
  }, 0);

  order.serviceFee = Math.round(order.subtotal * 0.15 * 100) / 100; // ~15%
  order.tax = Math.round(order.subtotal * 0.0875 * 100) / 100; // ~8.75%
  order.total =
    order.subtotal + order.deliveryFee + order.serviceFee + order.tax + (order.tip || 0);
}

/**
 * Set tip amount
 */
export function setTip(orderId: string, tip: number): DeliveryOrder | null {
  const order = activeOrders.get(orderId);
  if (!order) return null;

  order.tip = tip;
  recalculateOrder(order);
  return order;
}

/**
 * Finalize order and get checkout URL
 */
export function finalizeOrder(orderId: string): DeliveryOrder | null {
  const order = activeOrders.get(orderId);
  if (!order) return null;

  order.status = 'ready';

  // Generate checkout URL/deep link based on platform
  switch (order.platform) {
    case 'doordash':
      order.deepLink = order.restaurant.deepLink;
      order.checkoutUrl = order.restaurant.menuUrl;
      break;
    case 'ubereats':
      order.deepLink = order.restaurant.deepLink;
      order.checkoutUrl = order.restaurant.menuUrl;
      break;
  }

  return order;
}

/**
 * Get order by ID
 */
export function getOrder(orderId: string): DeliveryOrder | undefined {
  return activeOrders.get(orderId);
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format restaurant for speech
 */
export function formatRestaurantForSpeech(restaurant: DeliveryRestaurant): string {
  const parts = [restaurant.name];

  if (restaurant.rating) {
    parts.push(`${restaurant.rating} stars`);
  }

  if (restaurant.deliveryTime) {
    parts.push(`${restaurant.deliveryTime.min}-${restaurant.deliveryTime.max} min delivery`);
  }

  if (restaurant.deliveryFee !== undefined) {
    parts.push(
      restaurant.deliveryFee === 0
        ? 'free delivery'
        : `$${restaurant.deliveryFee.toFixed(2)} delivery`
    );
  }

  return parts.join(' - ');
}

/**
 * Format order summary for speech
 */
export function formatOrderForSpeech(order: DeliveryOrder): string {
  if (order.items.length === 0) {
    return `Your order from ${order.restaurant.name} is empty.`;
  }

  const itemsList = order.items.map((item) => `${item.quantity}x ${item.menuItem.name}`).join(', ');

  return (
    `Your order from ${order.restaurant.name}: ${itemsList}. ` +
    `Subtotal $${order.subtotal.toFixed(2)}, ` +
    `with fees and tax your total is $${order.total.toFixed(2)}.`
  );
}

/**
 * Generate a message to send to user with order link
 */
export function getOrderCompletionMessage(order: DeliveryOrder): string {
  const platformName = {
    doordash: 'DoorDash',
    ubereats: 'Uber Eats',
    grubhub: 'Grubhub',
    postmates: 'Postmates',
  }[order.platform];

  return (
    `Ready to order from ${order.restaurant.name}! ` +
    `Here's your ${platformName} link to complete the order: ${order.checkoutUrl || order.deepLink}`
  );
}

// ============================================================================
// STATUS
// ============================================================================

/**
 * Check if delivery services are configured
 */
export function isDeliveryConfigured(): {
  doordash: boolean;
  ubereats: boolean;
  anyConfigured: boolean;
} {
  const doordash = !!(DOORDASH_API_KEY || DOORDASH_DEVELOPER_ID);
  const ubereats = !!(UBER_CLIENT_ID && UBER_CLIENT_SECRET);

  return {
    doordash,
    ubereats,
    anyConfigured: doordash || ubereats,
  };
}

export default {
  searchDeliveryRestaurants,
  startOrder,
  addToOrder,
  removeFromOrder,
  setTip,
  finalizeOrder,
  getOrder,
  formatRestaurantForSpeech,
  formatOrderForSpeech,
  getOrderCompletionMessage,
  isDeliveryConfigured,
  createDoorDashDelivery,
};
