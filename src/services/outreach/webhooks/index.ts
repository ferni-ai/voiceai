/**
 * Webhook Handlers Index
 *
 * Centralized exports for all webhook handlers
 */

// Twilio Webhooks
export {
  twilioWebhooks,
  initializeTwilioWebhooks,
  onInboundMessage,
  validateTwilioSignature,
  handleSMSStatusWebhook,
  handleInboundSMSWebhook,
  handleCallStatusWebhook,
  handleVoicemailWebhook,
  getRecentInbound,
  clearOldInbound,
  type TwilioSMSStatusPayload,
  type TwilioInboundSMSPayload,
  type TwilioCallStatusPayload,
  type InboundMessage,
} from './twilio-webhooks.js';

// ============================================================================
// UNIFIED INITIALIZATION
// ============================================================================

import { initializeTwilioWebhooks } from './twilio-webhooks.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger().child({ module: 'webhooks' });

export interface WebhooksConfig {
  twilioAuthToken?: string;
}

let initialized = false;

/**
 * Initialize all webhook handlers
 */
export function initializeWebhooks(config: WebhooksConfig): void {
  if (initialized) {
    log.warn('Webhooks already initialized');
    return;
  }

  log.info('🚀 Initializing webhook handlers');

  // Initialize Twilio webhooks
  if (config.twilioAuthToken) {
    initializeTwilioWebhooks(config.twilioAuthToken);
  }

  initialized = true;
  log.info('✅ Webhook handlers initialized');
}
