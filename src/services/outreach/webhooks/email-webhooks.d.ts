/**
 * Email Webhook Handlers
 *
 * Handles incoming webhooks from email providers for:
 * - Delivery status (delivered, bounced, failed)
 * - Open tracking
 * - Click tracking
 * - Spam complaints
 * - Unsubscribes
 */
export interface SendGridEvent {
    email: string;
    timestamp: number;
    'smtp-id'?: string;
    event: string;
    category?: string[];
    sg_event_id: string;
    sg_message_id: string;
    response?: string;
    attempt?: string;
    useragent?: string;
    ip?: string;
    url?: string;
    reason?: string;
    status?: string;
    tls?: number;
    cert_err?: number;
    bounce_classification?: string;
    userId?: string;
    outreachId?: string;
    personaId?: string;
}
export interface ResendEvent {
    type: string;
    created_at: string;
    data: {
        email_id: string;
        from: string;
        to: string[];
        subject: string;
        created_at: string;
        bounce?: {
            message: string;
            type: string;
        };
        click?: {
            link: string;
            timestamp: string;
            userAgent: string;
            ipAddress: string;
        };
    };
}
export interface EmailTrackingEvent {
    provider: 'sendgrid' | 'resend';
    messageId: string;
    email: string;
    event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed';
    timestamp: Date;
    metadata?: {
        url?: string;
        userAgent?: string;
        ip?: string;
        bounceReason?: string;
        userId?: string;
        outreachId?: string;
    };
}
type EmailEventHandler = (event: EmailTrackingEvent) => Promise<void>;
/**
 * Initialize email webhook handlers
 */
export declare function initializeEmailWebhooks(config: {
    sendgridWebhookKey?: string;
    resendWebhookSecret?: string;
}): void;
/**
 * Register handler for email events
 */
export declare function onEmailEvent(handler: EmailEventHandler): void;
/**
 * Validate SendGrid webhook signature
 */
export declare function validateSendGridSignature(payload: string, signature: string, timestamp: string): boolean;
/**
 * Validate Resend webhook signature
 */
export declare function validateResendSignature(payload: string, signature: string, webhookId: string, timestamp: string): boolean;
/**
 * Handle SendGrid webhook events
 */
export declare function handleSendGridWebhook(events: SendGridEvent[], signature?: string, timestamp?: string, rawPayload?: string): Promise<{
    success: boolean;
    processed: number;
}>;
/**
 * Handle Resend webhook events
 */
export declare function handleResendWebhook(event: ResendEvent, signature?: string, webhookId?: string, timestamp?: string, rawPayload?: string): Promise<{
    success: boolean;
}>;
/**
 * Generate open tracking pixel URL
 */
export declare function generateOpenTrackingPixel(messageId: string, baseUrl: string): string;
/**
 * Generate click tracking URL
 */
export declare function generateClickTrackingUrl(messageId: string, originalUrl: string, baseUrl: string): string;
/**
 * Handle open tracking pixel request
 */
export declare function handleOpenTracking(messageId: string, userAgent?: string, ip?: string): Promise<void>;
/**
 * Handle click tracking redirect
 */
export declare function handleClickTracking(messageId: string, encodedUrl: string, userAgent?: string, ip?: string): Promise<string>;
/**
 * Get recent email events
 */
export declare function getRecentEvents(limit?: number): EmailTrackingEvent[];
/**
 * Get events for a specific message
 */
export declare function getMessageEvents(messageId: string): EmailTrackingEvent[];
/**
 * Clear old events
 */
export declare function clearOldEvents(maxAgeHours?: number): number;
export declare const emailWebhooks: {
    initialize: typeof initializeEmailWebhooks;
    onEmailEvent: typeof onEmailEvent;
    validateSendGridSignature: typeof validateSendGridSignature;
    validateResendSignature: typeof validateResendSignature;
    handleSendGrid: typeof handleSendGridWebhook;
    handleResend: typeof handleResendWebhook;
    handleOpenTracking: typeof handleOpenTracking;
    handleClickTracking: typeof handleClickTracking;
    generateOpenTrackingPixel: typeof generateOpenTrackingPixel;
    generateClickTrackingUrl: typeof generateClickTrackingUrl;
    getRecentEvents: typeof getRecentEvents;
    getMessageEvents: typeof getMessageEvents;
    clearOldEvents: typeof clearOldEvents;
};
export {};
//# sourceMappingURL=email-webhooks.d.ts.map