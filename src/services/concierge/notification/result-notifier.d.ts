/**
 * Concierge Result Notifier
 *
 * Notifies users when concierge requests are completed.
 * Uses SMS/Push to deliver results in a human, helpful way.
 *
 * Philosophy: Results should feel like a friend texting you back with
 * helpful info, not a corporate notification.
 */
import type { ConciergeRequest, ConciergeDomain, ConciergeEvent } from '../types.js';
export interface NotificationResult {
    success: boolean;
    channel: 'sms' | 'push' | 'email';
    messageId?: string;
    error?: string;
}
export interface UserNotificationPrefs {
    userId: string;
    phone?: string;
    email?: string;
    pushToken?: string;
    preferredChannel: 'sms' | 'push' | 'email';
}
/**
 * Notify user of concierge request completion
 */
export declare function notifyRequestComplete(request: ConciergeRequest): Promise<NotificationResult>;
/**
 * Send a progress update (optional, for long-running requests)
 */
export declare function notifyProgress(userId: string, eventType: string, domain: ConciergeDomain, count: number): Promise<NotificationResult | null>;
/**
 * Handle concierge events and trigger appropriate notifications
 */
export declare function handleConciergeEvent(event: ConciergeEvent, request: ConciergeRequest): void;
/**
 * Register the notifier with the task tracker
 */
export declare function registerNotifier(): Promise<void>;
//# sourceMappingURL=result-notifier.d.ts.map