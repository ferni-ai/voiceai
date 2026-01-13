/**
 * Uber Webhook Handler
 *
 * Handles webhook events from Uber for ride status updates.
 * Events: requests.status_changed, requests.receipt_ready
 *
 * @module services/integrations/uber/uber-webhooks
 */
import type { UberRide, UberRideStatus, UberReceipt } from './uber-client.js';
export interface UberWebhookEvent {
    event_type: 'requests.status_changed' | 'requests.receipt_ready';
    event_id: string;
    event_time: number;
    resource_href: string;
    meta: {
        user_id: string;
        resource_id: string;
        status?: UberRideStatus;
    };
}
export interface UberWebhookHandlers {
    onStatusChange?: (userId: string, requestId: string, status: UberRideStatus, ride?: UberRide) => Promise<void>;
    onReceiptReady?: (userId: string, requestId: string, receipt: UberReceipt) => Promise<void>;
}
/**
 * Register handlers for Uber webhook events
 */
export declare function registerUberWebhookHandlers(newHandlers: UberWebhookHandlers): void;
/**
 * Initialize Uber webhooks by registering handlers with the webhook router
 * Note: Webhook config is already in WEBHOOK_CONFIGS in webhook-router.ts
 */
export declare function initializeUberWebhooks(): void;
import type { Request, Response } from 'express';
/**
 * Express route handler for Uber webhooks
 * POST /webhooks/uber
 */
export declare function handleUberWebhook(req: Request, res: Response): Promise<void>;
/**
 * Default status change handler - logs and can trigger notifications
 */
export declare function defaultStatusChangeHandler(userId: string, requestId: string, status: UberRideStatus): Promise<void>;
//# sourceMappingURL=uber-webhooks.d.ts.map