/**
 * Email Delivery Service
 *
 * Beautiful, persona-styled email delivery using SendGrid/Resend with:
 * - Gorgeous HTML templates for each persona
 * - Plain text fallbacks
 * - Open/click tracking
 * - Delivery status handling
 * - Retry logic
 */
export type EmailProvider = 'sendgrid' | 'resend';
export interface EmailDeliveryConfig {
    provider: EmailProvider;
    apiKey: string;
    fromEmail: string;
    fromName: string;
    replyToEmail?: string;
    trackingDomain?: string;
    trackOpens?: boolean;
    trackClicks?: boolean;
}
export interface EmailMessage {
    to: string;
    toName?: string;
    subject: string;
    body: string;
    html?: string;
    personaId: string;
    userId: string;
    outreachId: string;
    preheader?: string;
    attachments?: EmailAttachment[];
    scheduleSend?: Date;
    tags?: string[];
}
export interface EmailAttachment {
    filename: string;
    content: string;
    contentType: string;
}
export interface EmailDeliveryResult {
    success: boolean;
    messageId?: string;
    status?: string;
    error?: string;
}
export interface EmailDeliveryRecord {
    messageId: string;
    userId: string;
    outreachId: string;
    personaId: string;
    to: string;
    subject: string;
    status: 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
    sentAt: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    clickedLinks?: string[];
    bounceReason?: string;
    retryCount: number;
}
/**
 * Initialize email delivery
 */
export declare function initializeEmailDelivery(deliveryConfig: EmailDeliveryConfig): void;
/**
 * Check if email delivery is available
 */
export declare function isEmailDeliveryAvailable(): boolean;
/**
 * Generate beautiful HTML email for persona
 */
export declare function generatePersonaEmailHTML(personaId: string, options: {
    body: string;
    userName?: string;
    preheader?: string;
    ctaText?: string;
    ctaUrl?: string;
    footerNote?: string;
}): string;
/**
 * Generate plain text version
 */
export declare function generatePlainText(personaId: string, body: string, userName?: string): string;
/**
 * Send email via configured provider
 */
export declare function sendEmail(message: EmailMessage): Promise<EmailDeliveryResult>;
/**
 * Send email with retry logic
 */
export declare function sendEmailWithRetry(message: EmailMessage, retryCount?: number): Promise<EmailDeliveryResult>;
/**
 * Handle email webhook (open, click, bounce, etc.)
 */
export declare function handleEmailEvent(messageId: string, event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed', details?: {
    url?: string;
    bounceReason?: string;
}): void;
/**
 * Get delivery record
 */
export declare function getDeliveryRecord(messageId: string): EmailDeliveryRecord | undefined;
/**
 * Get all delivery records for a user
 */
export declare function getUserDeliveryRecords(userId: string): EmailDeliveryRecord[];
/**
 * Cancel pending retry
 */
export declare function cancelPendingRetry(outreachId: string): boolean;
/**
 * Clear old delivery records
 */
export declare function clearOldRecords(maxAgeDays?: number): number;
/**
 * Shutdown email delivery
 */
export declare function shutdownEmailDelivery(): void;
export declare const emailDelivery: {
    initialize: typeof initializeEmailDelivery;
    isAvailable: typeof isEmailDeliveryAvailable;
    send: typeof sendEmail;
    sendWithRetry: typeof sendEmailWithRetry;
    handleEvent: typeof handleEmailEvent;
    getRecord: typeof getDeliveryRecord;
    getUserRecords: typeof getUserDeliveryRecords;
    cancelRetry: typeof cancelPendingRetry;
    clearOldRecords: typeof clearOldRecords;
    shutdown: typeof shutdownEmailDelivery;
    generateHTML: typeof generatePersonaEmailHTML;
    generatePlainText: typeof generatePlainText;
};
//# sourceMappingURL=email-delivery.d.ts.map