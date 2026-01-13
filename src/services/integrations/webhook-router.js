/**
 * Webhook Router
 *
 * Routes incoming webhooks from external services to appropriate handlers.
 * Handles signature verification and event dispatching.
 *
 * @module services/integrations/webhook-router
 */
import { createLogger } from '../../utils/safe-logger.js';
import { createHmac, timingSafeEqual } from 'crypto';
const log = createLogger({ module: 'webhook-router' });
// ============================================================================
// WEBHOOK CONFIGURATIONS
// ============================================================================
const WEBHOOK_CONFIGS = {
    twilio: {
        integrationId: 'twilio',
        path: '/webhooks/twilio',
        verifySignature: true,
        signatureHeader: 'X-Twilio-Signature',
        signatureAlgorithm: 'sha1',
    },
    uber: {
        integrationId: 'uber',
        path: '/webhooks/uber',
        verifySignature: true,
        signatureHeader: 'X-Uber-Signature',
        signatureAlgorithm: 'hmac-sha256',
    },
    lyft: {
        integrationId: 'lyft',
        path: '/webhooks/lyft',
        verifySignature: true,
        signatureHeader: 'X-Lyft-Signature',
        signatureAlgorithm: 'hmac-sha256',
    },
    instacart: {
        integrationId: 'instacart',
        path: '/webhooks/instacart',
        verifySignature: true,
        signatureHeader: 'X-Instacart-Signature',
        signatureAlgorithm: 'hmac-sha256',
    },
    doordash: {
        integrationId: 'doordash',
        path: '/webhooks/doordash',
        verifySignature: true,
        signatureHeader: 'X-DoorDash-Signature',
        signatureAlgorithm: 'hmac-sha256',
    },
    plaid: {
        integrationId: 'plaid',
        path: '/webhooks/plaid',
        verifySignature: true,
        signatureHeader: 'Plaid-Verification',
        signatureAlgorithm: 'sha256',
    },
};
// ============================================================================
// WEBHOOK ROUTER CLASS
// ============================================================================
export class WebhookRouter {
    handlers = new Map();
    eventQueue = [];
    processing = false;
    constructor() {
        log.info('Webhook router initialized');
    }
    // ==========================================================================
    // HANDLER REGISTRATION
    // ==========================================================================
    /**
     * Register a handler for webhook events
     */
    registerHandler(handler) {
        const key = this.getHandlerKey(handler.integrationId, handler.eventType);
        const existing = this.handlers.get(key) || [];
        existing.push(handler);
        this.handlers.set(key, existing);
        log.debug({ integrationId: handler.integrationId, eventType: handler.eventType }, 'Webhook handler registered');
    }
    /**
     * Remove a handler
     */
    removeHandler(integrationId, eventType, handler) {
        const key = this.getHandlerKey(integrationId, eventType);
        const existing = this.handlers.get(key) || [];
        const filtered = existing.filter((h) => h.handler !== handler);
        if (filtered.length === 0) {
            this.handlers.delete(key);
        }
        else {
            this.handlers.set(key, filtered);
        }
    }
    // ==========================================================================
    // WEBHOOK PROCESSING
    // ==========================================================================
    /**
     * Process an incoming webhook request
     */
    async processWebhook(path, headers, body, rawBody) {
        // Find config by path
        const config = Object.values(WEBHOOK_CONFIGS).find((c) => c.path === path);
        if (!config) {
            log.warn({ path }, 'Webhook received for unknown path');
            return { success: false, error: 'Unknown webhook path' };
        }
        // Verify signature if required
        if (config.verifySignature) {
            const signature = headers[config.signatureHeader?.toLowerCase() || ''];
            if (!signature) {
                log.warn({ integrationId: config.integrationId }, 'Missing webhook signature');
                return { success: false, error: 'Missing signature' };
            }
            const isValid = this.verifySignature(config, signature, rawBody || Buffer.from(body));
            if (!isValid) {
                log.warn({ integrationId: config.integrationId }, 'Invalid webhook signature');
                return { success: false, error: 'Invalid signature' };
            }
        }
        // Parse body
        let payload;
        try {
            payload = JSON.parse(body);
        }
        catch {
            log.warn({ integrationId: config.integrationId }, 'Failed to parse webhook body');
            return { success: false, error: 'Invalid JSON body' };
        }
        // Extract event type (varies by provider)
        const eventType = this.extractEventType(config.integrationId, payload, headers);
        // Create event
        const event = {
            id: this.generateEventId(),
            integrationId: config.integrationId,
            eventType,
            payload,
            receivedAt: new Date(),
            headers,
            verified: config.verifySignature,
        };
        log.info({ integrationId: config.integrationId, eventType, eventId: event.id }, 'Webhook received');
        // Queue event for processing
        this.eventQueue.push(event);
        this.processQueue();
        return { success: true };
    }
    // ==========================================================================
    // SIGNATURE VERIFICATION
    // ==========================================================================
    /**
     * Verify webhook signature
     */
    verifySignature(config, signature, body) {
        const secret = this.getWebhookSecret(config.integrationId);
        if (!secret) {
            log.warn({ integrationId: config.integrationId }, 'No webhook secret configured');
            return false;
        }
        try {
            let expectedSignature;
            switch (config.signatureAlgorithm) {
                case 'sha256':
                    expectedSignature = createHmac('sha256', secret).update(body).digest('hex');
                    break;
                case 'sha1':
                    expectedSignature = createHmac('sha1', secret).update(body).digest('base64');
                    break;
                case 'hmac-sha256':
                default:
                    expectedSignature = createHmac('sha256', secret).update(body).digest('hex');
                    break;
            }
            // Handle different signature formats (some include prefix like "sha256=")
            const normalizedSignature = signature.replace(/^(sha256=|sha1=)/, '');
            const normalizedExpected = expectedSignature.replace(/^(sha256=|sha1=)/, '');
            // Use timing-safe comparison
            const sigBuffer = Buffer.from(normalizedSignature);
            const expectedBuffer = Buffer.from(normalizedExpected);
            if (sigBuffer.length !== expectedBuffer.length) {
                return false;
            }
            return timingSafeEqual(sigBuffer, expectedBuffer);
        }
        catch (error) {
            log.error({ error: String(error), integrationId: config.integrationId }, 'Signature verification error');
            return false;
        }
    }
    // ==========================================================================
    // EVENT DISPATCHING
    // ==========================================================================
    /**
     * Process queued events
     */
    async processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        try {
            while (this.eventQueue.length > 0) {
                const event = this.eventQueue.shift();
                if (!event)
                    continue;
                await this.dispatchEvent(event);
            }
        }
        finally {
            this.processing = false;
        }
    }
    /**
     * Dispatch event to registered handlers
     */
    async dispatchEvent(event) {
        // Get specific handlers for this event type
        const specificKey = this.getHandlerKey(event.integrationId, event.eventType);
        const specificHandlers = this.handlers.get(specificKey) || [];
        // Get wildcard handlers for all events from this integration
        const wildcardKey = this.getHandlerKey(event.integrationId, '*');
        const wildcardHandlers = this.handlers.get(wildcardKey) || [];
        const allHandlers = [...specificHandlers, ...wildcardHandlers];
        if (allHandlers.length === 0) {
            log.debug({ integrationId: event.integrationId, eventType: event.eventType }, 'No handlers registered for webhook event');
            return;
        }
        // Execute handlers
        for (const handler of allHandlers) {
            try {
                await handler.handler(event);
            }
            catch (error) {
                log.error({
                    error: String(error),
                    integrationId: event.integrationId,
                    eventType: event.eventType,
                    eventId: event.id,
                }, 'Webhook handler error');
            }
        }
    }
    // ==========================================================================
    // UTILITY METHODS
    // ==========================================================================
    /**
     * Get webhook secret from environment
     */
    getWebhookSecret(integrationId) {
        const envKey = `${integrationId.toUpperCase()}_WEBHOOK_SECRET`;
        return process.env[envKey];
    }
    /**
     * Extract event type from webhook payload
     */
    extractEventType(integrationId, payload, headers) {
        const p = payload;
        switch (integrationId) {
            case 'twilio':
                // Twilio includes event type in form data
                return p.EventType || 'message';
            case 'uber':
                // Uber uses event_type field
                return p.event_type || 'unknown';
            case 'lyft':
                // Lyft uses event field
                return p.event || 'unknown';
            case 'instacart':
                // Instacart uses event_type
                return p.event_type || 'unknown';
            case 'doordash':
                // DoorDash uses event_type
                return p.event_type || 'unknown';
            case 'plaid':
                // Plaid uses webhook_type and webhook_code
                const webhookType = p.webhook_type;
                const webhookCode = p.webhook_code;
                return webhookCode ? `${webhookType}.${webhookCode}` : webhookType || 'unknown';
            default:
                // Try common patterns
                return (p.type ||
                    p.event ||
                    p.event_type ||
                    headers['x-webhook-event'] ||
                    'unknown');
        }
    }
    /**
     * Generate unique event ID
     */
    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    /**
     * Get handler key
     */
    getHandlerKey(integrationId, eventType) {
        return `${integrationId}:${eventType}`;
    }
    // ==========================================================================
    // CONFIGURATION
    // ==========================================================================
    /**
     * Get webhook config for an integration
     */
    getConfig(integrationId) {
        return WEBHOOK_CONFIGS[integrationId];
    }
    /**
     * Get all webhook paths
     */
    getAllPaths() {
        return Object.values(WEBHOOK_CONFIGS).map((c) => c.path);
    }
    /**
     * Check if a path is a registered webhook path
     */
    isWebhookPath(path) {
        return Object.values(WEBHOOK_CONFIGS).some((c) => c.path === path);
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let webhookRouterInstance = null;
export function getWebhookRouter() {
    if (!webhookRouterInstance) {
        webhookRouterInstance = new WebhookRouter();
    }
    return webhookRouterInstance;
}
export function resetWebhookRouter() {
    webhookRouterInstance = null;
}
//# sourceMappingURL=webhook-router.js.map