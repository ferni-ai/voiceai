/**
 * Delivery Services Index
 *
 * Centralized exports for all delivery services
 */
export { smsDelivery, initializeSMSDelivery, isSMSDeliveryAvailable, sendSMS, sendSMSWithRetry, sendBulkSMS, handleSMSStatus, formatSMSMessage, shortenLinks, type SMSDeliveryConfig, type SMSMessage, type SMSDeliveryResult, type DeliveryRecord as SMSDeliveryRecord, } from './sms-delivery.js';
export { emailDelivery, initializeEmailDelivery, isEmailDeliveryAvailable, sendEmail, sendEmailWithRetry, handleEmailEvent, generatePersonaEmailHTML, generatePlainText, type EmailDeliveryConfig, type EmailMessage, type EmailDeliveryResult, type EmailDeliveryRecord, type EmailProvider, type EmailAttachment, } from './email-delivery.js';
export { pushNotifications, initializePushNotifications, isPushNotificationsAvailable, registerPushToken, removePushToken, getUserTokens, hasPushEnabled, sendPushNotification, sendBulkPushNotifications, generatePersonaNotification, handlePushInteraction, type PushNotificationConfig, type PushNotification, type PushAction, type PushDeliveryResult, type UserPushToken, type PushDeliveryRecord, } from './push-notifications.js';
export { deliveryTracker, queueDelivery, startQueueProcessor, stopQueueProcessor, updateDeliveryStatus, markResponded, getDeliveryRecord, getDeliveryByExternalId, getUserDeliveries, getOutreachDeliveries, getQueueItems, cancelQueuedDelivery, calculateDeliveryStats, shutdownDeliveryTracker, type DeliveryChannel, type DeliveryStatus, type UnifiedDeliveryRecord, type DeliveryQueueItem, type DeliveryStats, } from './delivery-tracker.js';
import { type SMSDeliveryConfig } from './sms-delivery.js';
import { type EmailDeliveryConfig } from './email-delivery.js';
import { type PushNotificationConfig } from './push-notifications.js';
export interface DeliveryConfig {
    sms?: SMSDeliveryConfig;
    email?: EmailDeliveryConfig;
    push?: PushNotificationConfig;
    queueProcessorIntervalMs?: number;
}
/**
 * Initialize all delivery services
 */
export declare function initializeDeliveryServices(config: DeliveryConfig): void;
export interface DeliverOutreachOptions {
    userId: string;
    channel: 'sms' | 'email' | 'push' | 'call';
    message: string;
    personaId?: string;
    subject?: string;
    outreachId?: string;
}
export interface DeliverOutreachResult {
    success: boolean;
    channel: string;
    messageId?: string;
    error?: string;
}
/**
 * Deliver an outreach message via the specified channel
 */
export declare function deliverOutreach(options: DeliverOutreachOptions): Promise<DeliverOutreachResult>;
/**
 * Shutdown all delivery services
 */
export declare function shutdownDeliveryServices(): void;
//# sourceMappingURL=index.d.ts.map