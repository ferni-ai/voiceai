/**
 * Delivery Services Index
 *
 * Centralized exports for all delivery services
 */

// SMS Delivery
export {
  smsDelivery,
  initializeSMSDelivery,
  isSMSDeliveryAvailable,
  sendSMS,
  sendSMSWithRetry,
  sendBulkSMS,
  handleSMSStatus,
  formatSMSMessage,
  shortenLinks,
  type SMSDeliveryConfig,
  type SMSMessage,
  type SMSDeliveryResult,
  type DeliveryRecord as SMSDeliveryRecord,
} from './sms-delivery.js';

// Email Delivery
export {
  emailDelivery,
  initializeEmailDelivery,
  isEmailDeliveryAvailable,
  sendEmail,
  sendEmailWithRetry,
  handleEmailEvent,
  generatePersonaEmailHTML,
  generatePlainText,
  type EmailDeliveryConfig,
  type EmailMessage,
  type EmailDeliveryResult,
  type EmailDeliveryRecord,
  type EmailProvider,
  type EmailAttachment,
} from './email-delivery.js';

// Push Notifications
export {
  pushNotifications,
  initializePushNotifications,
  isPushNotificationsAvailable,
  registerPushToken,
  removePushToken,
  getUserTokens,
  hasPushEnabled,
  sendPushNotification,
  sendBulkPushNotifications,
  generatePersonaNotification,
  handlePushInteraction,
  type PushNotificationConfig,
  type PushNotification,
  type PushAction,
  type PushDeliveryResult,
  type UserPushToken,
  type PushDeliveryRecord,
} from './push-notifications.js';

// Delivery Tracker
export {
  deliveryTracker,
  queueDelivery,
  startQueueProcessor,
  stopQueueProcessor,
  updateDeliveryStatus,
  markResponded,
  getDeliveryRecord,
  getDeliveryByExternalId,
  getUserDeliveries,
  getOutreachDeliveries,
  getQueueItems,
  cancelQueuedDelivery,
  calculateDeliveryStats,
  shutdownDeliveryTracker,
  type DeliveryChannel,
  type DeliveryStatus,
  type UnifiedDeliveryRecord,
  type DeliveryQueueItem,
  type DeliveryStats,
} from './delivery-tracker.js';

// ============================================================================
// UNIFIED INITIALIZATION
// ============================================================================

import { initializeSMSDelivery, type SMSDeliveryConfig } from './sms-delivery.js';
import { initializeEmailDelivery, type EmailDeliveryConfig } from './email-delivery.js';
import { initializePushNotifications, type PushNotificationConfig } from './push-notifications.js';
import { startQueueProcessor, stopQueueProcessor } from './delivery-tracker.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger().child({ module: 'delivery' });

export interface DeliveryConfig {
  sms?: SMSDeliveryConfig;
  email?: EmailDeliveryConfig;
  push?: PushNotificationConfig;
  queueProcessorIntervalMs?: number;
}

let initialized = false;

/**
 * Initialize all delivery services
 */
export function initializeDeliveryServices(config: DeliveryConfig): void {
  if (initialized) {
    log.warn('Delivery services already initialized');
    return;
  }

  log.info('🚀 Initializing delivery services');

  // Initialize SMS if configured
  if (config.sms) {
    try {
      initializeSMSDelivery(config.sms);
    } catch (error) {
      log.warn({ error }, 'SMS delivery initialization failed');
    }
  }

  // Initialize email if configured
  if (config.email) {
    try {
      initializeEmailDelivery(config.email);
    } catch (error) {
      log.warn({ error }, 'Email delivery initialization failed');
    }
  }

  // Initialize push notifications if configured
  if (config.push) {
    try {
      initializePushNotifications(config.push);
    } catch (error) {
      log.warn({ error }, 'Push notification initialization failed');
    }
  }

  // Start queue processor
  startQueueProcessor(config.queueProcessorIntervalMs || 5000);

  initialized = true;
  log.info('✅ Delivery services initialized');
}

/**
 * Shutdown all delivery services
 */
export function shutdownDeliveryServices(): void {
  stopQueueProcessor();
  initialized = false;
  log.info('Delivery services shut down');
}
