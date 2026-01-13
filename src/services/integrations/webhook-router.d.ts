/**
 * Webhook Router
 *
 * Routes incoming webhooks from external services to appropriate handlers.
 * Handles signature verification and event dispatching.
 *
 * @module services/integrations/webhook-router
 */
import type { WebhookConfig, WebhookHandler } from './types.js';
export declare class WebhookRouter {
    private handlers;
    private eventQueue;
    private processing;
    constructor();
    /**
     * Register a handler for webhook events
     */
    registerHandler(handler: WebhookHandler): void;
    /**
     * Remove a handler
     */
    removeHandler(integrationId: string, eventType: string, handler: WebhookHandler['handler']): void;
    /**
     * Process an incoming webhook request
     */
    processWebhook(path: string, headers: Record<string, string>, body: string, rawBody?: Buffer): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Verify webhook signature
     */
    private verifySignature;
    /**
     * Process queued events
     */
    private processQueue;
    /**
     * Dispatch event to registered handlers
     */
    private dispatchEvent;
    /**
     * Get webhook secret from environment
     */
    private getWebhookSecret;
    /**
     * Extract event type from webhook payload
     */
    private extractEventType;
    /**
     * Generate unique event ID
     */
    private generateEventId;
    /**
     * Get handler key
     */
    private getHandlerKey;
    /**
     * Get webhook config for an integration
     */
    getConfig(integrationId: string): WebhookConfig | undefined;
    /**
     * Get all webhook paths
     */
    getAllPaths(): string[];
    /**
     * Check if a path is a registered webhook path
     */
    isWebhookPath(path: string): boolean;
}
export declare function getWebhookRouter(): WebhookRouter;
export declare function resetWebhookRouter(): void;
//# sourceMappingURL=webhook-router.d.ts.map