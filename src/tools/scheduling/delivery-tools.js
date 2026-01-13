/**
 * Delivery & Tracking Tools
 *
 * LLM-callable tools for package tracking and delivery management.
 *
 * @module scheduling/delivery-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getToolDescription } from '../utils/tool-descriptions.js';
import { searchDeliveryRestaurants, formatRestaurantForSpeech as formatDeliveryRestaurant, startOrder, addToOrder, getOrder, finalizeOrder, formatOrderForSpeech, getOrderCompletionMessage, } from '../../services/food-delivery.js';
export function createDeliveryTools() {
    return {
        // ========== SEARCH DELIVERY ==========
        searchFoodDelivery: llm.tool({
            description: getToolDescription('searchFoodDelivery'),
            parameters: z.object({
                query: z.string().describe('What to search for (e.g., "pizza", "Thai food", "McDonalds")'),
                street: z.string().describe('Delivery address street'),
                city: z.string().describe('City'),
                state: z.string().describe('State abbreviation'),
                zipCode: z.string().describe('ZIP code'),
                platform: z
                    .enum(['doordash', 'ubereats', 'both'])
                    .default('both')
                    .describe('Which delivery app to use'),
            }),
            execute: async ({ query, street, city, state, zipCode, platform }) => {
                const address = { street, city, state, zipCode };
                const platforms = platform === 'both' ? undefined : [platform];
                const results = await searchDeliveryRestaurants(query, address, platforms);
                if (results.length === 0) {
                    return `I couldn't find "${query}" for delivery to ${city}. Try a different search or check if the address is correct?`;
                }
                const formatted = results
                    .slice(0, 5)
                    .map((r, i) => `${i + 1}. ${formatDeliveryRestaurant(r)} (${r.platform})`)
                    .join('\n');
                return `🍕 Found ${results.length} option${results.length > 1 ? 's' : ''} for "${query}":\n\n${formatted}\n\nWhich one would you like? I can help you order!`;
            },
        }),
        // ========== START ORDER ==========
        startFoodOrder: llm.tool({
            description: getToolDescription('startFoodOrder'),
            parameters: z.object({
                restaurantName: z.string().describe('Name of the restaurant'),
                platform: z.enum(['doordash', 'ubereats']).describe('Which delivery app'),
            }),
            execute: async ({ restaurantName, platform }) => {
                // Create a basic restaurant object for the order
                const restaurant = {
                    id: `${platform}_${Date.now()}`,
                    platform: platform,
                    name: restaurantName,
                    cuisines: [],
                    isOpen: true,
                    acceptsOrders: true,
                    deliveryFee: 2.99,
                };
                const order = startOrder(restaurant);
                return (`🛒 Started your order from ${restaurantName} on ${platform === 'doordash' ? 'DoorDash' : 'Uber Eats'}! ` +
                    `Order ID: ${order.id}\n\n` +
                    `What would you like to order? Just tell me the items and quantities!`);
            },
        }),
        // ========== ADD TO ORDER ==========
        addItemToOrder: llm.tool({
            description: getToolDescription('addItemToOrder'),
            parameters: z.object({
                orderId: z.string().describe('The order ID from startFoodOrder'),
                itemName: z.string().describe('Name of the menu item'),
                price: z.number().describe('Price of the item'),
                quantity: z.number().default(1).describe('How many'),
                specialInstructions: z.string().optional().describe('Special requests like "no onions"'),
            }),
            execute: async ({ orderId, itemName, price, quantity, specialInstructions }) => {
                const menuItem = {
                    id: `item_${Date.now()}`,
                    name: itemName,
                    price,
                    category: 'entree',
                };
                const order = addToOrder(orderId, menuItem, quantity, { specialInstructions });
                if (!order) {
                    return `I couldn't find that order. Let me start a new one for you.`;
                }
                return (`Added ${quantity}x ${itemName} ($${(price * quantity).toFixed(2)}) to your order!\n\n` +
                    `Current total: $${order.subtotal.toFixed(2)} (+ fees)\n` +
                    `Want to add anything else, or should we checkout?`);
            },
        }),
        // ========== CHECKOUT ==========
        checkoutOrder: llm.tool({
            description: getToolDescription('checkoutOrder'),
            parameters: z.object({
                orderId: z.string().describe('The order ID'),
                tip: z.number().optional().describe('Tip amount in dollars'),
            }),
            execute: async ({ orderId, tip }, { ctx }) => {
                let order = getOrder(orderId);
                if (!order) {
                    return `I couldn't find that order. Did you want to start a new one?`;
                }
                // Set tip if provided
                if (tip !== undefined) {
                    const { setTip } = await import('../../services/food-delivery.js');
                    setTip(orderId, tip);
                    order = getOrder(orderId);
                }
                // Finalize
                const finalizedOrder = finalizeOrder(orderId);
                if (!finalizedOrder) {
                    return `Something went wrong finalizing the order. Let me try again.`;
                }
                order = finalizedOrder;
                const summary = formatOrderForSpeech(order);
                const _checkoutMsg = getOrderCompletionMessage(order); // Reserved for future checkout flow
                // Try to send link to user
                const userData = ctx?.userData;
                const phone = userData?.userProfile?.contactInfo?.phone;
                let response = `🎉 Your order is ready!\n\n${summary}\n\n`;
                if (order.checkoutUrl) {
                    response += `Here's your link to complete the order:\n${order.checkoutUrl}\n\n`;
                }
                if (order.deepLink) {
                    response += `Or open in the app: ${order.deepLink}\n\n`;
                }
                if (phone) {
                    response += `I can also text you this link if you'd like!`;
                }
                return response;
            },
        }),
        // ========== ORDER STATUS ==========
        getOrderStatus: llm.tool({
            description: getToolDescription('getOrderStatus'),
            parameters: z.object({
                orderId: z.string().describe('The order ID'),
            }),
            execute: async ({ orderId }) => {
                const order = getOrder(orderId);
                if (!order) {
                    return `I couldn't find order ${orderId}. It may have expired.`;
                }
                return formatOrderForSpeech(order);
            },
        }),
        // ========== QUICK ORDER (common items) ==========
        quickFoodOrder: llm.tool({
            description: getToolDescription('quickFoodOrder'),
            parameters: z.object({
                foodType: z.string().describe('Type of food (pizza, Chinese, burgers, etc.)'),
                street: z.string().describe('Delivery address street'),
                city: z.string().describe('City'),
                state: z.string().describe('State abbreviation'),
                zipCode: z.string().describe('ZIP code'),
                platform: z
                    .enum(['doordash', 'ubereats'])
                    .default('doordash')
                    .describe('Preferred delivery app'),
            }),
            execute: async ({ foodType, street, city, state, zipCode, platform }) => {
                const address = { street, city, state, zipCode };
                const results = await searchDeliveryRestaurants(foodType, address, [platform]);
                if (results.length === 0) {
                    return `I couldn't find ${foodType} for delivery to ${city}. Want to try a different type of food?`;
                }
                const best = results[0];
                // Generate direct link
                const platformName = platform === 'doordash' ? 'DoorDash' : 'Uber Eats';
                let response = `🍕 Found ${best.name} for ${foodType}!\n\n`;
                if (best.rating)
                    response += `⭐ ${best.rating} stars\n`;
                if (best.deliveryTime)
                    response += `🕐 ${best.deliveryTime.min}-${best.deliveryTime.max} min delivery\n`;
                if (best.deliveryFee !== undefined)
                    response += `💰 $${best.deliveryFee.toFixed(2)} delivery fee\n`;
                response += `\n`;
                if (best.menuUrl) {
                    response += `Order here: ${best.menuUrl}\n`;
                }
                if (best.deepLink) {
                    response += `Or open in ${platformName}: ${best.deepLink}\n`;
                }
                response += `\nWant me to text you this link?`;
                return response;
            },
        }),
    };
}
// ============================================================================
// GOOGLE PLACES / PHONE LOOKUP TOOLS
//# sourceMappingURL=delivery-tools.js.map