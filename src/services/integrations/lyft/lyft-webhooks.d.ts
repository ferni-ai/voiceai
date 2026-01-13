/**
 * Lyft Webhook Handler
 *
 * Handles webhook events from Lyft for ride status updates.
 * Events: ride.status, ride.receipt_ready
 *
 * @module services/integrations/lyft/lyft-webhooks
 */
import type { LyftRide, LyftRideStatus, LyftRideReceipt } from './lyft-client.js';
export interface LyftWebhookEvent {
    event: 'ride.status' | 'ride.receipt_ready';
    event_id: string;
    occurred_at: string;
    ride_id: string;
    status?: LyftRideStatus;
    user_id?: string;
}
export interface LyftWebhookHandlers {
    onStatusChange?: (userId: string, rideId: string, status: LyftRideStatus, ride?: LyftRide) => Promise<void>;
    onReceiptReady?: (userId: string, rideId: string, receipt: LyftRideReceipt) => Promise<void>;
}
/**
 * Register handlers for Lyft webhook events
 */
export declare function registerLyftWebhookHandlers(newHandlers: LyftWebhookHandlers): void;
/**
 * Initialize Lyft webhooks by registering handlers with the webhook router
 */
export declare function initializeLyftWebhooks(): void;
import type { Request, Response } from 'express';
/**
 * Express route handler for Lyft webhooks
 * POST /webhooks/lyft
 */
export declare function handleLyftWebhook(req: Request, res: Response): Promise<void>;
/**
 * Default status change handler
 */
export declare function defaultStatusChangeHandler(userId: string, rideId: string, status: LyftRideStatus): Promise<void>;
//# sourceMappingURL=lyft-webhooks.d.ts.map