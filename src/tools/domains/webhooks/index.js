/**
 * Webhook Tools
 *
 * Voice-controlled automation triggers for IFTTT, Zapier,
 * Home Assistant, Siri Shortcuts, and custom webhooks.
 *
 * Examples:
 * - "Run my bedtime routine"
 * - "Trigger the lights off webhook"
 * - "What automations do I have?"
 * - "Did my morning routine work?"
 *
 * @module tools/webhooks
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { executeWebhook, findWebhookByTrigger, getWebhookStats, listWebhooks, } from '../../../services/webhooks/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
const log = createLogger({ module: 'webhook-tools' });
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
/**
 * Trigger Webhook Tool
 *
 * Triggers a webhook by name or voice phrase.
 * Used for: "Run my bedtime routine", "Trigger goodnight"
 */
const triggerWebhookDef = {
    id: 'triggerWebhook',
    name: 'Trigger Webhook',
    description: 'Trigger a webhook automation by name or voice phrase',
    domain: 'webhooks',
    tags: ['automation', 'webhook', 'smart-home', 'ifttt', 'zapier'],
    create: (ctx) => {
        return llm.tool({
            description: `Trigger a webhook automation. Use when the user says things like:
- "Run my [name] routine/automation"
- "Trigger [name]"
- "Do my [name] webhook"
- "Execute [name]"

The phrase parameter should be the user's intent or webhook name.`,
            parameters: z.object({
                phrase: z.string().describe('The webhook name or trigger phrase from the user'),
                transcript: z.string().optional().describe('The full user transcript for context'),
            }),
            execute: async ({ phrase, transcript }) => {
                const userId = ctx.userId;
                if (!userId) {
                    return "I can't run webhooks without knowing who you are. Please sign in first.";
                }
                try {
                    // Find webhook matching the phrase
                    const webhook = await findWebhookByTrigger(userId, phrase);
                    if (!webhook) {
                        log.debug({ userId, phrase }, 'No webhook found for phrase');
                        return `I don't have a webhook matching "${phrase}". You can set up webhooks in your settings.`;
                    }
                    if (!webhook.enabled) {
                        return `Your "${webhook.name}" webhook is currently disabled. Enable it in settings to use it.`;
                    }
                    // Execute the webhook
                    const result = await executeWebhook(userId, webhook, 'voice', {
                        transcript,
                        personaId: ctx.agentId,
                    });
                    if (result.success) {
                        log.info({ userId, webhookId: webhook.id, webhookName: webhook.name }, 'Webhook triggered via voice');
                        return `Done! I triggered your "${webhook.name}" automation.`;
                    }
                    else {
                        log.warn({ userId, webhookId: webhook.id, error: result.error }, 'Webhook trigger failed');
                        if (result.error?.includes('Rate limit')) {
                            return "You've used a lot of automations recently. Try again in a bit.";
                        }
                        if (result.error?.includes('wait')) {
                            return result.error; // Cooldown message
                        }
                        return `I tried to run "${webhook.name}" but it didn't work. ${result.error || 'Check your webhook settings.'}`;
                    }
                }
                catch (error) {
                    log.error({ userId, phrase, error: String(error) }, 'Error triggering webhook');
                    return 'Something went wrong trying to trigger that automation. Try again?';
                }
            },
        });
    },
};
/**
 * List Webhooks Tool
 *
 * Lists available webhooks for the user.
 * Used for: "What automations do I have?", "List my webhooks"
 */
