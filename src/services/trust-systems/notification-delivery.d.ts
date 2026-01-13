/**
 * Notification Delivery Service
 *
 * Actually delivers proactive outreach notifications via:
 * - Push notifications (web/mobile)
 * - Email (Sendgrid/Postmark)
 * - SMS (Twilio)
 *
 * Philosophy: The best check-ins feel like they came from a friend
 * who genuinely was thinking about you - not a scheduled notification.
 *
 * @module NotificationDelivery
 */
import type { OutreachItem } from './outreach-integration.js';
export type DeliveryChannel = 'push' | 'email' | 'sms' | 'voice';
export interface DeliveryResult {
    success: boolean;
    channel: DeliveryChannel;
    messageId?: string;
    sentAt?: Date;
    error?: string;
    retryable?: boolean;
}
export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: number;
    data?: Record<string, unknown>;
    actions?: Array<{
        action: string;
        title: string;
    }>;
}
export interface EmailPayload {
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
}
export interface SmsPayload {
    to: string;
    body: string;
    mediaUrl?: string;
}
export interface UserChannelConfig {
    userId: string;
    pushToken?: string;
    email?: string;
    phone?: string;
    preferredChannel: DeliveryChannel;
    enabledChannels: DeliveryChannel[];
}
/**
 * Deliver via push notification
 */
export declare function deliverPush(item: OutreachItem, pushToken: string): Promise<DeliveryResult>;
/**
 * Deliver via email
 * @param personaId - Which persona should send this email (default: auto-routed)
 */
export declare function deliverEmail(item: OutreachItem, email: string, userName?: string, personaId?: string): Promise<DeliveryResult>;
/**
 * Deliver via SMS
 */
export declare function deliverSms(item: OutreachItem, phone: string): Promise<DeliveryResult>;
/**
 * Deliver via voice call using Cartesia TTS
 * @param personaId - Which persona's voice to use (default: 'ferni')
 */
export declare function deliverVoice(item: OutreachItem, phone: string, personaId?: string): Promise<DeliveryResult>;
/**
 * Deliver to user using their preferred channel
 */
export declare function deliverToUser(item: OutreachItem, config: UserChannelConfig): Promise<DeliveryResult>;
declare const _default: {
    deliverPush: typeof deliverPush;
    deliverEmail: typeof deliverEmail;
    deliverSms: typeof deliverSms;
    deliverToUser: typeof deliverToUser;
};
export default _default;
//# sourceMappingURL=notification-delivery.d.ts.map