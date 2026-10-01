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
import type { MessageListInstanceCreateOptions } from 'twilio/lib/rest/api/v2010/account/message.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { validateSmsContent } from '../../brand/index.js';
import { MAX_RETRIES as RESILIENCE_MAX_RETRIES } from '../../../config/resilience-config.js';
import type {
  DeliveryRecord,
  SMSDeliveryConfig,
  SMSDeliveryResult,
  SMSMessage,
} from './sms-delivery-types.js';
import {
  cancelPendingRetry,
  clearOldRecords,
  deliveryRecords,
  enforceMaxSize,
  getDeliveryRecord,
  getUserDeliveryRecords,
  handleSMSStatus,
  pendingRetries,
} from './sms-delivery-records.js';
import { formatSMSMessage } from './sms-formatting.js';

// Re-exports: moved to sibling modules, kept here for backward-compatible imports
export type * from './sms-delivery-types.js';
export {
  handleSMSStatus,
  getDeliveryRecord,
  getUserDeliveryRecords,
  cancelPendingRetry,
  clearOldRecords,
} from './sms-delivery-records.js';
export { formatSMSMessage } from './sms-formatting.js';

const log = getLogger().child({ module: 'sms-delivery' });

// ============================================================================
// STATE
// ============================================================================

let config: SMSDeliveryConfig | null = null;
let twilioClient: Twilio.Twilio | null = null;

// Retry configuration (from centralized resilience-config)
const MAX_RETRIES = RESILIENCE_MAX_RETRIES;
const RETRY_DELAYS = [30_000, 60_000, 180_000]; // 30s, 1m, 3m

// Cleanup configuration - prevent unbounded memory growth
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run cleanup every hour
let cleanupInterval: NodeJS.Timeout | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize SMS delivery with Twilio credentials
 */
export function initializeSMSDelivery(deliveryConfig: SMSDeliveryConfig): void {
  config = deliveryConfig;

  try {
    twilioClient = Twilio(config.twilioAccountSid, config.twilioAuthToken);

    // Start periodic cleanup to prevent memory leaks
    if (!cleanupInterval) {
      // Initial cleanup of any stale records
      runRecordCleanup();

      cleanupInterval = setInterval(() => {
        runRecordCleanup();
      }, CLEANUP_INTERVAL_MS);
    }

    log.info('✅ SMS Delivery initialized');
  } catch (error) {
    log.error({ error }, 'Failed to initialize Twilio client');
    throw error;
  }
}

/**
 * Check if SMS delivery is available
 */
export function isSMSDeliveryAvailable(): boolean {
  if (config === null || twilioClient === null) initializeFromEnv();
  return config !== null && twilioClient !== null;
}

/**
 * Self-initialise from TWILIO_* env when nobody called initializeSMSDelivery
 * (the outreach bootstrap is disabled on the voice agent), so texts can be
 * sent from any process that has the Twilio secrets.
 */
function initializeFromEnv(): void {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !from) return;
  const publicUrl = process.env.PUBLIC_URL || 'https://app.ferni.ai';
  initializeSMSDelivery({
    twilioAccountSid: TWILIO_ACCOUNT_SID,
    twilioAuthToken: TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: from,
    statusCallbackUrl: `${publicUrl.replace(/\/$/, '')}/api/outreach/webhooks/twilio/sms-status`,
  });
}

/**
 * Get Twilio client for webhook handling
 */
export function getTwilioClient(): Twilio.Twilio | null {
  return twilioClient;
}

// ============================================================================
// MESSAGE FORMATTING
// ============================================================================

/**
 * Shorten URLs in message using tracking domain
 */
export async function shortenLinks(
  body: string,
  userId: string,
  outreachId: string
): Promise<string> {
  if (!config?.trackingDomain) {
    return body;
  }

  // Find all URLs in message
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let result = body;
  let match;

  while ((match = urlRegex.exec(body)) !== null) {
    const originalUrl = match[1];
    // Create tracked short link
    const trackingId = `${outreachId}-${Date.now().toString(36)}`;
    const shortUrl = `https://${config.trackingDomain}/r/${trackingId}`;

    // Store mapping (would typically go to database)
    log.debug({ originalUrl, shortUrl, userId, outreachId }, 'Created short link');

    result = result.replace(originalUrl, shortUrl);
  }

  return result;
}

// ============================================================================
// SENDING
// ============================================================================

/**
 * Send an SMS message
 */
