/**
 * Webhook Handlers Index
 *
 * Centralized exports for all webhook handlers
 */
// Twilio Webhooks
export { twilioWebhooks, initializeTwilioWebhooks, onInboundMessage, validateTwilioSignature, handleSMSStatusWebhook, handleInboundSMSWebhook, handleCallStatusWebhook, handleVoicemailWebhook, getRecentInbound, clearOldInbound, } from './twilio-webhooks.js';
// Email Webhooks
export { emailWebhooks, initializeEmailWebhooks, onEmailEvent, validateSendGridSignature, validateResendSignature, handleSendGridWebhook, handleResendWebhook, handleOpenTracking, handleClickTracking, generateOpenTrackingPixel, generateClickTrackingUrl, getRecentEvents, getMessageEvents, clearOldEvents, } from './email-webhooks.js';
// ============================================================================
// UNIFIED INITIALIZATION
// ============================================================================
import { initializeTwilioWebhooks } from './twilio-webhooks.js';
import { initializeEmailWebhooks } from './email-webhooks.js';
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger().child({ module: 'webhooks' });
let initialized = false;
/**
 * Initialize all webhook handlers
 */
export function initializeWebhooks(config) {
    if (initialized) {
        log.warn('Webhooks already initialized');
        return;
    }
    log.info('🚀 Initializing webhook handlers');
    // Initialize Twilio webhooks
    if (config.twilioAuthToken) {
        initializeTwilioWebhooks(config.twilioAuthToken);
    }
    // Initialize email webhooks
    initializeEmailWebhooks({
        sendgridWebhookKey: config.sendgridWebhookKey,
        resendWebhookSecret: config.resendWebhookSecret,
    });
    initialized = true;
    log.info('✅ Webhook handlers initialized');
}
//# sourceMappingURL=index.js.map