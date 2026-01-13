/**
 * SMS Delivery Service
 *
 * Real SMS delivery using Twilio with:
 * - Persona-aware message formatting
 * - Delivery status tracking
 * - Retry logic with exponential backoff
 * - Link shortening/tracking
 * - Character limit handling
 */
import Twilio from 'twilio';
export interface SMSDeliveryConfig {
    twilioAccountSid: string;
    twilioAuthToken: string;
    twilioPhoneNumber: string;
    statusCallbackUrl?: string;
    trackingDomain?: string;
}
export interface SMSMessage {
    to: string;
    body: string;
    personaId: string;
    userId: string;
    outreachId: string;
    mediaUrl?: string;
    scheduleSend?: Date;
}
export interface SMSDeliveryResult {
    success: boolean;
    messageSid?: string;
    status?: string;
    error?: string;
    segments?: number;
    price?: number;
}
export interface DeliveryRecord {
    messageSid: string;
    userId: string;
    outreachId: string;
    personaId: string;
    to: string;
    status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
    statusDetails?: string;
    sentAt: Date;
    deliveredAt?: Date;
    errorCode?: string;
    errorMessage?: string;
    price?: number;
    segments: number;
    retryCount: number;
}
/**
 * Initialize SMS delivery with Twilio credentials
 */
export declare function initializeSMSDelivery(deliveryConfig: SMSDeliveryConfig): void;
/**
 * Check if SMS delivery is available
 */
export declare function isSMSDeliveryAvailable(): boolean;
/**
 * Get Twilio client for webhook handling
 */
export declare function getTwilioClient(): Twilio.Twilio | null;
/**
 * Format message for SMS delivery
 * Handles character limits, emoji optimization, and link shortening
 */
export declare function formatSMSMessage(body: string, options?: {
    includeOptOut?: boolean;
    shortenLinks?: boolean;
    maxSegments?: number;
}): {
    body: string;
    segments: number;
    truncated: boolean;
};
/**
 * Shorten URLs in message using tracking domain
 */
export declare function shortenLinks(body: string, userId: string, outreachId: string): Promise<string>;
/**
 * Send an SMS message
 */
export declare function sendSMS(message: SMSMessage): Promise<SMSDeliveryResult>;
/**
 * Send SMS with retry logic
 */
export declare function sendSMSWithRetry(message: SMSMessage, retryCount?: number): Promise<SMSDeliveryResult>;
/**
 * Send bulk SMS messages
 */
export declare function sendBulkSMS(messages: SMSMessage[]): Promise<Map<string, SMSDeliveryResult>>;
/**
 * Handle Twilio status webhook
 */
export declare function handleSMSStatus(messageSid: string, status: string, errorCode?: string, errorMessage?: string): void;
/**
 * Get delivery record
 */
export declare function getDeliveryRecord(messageSid: string): DeliveryRecord | undefined;
/**
 * Get all delivery records for a user
 */
export declare function getUserDeliveryRecords(userId: string): DeliveryRecord[];
/**
 * Cancel pending retry
 */
export declare function cancelPendingRetry(outreachId: string): boolean;
/**
 * Clear old delivery records
 */
export declare function clearOldRecords(maxAgeHours?: number): number;
/**
 * Shutdown SMS delivery
 */
export declare function shutdownSMSDelivery(): void;
export declare const smsDelivery: {
    initialize: typeof initializeSMSDelivery;
    isAvailable: typeof isSMSDeliveryAvailable;
    send: typeof sendSMS;
    sendWithRetry: typeof sendSMSWithRetry;
    sendBulk: typeof sendBulkSMS;
    handleStatus: typeof handleSMSStatus;
    getRecord: typeof getDeliveryRecord;
    getUserRecords: typeof getUserDeliveryRecords;
    cancelRetry: typeof cancelPendingRetry;
    clearOldRecords: typeof clearOldRecords;
    shutdown: typeof shutdownSMSDelivery;
    format: typeof formatSMSMessage;
    shortenLinks: typeof shortenLinks;
};
//# sourceMappingURL=sms-delivery.d.ts.map