export async function sendSMS(message: SMSMessage): Promise<SMSDeliveryResult> {
  if (!isSMSDeliveryAvailable()) {
    return { success: false, error: 'SMS delivery not initialized' };
  }

  try {
    // Brand validation - ensure content is on-brand before sending
    const brandCheck = validateSmsContent(
      message.body,
      message.personaId as 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan'
    );

    if (!brandCheck.isValid) {
      log.warn(
        { userId: message.userId, issues: brandCheck.issues },
        '⚠️ SMS content has brand issues'
      );
    }

    // Format message with validated content
    const { body, segments, truncated } = formatSMSMessage(brandCheck.message, {
      maxSegments: 3,
    });

    if (truncated) {
      log.warn(
        { userId: message.userId, originalLength: message.body.length },
        'Message truncated for SMS'
      );
    }

    // Prepare Twilio message options
    const messageOptions: MessageListInstanceCreateOptions = {
      to: message.to,
      from: config!.twilioPhoneNumber,
      body,
    };

    // Add media if provided
    if (message.mediaUrl) {
      messageOptions.mediaUrl = [message.mediaUrl];
    }

    // Add status callback
    if (config!.statusCallbackUrl) {
      messageOptions.statusCallback = config!.statusCallbackUrl;
    }

    // Add scheduled send time
    if (message.scheduleSend && message.scheduleSend > new Date()) {
      messageOptions.sendAt = message.scheduleSend;
      messageOptions.scheduleType = 'fixed';
      // Note: Messaging Service SID required for scheduled messages
    }

    // Send via Twilio
    const twilioMessage = await twilioClient!.messages.create(messageOptions);

    // Record delivery
    const record: DeliveryRecord = {
      messageSid: twilioMessage.sid,
      userId: message.userId,
      outreachId: message.outreachId,
      personaId: message.personaId,
      to: message.to,
      status: twilioMessage.status as DeliveryRecord['status'],
      sentAt: new Date(),
      segments,
      retryCount: 0,
    };
    deliveryRecords.set(twilioMessage.sid, record);

    log.info(
      {
        messageSid: twilioMessage.sid,
        userId: message.userId,
        segments,
        status: twilioMessage.status,
      },
      '📱 SMS sent'
    );

    return {
      success: true,
      messageSid: twilioMessage.sid,
      status: twilioMessage.status,
      segments,
    };
  } catch (error) {
    const twilioError = error as { code?: number; message?: string };
    log.error({ error, userId: message.userId }, '❌ Failed to send SMS');

    return {
      success: false,
      error: twilioError.message || 'Unknown error',
    };
  }
}

/**
 * Send SMS with retry logic
 */
export async function sendSMSWithRetry(
  message: SMSMessage,
  retryCount = 0
): Promise<SMSDeliveryResult> {
  const result = await sendSMS(message);

  if (result.success) {
    return result;
  }

  // Check if we should retry
  if (retryCount < MAX_RETRIES) {
    const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];

    log.info(
      {
        userId: message.userId,
        retryCount: retryCount + 1,
        delayMs: delay,
      },
      '🔄 Scheduling SMS retry'
    );

    // FIX BUG: The previous implementation had two issues:
    // 1. Used `void` to ignore the retry promise, so errors went unhandled
    // 2. Never called reject(), so if the retry failed the promise would hang
    // New implementation properly chains promises and handles errors
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRetries.delete(message.outreachId);
        sendSMSWithRetry(message, retryCount + 1)
          .then(resolve)
          .catch((error) => {
            // Log the error but resolve with a failure result instead of rejecting
            // This ensures the caller always gets a result, not an exception
            log.error({ error, userId: message.userId, retryCount }, 'SMS retry failed');
            resolve({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }, delay);

      pendingRetries.set(message.outreachId, timeout);
    });
  }

  return result;
}

/**
 * Send bulk SMS messages
 */
export async function sendBulkSMS(messages: SMSMessage[]): Promise<Map<string, SMSDeliveryResult>> {
  const results = new Map<string, SMSDeliveryResult>();

  // Process in batches of 10
  const batchSize = 10;
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (msg) => sendSMS(msg).then((r) => [msg.outreachId, r] as const))
    );

    for (const [id, result] of batchResults) {
      results.set(id, result);
    }

    // Rate limiting - wait between batches
    if (i + batchSize < messages.length) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });
    }
  }

  return results;
}

/**
 * Run periodic record cleanup (TTL + size limit)
 */
function runRecordCleanup(): void {
  const ttlCleared = clearOldRecords();
  const sizeCleared = enforceMaxSize();

  if (ttlCleared > 0 || sizeCleared > 0) {
    log.debug(
      { ttlCleared, sizeCleared, remaining: deliveryRecords.size },
      'SMS delivery record cleanup complete'
    );
  }
}

/**
 * Shutdown SMS delivery
 */
export function shutdownSMSDelivery(): void {
  // Stop cleanup interval
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  // Cancel all pending retries
  for (const [, timeout] of pendingRetries) {
    clearTimeout(timeout);
  }
  pendingRetries.clear();

  // Clear delivery records
  deliveryRecords.clear();

  log.info('SMS delivery shut down');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const smsDelivery = {
  initialize: initializeSMSDelivery,
  isAvailable: isSMSDeliveryAvailable,
  send: sendSMS,
  sendWithRetry: sendSMSWithRetry,
  sendBulk: sendBulkSMS,
  handleStatus: handleSMSStatus,
  getRecord: getDeliveryRecord,
  getUserRecords: getUserDeliveryRecords,
  cancelRetry: cancelPendingRetry,
  clearOldRecords,
  shutdown: shutdownSMSDelivery,
  format: formatSMSMessage,
  shortenLinks,
};
