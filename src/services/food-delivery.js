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
import { getFirestoreDatabase, getGCPProjectId } from '../config/environment.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { getLogger } from '../utils/safe-logger.js';
import { runBackground, runBackgroundBatch } from '../utils/background-task.js';
// Circuit breakers for food delivery APIs
const doorDashCircuitBreaker = getCircuitBreaker('doordash-api', {
    failureThreshold: 5,
    resetTimeout: 120_000, // 2 minutes
    successThreshold: 2,
});
const uberCircuitBreaker = getCircuitBreaker('uber-eats-api', {
    failureThreshold: 5,
    resetTimeout: 120_000, // 2 minutes
    successThreshold: 2,
});
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
async function searchDoorDash(query, address) {
    // If API configured, use it
    if (DOORDASH_API_KEY && DOORDASH_DEVELOPER_ID) {
        try {
            // DoorDash Drive API endpoint
            const response = await doorDashCircuitBreaker.execute(async () => fetch('https://openapi.doordash.com/drive/v2/stores', {
                headers: {
                    Authorization: `Bearer ${DOORDASH_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(10000),
            }));
            if (response.ok) {
                const data = (await response.json());
                return (data.stores || []).map((store) => ({
                    id: `doordash_${store.external_store_id}`,
                    platform: 'doordash',
                    name: store.name,
                    cuisines: [],
                    isOpen: true,
                    acceptsOrders: true,
                    deepLink: `doordash://store/${store.external_store_id}`,
                }));
            }
        }
        catch (error) {
            getLogger().warn({ error }, 'DoorDash API error');
        }
    }
    // Fallback: Generate deep link for search
    const searchQuery = encodeURIComponent(query);
    const addressStr = encodeURIComponent(`${address.street}, ${address.city}, ${address.state} ${address.zipCode}`);
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
async function createDoorDashDelivery(order) {
    if (!DOORDASH_DEVELOPER_ID || !DOORDASH_KEY_ID || !DOORDASH_SIGNING_SECRET) {
        return { success: false, error: 'DoorDash Drive API not configured' };
    }
    try {
        // Create JWT for authentication
        const jwt = await createDoorDashJWT();
        const response = await doorDashCircuitBreaker.execute(async () => fetch('https://openapi.doordash.com/drive/v2/deliveries', {
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
        }));
        if (response.ok) {
            const data = (await response.json());
            return {
                success: true,
                deliveryId: data.external_delivery_id,
                trackingUrl: data.tracking_url,
            };
        }
        else {
            const error = (await response.json());
            return { success: false, error: error.message || 'DoorDash API error' };
        }
    }
    catch (error) {
        getLogger().error({ error }, 'DoorDash delivery creation failed');
        return { success: false, error: 'Failed to create delivery' };
    }
}
async function createDoorDashJWT() {
    // DoorDash Drive API requires JWT signed with RS256
    // See: https://developer.doordash.com/en-US/docs/drive/reference/authentication
    if (!DOORDASH_DEVELOPER_ID || !DOORDASH_KEY_ID || !DOORDASH_SIGNING_SECRET) {
        throw new Error('DoorDash credentials not configured');
    }
    const crypto = await import('crypto');
    // JWT Header
    const header = {
        alg: 'HS256',
        typ: 'JWT',
        'dd-ver': 'DD-JWT-V1',
    };
    // JWT Payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        aud: 'doordash',
        iss: DOORDASH_DEVELOPER_ID,
        kid: DOORDASH_KEY_ID,
        iat: now,
        exp: now + 300, // 5 minutes expiry
    };
    // Base64URL encode
    const base64url = (data) => {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return Buffer.from(str)
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    };
    const encodedHeader = base64url(header);
    const encodedPayload = base64url(payload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    // Sign with HMAC-SHA256 using the signing secret
    // DoorDash signing secret is base64-encoded, so decode it first
    const decodedSecret = Buffer.from(DOORDASH_SIGNING_SECRET, 'base64');
    const hmac = crypto.createHmac('sha256', decodedSecret);
    hmac.update(signingInput);
    const signature = hmac.digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${signingInput}.${signature}`;
}
// ============================================================================
// UBER EATS INTEGRATION
// ============================================================================
let uberAccessToken = null;
let uberTokenExpiry = 0;
/**
 * Get Uber API access token
 */
async function getUberToken() {
    if (!UBER_CLIENT_ID || !UBER_CLIENT_SECRET) {
        return null;
    }
    // Return cached token if valid
    if (uberAccessToken && Date.now() < uberTokenExpiry) {
        return uberAccessToken;
    }
    try {
        const response = await uberCircuitBreaker.execute(async () => fetch('https://login.uber.com/oauth/v2/token', {
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
        }));
        if (response.ok) {
            const data = (await response.json());
            uberAccessToken = data.access_token;
            uberTokenExpiry = Date.now() + data.expires_in * 1000 - 60000; // 1 min buffer
            return uberAccessToken;
        }
    }
    catch (error) {
        getLogger().error({ error }, 'Uber token fetch failed');
    }
    return null;
}
/**
 * Search restaurants on Uber Eats
 */
async function searchUberEats(query, address) {
    const token = await getUberToken();
    if (token) {
        try {
            // Uber Eats API endpoint (simplified)
            const response = await fetch(`https://api.uber.com/v1/eats/stores?${new URLSearchParams({
                query,
                latitude: '0', // Would need geocoding
                longitude: '0',
            })}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(10000),
            });
            if (response.ok) {
                const data = (await response.json());
                return (data.stores || []).map((store) => ({
                    id: `ubereats_${store.store_id}`,
                    platform: 'ubereats',
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
        }
        catch (error) {
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
export async function searchDeliveryRestaurants(query, address, platforms) {
    const targetPlatforms = platforms || ['doordash', 'ubereats'];
    const results = [];
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
// FIRESTORE SETUP
// ============================================================================
let db = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise = null;
const DELIVERY_ORDERS_COLLECTION = 'delivery_orders';
const ORDER_HISTORY_COLLECTION = 'delivery_order_history';
async function getFirestore() {
    if (db)
        return db;
    if (dbInitPromise)
        return dbInitPromise;
    dbInitPromise = initializeFirestore();
    return dbInitPromise;
}
async function initializeFirestore() {
    try {
        const { Firestore } = await import('@google-cloud/firestore');
        db = new Firestore({
            projectId: getGCPProjectId(),
            databaseId: getFirestoreDatabase(),
        });
        getLogger().info('Food delivery service Firestore initialized');
        return db;
    }
    catch (error) {
        getLogger().warn({ error }, 'Firestore not available for food delivery, using in-memory only');
        dbInitPromise = null; // Allow retry
        return null;
    }
}
// ============================================================================
// ORDER BUILDING (In-memory cache with Firestore persistence)
// ============================================================================
const activeOrders = new Map();
/**
 * Persist order to Firestore
 */
async function persistOrder(order, userId) {
    const firestore = await getFirestore();
    if (firestore && userId) {
        try {
            await firestore
                .collection(DELIVERY_ORDERS_COLLECTION)
                .doc(order.id)
                .set(removeUndefined({
                ...order,
                userId,
                updatedAt: new Date(),
            }));
        }
        catch (err) {
            getLogger().warn({ err, orderId: order.id }, 'Failed to persist delivery order');
        }
    }
}
/**
 * Save completed order to history
 */
async function saveOrderToHistory(order, userId) {
    const firestore = await getFirestore();
    if (firestore) {
        try {
            await firestore.collection(ORDER_HISTORY_COLLECTION).add(removeUndefined({
                ...order,
                userId,
                completedAt: new Date(),
            }));
            getLogger().info({ orderId: order.id, userId }, 'Saved order to history');
        }
        catch (err) {
            getLogger().warn({ err, orderId: order.id }, 'Failed to save order to history');
        }
    }
}
/**
 * Get user's order history
 */
export async function getOrderHistory(userId, limit = 10) {
    const firestore = await getFirestore();
    if (!firestore)
        return [];
    try {
        const snapshot = await firestore
            .collection(ORDER_HISTORY_COLLECTION)
            .where('userId', '==', userId)
            .orderBy('completedAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
            };
        });
    }
    catch (err) {
        getLogger().warn({ err, userId }, 'Failed to get order history');
        return [];
    }
}
// Track order ownership for persistence
const orderUserMap = new Map();
/**
 * Start building an order
 */
export function startOrder(restaurant, userId) {
    const order = {
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
    if (userId) {
        orderUserMap.set(order.id, userId);
        runBackground(persistOrder(order, userId), {
            task: 'persistOrder',
            orderId: order.id,
            userId,
        });
    }
    return order;
}
/**
 * Add item to order
 */
export function addToOrder(orderId, item, quantity = 1, options) {
    const order = activeOrders.get(orderId);
    if (!order)
        return null;
    order.items.push({
        menuItem: item,
        quantity,
        customizations: options?.customizations,
        specialInstructions: options?.specialInstructions,
    });
    recalculateOrder(order);
    // Persist changes
    const userId = orderUserMap.get(orderId);
    if (userId) {
        runBackground(persistOrder(order, userId), {
            task: 'persistOrder',
            orderId,
            userId,
            operation: 'addItem',
        });
    }
    return order;
}
/**
 * Remove item from order
 */
export function removeFromOrder(orderId, itemIndex) {
    const order = activeOrders.get(orderId);
    if (!order || itemIndex < 0 || itemIndex >= order.items.length)
        return null;
    order.items.splice(itemIndex, 1);
    recalculateOrder(order);
    return order;
}
/**
 * Recalculate order totals
 */
function recalculateOrder(order) {
    order.subtotal = order.items.reduce((sum, item) => {
        let itemTotal = item.menuItem.price * item.quantity;
        // Add customization costs
        if (item.customizations) {
            for (const custom of item.customizations) {
                const menuCustomization = item.menuItem.customizations?.find((c) => c.id === custom.customizationId);
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
export function setTip(orderId, tip) {
    const order = activeOrders.get(orderId);
    if (!order)
        return null;
    order.tip = tip;
    recalculateOrder(order);
    return order;
}
/**
 * Finalize order and get checkout URL
 */
export function finalizeOrder(orderId) {
    const order = activeOrders.get(orderId);
    if (!order)
        return null;
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
    // Save to order history
    const userId = orderUserMap.get(orderId);
    if (userId) {
        runBackgroundBatch([saveOrderToHistory(order, userId), persistOrder(order, userId)], {
            task: 'saveCompletedOrder',
            orderId,
            userId,
        });
    }
    return order;
}
/**
 * Get order by ID
 */
export function getOrder(orderId) {
    return activeOrders.get(orderId);
}
// ============================================================================
// FORMATTING
// ============================================================================
/**
 * Format restaurant for speech
 */
export function formatRestaurantForSpeech(restaurant) {
    const parts = [restaurant.name];
    if (restaurant.rating) {
        parts.push(`${restaurant.rating} stars`);
    }
    if (restaurant.deliveryTime) {
        parts.push(`${restaurant.deliveryTime.min}-${restaurant.deliveryTime.max} min delivery`);
    }
    if (restaurant.deliveryFee !== undefined) {
        parts.push(restaurant.deliveryFee === 0
            ? 'free delivery'
            : `$${restaurant.deliveryFee.toFixed(2)} delivery`);
    }
    return parts.join(' - ');
}
/**
 * Format order summary for speech
 */
export function formatOrderForSpeech(order) {
    if (order.items.length === 0) {
        return `Your order from ${order.restaurant.name} is empty.`;
    }
    const itemsList = order.items.map((item) => `${item.quantity}x ${item.menuItem.name}`).join(', ');
    return (`Your order from ${order.restaurant.name}: ${itemsList}. ` +
        `Subtotal $${order.subtotal.toFixed(2)}, ` +
        `with fees and tax your total is $${order.total.toFixed(2)}.`);
}
/**
 * Generate a message to send to user with order link
 */
export function getOrderCompletionMessage(order) {
    const platformName = {
        doordash: 'DoorDash',
        ubereats: 'Uber Eats',
        grubhub: 'Grubhub',
        postmates: 'Postmates',
    }[order.platform];
    return (`Ready to order from ${order.restaurant.name}! ` +
        `Here's your ${platformName} link to complete the order: ${order.checkoutUrl || order.deepLink}`);
}
// ============================================================================
// STATUS
// ============================================================================
/**
 * Check if delivery services are configured
 */
export function isDeliveryConfigured() {
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
//# sourceMappingURL=food-delivery.js.map