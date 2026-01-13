/**
 * Webhook Handlers Index
 *
 * Centralized exports for all webhook handlers
 */
export { twilioWebhooks, initializeTwilioWebhooks, onInboundMessage, validateTwilioSignature, handleSMSStatusWebhook, handleInboundSMSWebhook, handleCallStatusWebhook, handleVoicemailWebhook, getRecentInbound, clearOldInbound, type TwilioSMSStatusPayload, type TwilioInboundSMSPayload, type TwilioCallStatusPayload, type InboundMessage, } from './twilio-webhooks.js';
export { emailWebhooks, initializeEmailWebhooks, onEmailEvent, validateSendGridSignature, validateResendSignature, handleSendGridWebhook, handleResendWebhook, handleOpenTracking, handleClickTracking, generateOpenTrackingPixel, generateClickTrackingUrl, getRecentEvents, getMessageEvents, clearOldEvents, type SendGridEvent, type ResendEvent, type EmailTrackingEvent, } from './email-webhooks.js';
export interface WebhooksConfig {
    twilioAuthToken?: string;
    sendgridWebhookKey?: string;
    resendWebhookSecret?: string;
}
/**
 * Initialize all webhook handlers
 */
export declare function initializeWebhooks(config: WebhooksConfig): void;
//# sourceMappingURL=index.d.ts.map