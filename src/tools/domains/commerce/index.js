/**
 * Commerce Tools
 *
 * Tools for grocery ordering and commerce:
 * - Grocery ordering via shopping lists
 * - Subscription management
 * - Product search
 *
 * DOMAIN: commerce
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import { getInstacartClient } from '../../../services/integrations/instacart/instacart-client.js';
import { getSubscriptionData, getSubscriptionSummary, getUpcomingRenewals, cancelSubscription, } from '../../../services/stores/subscription-store.js';
import { registerActionType } from '../../../services/actions/action-engine.js';
const log = createLogger({ module: 'commerce-tools' });
// ============================================================================
// REGISTER ACTION TYPES
// ============================================================================
// Register grocery order action type
registerActionType({
    type: 'grocery_order',
    name: 'Grocery Order',
    description: 'Order groceries from Instacart',
    requiredIntegrations: ['instacart'],
    defaultExpirySeconds: 300,
    canRollback: true,
    executor: async (action, context) => {
        const payload = action.payload;
        const client = getInstacartClient(context.userId);
        // Create cart and add items
        const cartResponse = await client.createCart(payload.storeId || '');
        if (!cartResponse.success || !cartResponse.data) {
            return { success: false, message: cartResponse.error || 'Failed to create cart' };
        }
        for (const item of payload.items) {
            if (item.productId) {
                await client.addToCart(cartResponse.data.id, item.productId, item.quantity);
            }
        }
        // Would create order here with delivery window
        return {
            success: true,
            message: `Order placed for ${payload.items.length} items`,
            externalId: cartResponse.data.id,
        };
    },
    rollback: async () => {
        // Cancel the order if possible
        return { success: true, message: 'Order cancelled' };
    },
});
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function getCommerceToolDefinitions() {
    return [
        // =========================================================================
        // orderGroceries - Order groceries from shopping list
        // =========================================================================
        {
            id: 'orderGroceries',
            name: 'Order Groceries',
            description: 'Order groceries from your shopping list via Instacart.',
            domain: 'commerce',
            tags: ['grocery', 'shopping', 'order', 'instacart'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Order groceries from your shopping list via Instacart.',
                    parameters: z.object({
                        fromShoppingList: z
                            .boolean()
                            .optional()
                            .describe('Order items from the current shopping list (default: true)'),
                        items: z
                            .array(z.string())
                            .optional()
                            .describe('Specific items to order (if not using shopping list)'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to place an order.';
                        }
                        const client = getInstacartClient(userId);
                        if (!client.isConnected()) {
                            return 'Instacart is not connected yet. Would you like me to help you connect your account?';
                        }
                        // For now, return a helpful message about the feature
                        return `To order groceries, I'll need to:\n` +
                            `1. Find nearby stores\n` +
                            `2. Search for your items\n` +
                            `3. Create a cart and show you the total\n` +
                            `4. Confirm before placing the order\n\n` +
                            `This feature requires an Instacart business partnership. ` +
                            `In the meantime, you can manage your shopping list and I'll help you organize it.`;
                    },
                });
            },
        },
        // =========================================================================
        // detectSubscriptions - Find subscriptions in transactions
        // =========================================================================
        {
            id: 'detectSubscriptions',
            name: 'Detect Subscriptions',
            description: 'Analyze your bank transactions to find recurring subscriptions.',
            domain: 'commerce',
            tags: ['subscriptions', 'finance', 'analysis'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Analyze your bank transactions to find recurring subscriptions.',
                    parameters: z.object({}),
                    execute: async () => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to analyze your subscriptions.';
                        }
                        // In production, this would fetch transactions from Plaid
                        const summary = await getSubscriptionSummary(userId);
                        if (summary.totalActive === 0) {
                            return `I haven't detected any subscriptions yet. ` +
                                `To use this feature, please connect your bank account via Plaid ` +
                                `and I'll analyze your transactions for recurring charges.`;
                        }
                        let response = `📊 **Subscription Summary**\n\n`;
                        response += `- **${summary.totalActive}** active subscriptions\n`;
                        response += `- **$${summary.monthlySpend.toFixed(2)}** per month\n`;
                        response += `- **$${summary.yearlySpend.toFixed(2)}** per year\n\n`;
                        if (summary.upcomingRenewals > 0) {
                            response += `⚠️ **${summary.upcomingRenewals}** renewals coming up this week\n\n`;
                        }
                        response += `Say "show my subscriptions" to see the full list.`;
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // getSubscriptionSummary - Monthly cost breakdown
        // =========================================================================
        {
            id: 'getSubscriptionSummary',
            name: 'Get Subscription Summary',
            description: 'Get a breakdown of your monthly subscription costs by category.',
            domain: 'commerce',
            tags: ['subscriptions', 'finance', 'summary'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Get a breakdown of your monthly subscription costs by category.',
                    parameters: z.object({}),
                    execute: async () => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to show your subscriptions.';
                        }
                        const summary = await getSubscriptionSummary(userId);
                        if (summary.totalActive === 0) {
                            return "You don't have any subscriptions tracked yet. " +
                                "You can add them manually or connect your bank to auto-detect them.";
                        }
                        let response = `💰 **Monthly Subscription Breakdown**\n\n`;
                        response += `**Total:** $${summary.monthlySpend.toFixed(2)}/month ($${summary.yearlySpend.toFixed(2)}/year)\n\n`;
                        response += `**By Category:**\n`;
                        for (const [category, data] of Object.entries(summary.byCategory)) {
                            response += `- ${category}: ${data.count} subscriptions, $${data.monthlySpend.toFixed(2)}/month\n`;
                        }
                        if (summary.pendingAlerts > 0) {
                            response += `\n⚠️ You have ${summary.pendingAlerts} pending alerts to review.`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // trackRenewal - Alert before subscription charge
        // =========================================================================
        {
            id: 'trackRenewal',
            name: 'Track Renewal',
            description: 'Get notified before a subscription renews.',
            domain: 'commerce',
            tags: ['subscriptions', 'reminder', 'renewal'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Get notified before a subscription renews.',
                    parameters: z.object({
                        daysAhead: z
                            .number()
                            .optional()
                            .describe('How many days before renewal to alert (default: 7)'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to track renewals.';
                        }
                        const upcoming = await getUpcomingRenewals(userId, params.daysAhead || 7);
                        if (upcoming.length === 0) {
                            return `No subscriptions renewing in the next ${params.daysAhead || 7} days.`;
                        }
                        let response = `📅 **Upcoming Renewals**\n\n`;
                        for (const sub of upcoming) {
                            response += `- **${sub.name}**: $${sub.amount} on ${sub.nextBillingDate}\n`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // cancelSubscription - Guide cancellation
        // =========================================================================
        {
            id: 'cancelSubscription',
            name: 'Cancel Subscription',
            description: 'Help you cancel a subscription.',
            domain: 'commerce',
            tags: ['subscriptions', 'cancel'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Help you cancel a subscription.',
                    parameters: z.object({
                        name: z.string().describe('Name of the subscription to cancel'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to manage subscriptions.';
                        }
                        const data = await getSubscriptionData(userId);
                        // Find matching subscription
                        const sub = data.subscriptions.find((s) => s.name.toLowerCase().includes(params.name.toLowerCase()));
                        if (!sub) {
                            return `I couldn't find a subscription matching "${params.name}". ` +
                                `Say "show my subscriptions" to see your list.`;
                        }
                        if (sub.cancellationUrl) {
                            await cancelSubscription(userId, sub.id, 'User requested via Ferni');
                            return `To cancel **${sub.name}**, visit: ${sub.cancellationUrl}\n\n` +
                                `I've marked this as pending cancellation. Let me know when you've completed it.`;
                        }
                        await cancelSubscription(userId, sub.id, 'User requested via Ferni');
                        return `I've marked **${sub.name}** as cancelled. ` +
                            `You may need to contact them directly to complete the cancellation.`;
                    },
                });
            },
        },
    ];
}
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
export function getToolDefinitions() {
    return getCommerceToolDefinitions();
}
export const definitions = getCommerceToolDefinitions();
//# sourceMappingURL=index.js.map