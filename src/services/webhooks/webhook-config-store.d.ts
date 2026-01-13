/**
 * Webhook Config Store
 *
 * Firestore persistence for webhook configurations.
 * Uses in-memory cache with Firestore persistence.
 */
import type { CreateSiriTokenInput, CreateSiriTokenResult, CreateWebhookInput, ListWebhooksResult, SiriToken, UpdateWebhookInput, WebhookConfig, WebhookServiceResult, WebhookStats } from './types.js';
/**
 * Create a new webhook
 */
export declare function createWebhook(userId: string, input: CreateWebhookInput): Promise<WebhookServiceResult<WebhookConfig>>;
/**
 * Get a webhook by ID
 */
export declare function getWebhook(userId: string, webhookId: string): Promise<WebhookServiceResult<WebhookConfig>>;
/**
 * List all webhooks for a user
 */
export declare function listWebhooks(userId: string): Promise<WebhookServiceResult<ListWebhooksResult>>;
/**
 * Update a webhook
 */
export declare function updateWebhook(userId: string, input: UpdateWebhookInput): Promise<WebhookServiceResult<WebhookConfig>>;
/**
 * Delete a webhook
 */
export declare function deleteWebhook(userId: string, webhookId: string): Promise<WebhookServiceResult<void>>;
/**
 * Find webhook by voice trigger phrase
 */
export declare function findWebhookByTrigger(userId: string, phrase: string): Promise<WebhookConfig | null>;
/**
 * Record webhook execution result
 */
export declare function recordExecution(userId: string, webhookId: string, success: boolean): Promise<void>;
/**
 * Get webhook stats for a user
 */
export declare function getWebhookStats(userId: string): Promise<WebhookStats>;
/**
 * Create a new Siri token
 */
export declare function createSiriToken(userId: string, input: CreateSiriTokenInput): Promise<WebhookServiceResult<CreateSiriTokenResult>>;
/**
 * Validate a Siri token and return its details
 */
export declare function validateSiriToken(userId: string, token: string): Promise<SiriToken | null>;
/**
 * List all Siri tokens for a user
 */
export declare function listSiriTokens(userId: string): Promise<SiriToken[]>;
/**
 * Delete a Siri token
 */
export declare function deleteSiriToken(userId: string, tokenId: string): Promise<WebhookServiceResult<void>>;
/**
 * Clear cache for a user (for testing or logout)
 */
export declare function clearUserCache(userId: string): void;
/**
 * Clear all caches (for testing)
 */
export declare function clearAllCaches(): void;
//# sourceMappingURL=webhook-config-store.d.ts.map