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

// ============================================================================
// UNIFIED DELIVERY FUNCTION
// ============================================================================

import { sendSMS, isSMSDeliveryAvailable, type SMSMessage } from './sms-delivery.js';
import { sendEmail, isEmailDeliveryAvailable } from './email-delivery.js';
import { sendPushNotification, isPushNotificationsAvailable } from './push-notifications.js';
import { getFirestoreClient } from '../firestore-persistence.js';

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
export async function deliverOutreach(options: DeliverOutreachOptions): Promise<DeliverOutreachResult> {
  const { userId, channel, message, personaId, subject, outreachId } = options;
  const persona = personaId || 'ferni';
  const outreach = outreachId || `outreach-${Date.now()}`;

  try {
    switch (channel) {
      case 'sms':
        if (!isSMSDeliveryAvailable()) {
          return { success: false, channel, error: 'SMS delivery not available' };
        }
        // Get user phone number from profile
        const phoneResult = await getUserPhoneNumber(userId);
        if (!phoneResult) {
          return { success: false, channel, error: 'User phone number not found' };
        }
        const smsMessage: SMSMessage = {
          to: phoneResult,
          body: message,
          personaId: persona,
          userId,
          outreachId: outreach,
        };
        const smsResult = await sendSMS(smsMessage);
        return {
          success: smsResult.success,
          channel,
          messageId: smsResult.messageSid,
          error: smsResult.error,
        };

      case 'email':
        if (!isEmailDeliveryAvailable()) {
          return { success: false, channel, error: 'Email delivery not available' };
        }
        const emailAddr = await getUserEmail(userId);
        if (!emailAddr) {
          return { success: false, channel, error: 'User email not found' };
        }
        const sendResult = await sendEmail({
          to: emailAddr,
          subject: subject || 'A message from Ferni',
          body: message,
          personaId: persona,
          userId,
          outreachId: outreach,
        });
        return {
          success: sendResult.success,
          channel,
          messageId: sendResult.messageId,
          error: sendResult.error,
        };

      case 'push':
        if (!isPushNotificationsAvailable()) {
          return { success: false, channel, error: 'Push notifications not available' };
        }
        const pushResults = await sendPushNotification({
          userId,
          title: personaId ? `From ${personaId}` : 'Ferni',
          body: message,
          personaId: persona,
          outreachId: outreach,
        });
        // sendPushNotification returns an array of results (one per token)
        const firstSuccess = pushResults.find((r) => r.success);
        return {
          success: pushResults.some((r) => r.success),
          channel,
          messageId: firstSuccess?.messageId,
          error: pushResults.every((r) => !r.success) ? 'All push notifications failed' : undefined,
        };

      case 'call':
        // Calls are handled differently - initiate via conversational calls
        log.info({ userId }, 'Call delivery requested - delegating to conversational calls');
        return { success: false, channel, error: 'Call delivery handled by separate service' };

      default:
        return { success: false, channel, error: `Unknown channel: ${channel}` };
    }
  } catch (error) {
    log.error({ userId, channel, error: String(error) }, 'Delivery failed');
    return { success: false, channel, error: String(error) };
  }
}

/**
 * Get user phone number from profile
 */
async function getUserPhoneNumber(userId: string): Promise<string | null> {
  try {
    const db = getFirestoreClient();
    if (!db) return null;
    const doc = await db.collection('profiles').doc(userId).get();
    return doc.data()?.phoneNumber || null;
  } catch {
    return null;
  }
}

/**
 * Get user email from profile
 */
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const db = getFirestoreClient();
    if (!db) return null;
    const doc = await db.collection('profiles').doc(userId).get();
    return doc.data()?.email || null;
  } catch {
    return null;
  }
}

/**
 * Shutdown all delivery services
 */
export function shutdownDeliveryServices(): void {
  stopQueueProcessor();
  initialized = false;
  log.info('Delivery services shut down');
}