const listWebhooksDef = {
    id: 'listWebhooks',
    name: 'List Webhooks',
    description: 'List all configured webhook automations',
    domain: 'webhooks',
    tags: ['automation', 'webhook', 'list'],
    create: (ctx) => {
        return llm.tool({
            description: `List the user's webhook automations. Use when they ask:
- "What automations do I have?"
- "List my webhooks"
- "What routines are set up?"
- "Show my automations"`,
            parameters: z.object({
                includeDisabled: z.boolean().optional().describe('Include disabled webhooks in the list'),
            }),
            execute: async ({ includeDisabled }) => {
                const userId = ctx.userId;
                if (!userId) {
                    return "I can't show your webhooks without knowing who you are. Please sign in first.";
                }
                try {
                    const result = await listWebhooks(userId);
                    if (!result.success || !result.data) {
                        return "I couldn't load your webhooks. Try again?";
                    }
                    const { webhooks } = result.data;
                    if (webhooks.length === 0) {
                        return "You don't have any webhooks set up yet. You can add them in your settings to automate things like IFTTT, Zapier, or Home Assistant.";
                    }
                    // Filter if needed
                    const filtered = includeDisabled
                        ? webhooks
                        : webhooks.filter((w) => w.enabled);
                    if (filtered.length === 0) {
                        return `You have ${webhooks.length} webhooks but they're all disabled. Enable them in settings to use them.`;
                    }
                    // Format the list
                    const lines = filtered.map((w) => {
                        const status = w.enabled ? '' : ' (disabled)';
                        const triggers = w.voiceTriggers.slice(0, 2).join(', ');
                        return `• ${w.name}${status} - say "${triggers}"`;
                    });
                    const header = filtered.length === 1
                        ? "Here's your webhook:"
                        : `Here are your ${filtered.length} webhooks:`;
                    return `${header}\n\n${lines.join('\n')}`;
                }
                catch (error) {
                    log.error({ userId, error: String(error) }, 'Error listing webhooks');
                    return 'Something went wrong loading your webhooks. Try again?';
                }
            },
        });
    },
};
/**
 * Get Webhook Status Tool
 *
 * Gets the status of the last webhook execution.
 * Used for: "Did my bedtime routine work?", "What was the last automation?"
 */
const getWebhookStatusDef = {
    id: 'getWebhookStatus',
    name: 'Get Webhook Status',
    description: 'Get the status and stats of webhook automations',
    domain: 'webhooks',
    tags: ['automation', 'webhook', 'status'],
    create: (ctx) => {
        return llm.tool({
            description: `Get webhook status and statistics. Use when the user asks:
- "Did my [name] work?"
- "What's the status of my webhooks?"
- "How are my automations doing?"
- "Any webhook issues?"`,
            parameters: z.object({
                webhookName: z.string().optional().describe('Specific webhook name to check'),
            }),
            execute: async ({ webhookName }) => {
                const userId = ctx.userId;
                if (!userId) {
                    return "I can't check your webhook status without knowing who you are. Please sign in first.";
                }
                try {
                    // If specific webhook requested, find it
                    if (webhookName) {
                        const webhook = await findWebhookByTrigger(userId, webhookName);
                        if (!webhook) {
                            return `I don't have a webhook matching "${webhookName}".`;
                        }
                        const total = webhook.successCount + webhook.failureCount;
                        const successRate = total > 0 ? Math.round((webhook.successCount / total) * 100) : 0;
                        let status = `**${webhook.name}**\n`;
                        status += `• Status: ${webhook.enabled ? 'Enabled' : 'Disabled'}\n`;
                        status += `• Runs: ${total} total (${successRate}% success)\n`;
                        if (webhook.lastTriggeredAt) {
                            const lastRun = new Date(webhook.lastTriggeredAt);
                            const ago = getTimeAgo(lastRun);
                            status += `• Last run: ${ago}`;
                        }
                        else {
                            status += '• Never run yet';
                        }
                        return status;
                    }
                    // Overall stats
                    const stats = await getWebhookStats(userId);
                    if (stats.totalWebhooks === 0) {
                        return "You don't have any webhooks set up yet.";
                    }
                    let response = `**Webhook Summary**\n`;
                    response += `• ${stats.enabledWebhooks} of ${stats.totalWebhooks} webhooks enabled\n`;
                    response += `• ${stats.totalExecutions} total runs (${Math.round(stats.successRate * 100)}% success)\n`;
                    if (stats.lastExecutionAt) {
                        const lastRun = new Date(stats.lastExecutionAt);
                        const ago = getTimeAgo(lastRun);
                        response += `• Last activity: ${ago}`;
                    }
                    return response;
                }
                catch (error) {
                    log.error({ userId, error: String(error) }, 'Error getting webhook status');
                    return 'Something went wrong checking your webhook status. Try again?';
                }
            },
        });
    },
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Get human-readable time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1)
        return 'just now';
    if (diffMins < 60)
        return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7)
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    return date.toLocaleDateString();
}
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
const definitions = [triggerWebhookDef, listWebhooksDef, getWebhookStatusDef];
export const { getToolDefinitions, domain } = createDomainExport('webhooks', definitions);
export { definitions };
//# sourceMappingURL=index.js.map