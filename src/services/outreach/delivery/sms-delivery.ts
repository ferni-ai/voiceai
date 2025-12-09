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

import { getLogger } from '../../../utils/safe-logger.js';
import Twilio from 'twilio';
import type { MessageListInstanceCreateOptions } from 'twilio/lib/rest/api/v2010/account/message.js';

const log = getLogger().child({ module: 'sms-delivery' });

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// STATE
// ============================================================================

let config: SMSDeliveryConfig | null = null;
let twilioClient: Twilio.Twilio | null = null;
const deliveryRecords = new Map<string, DeliveryRecord>();
const pendingRetries = new Map<string, NodeJS.Timeout>();

// SMS character limits
const SMS_CHAR_LIMIT = 160;
const SMS_CONCAT_LIMIT = 1600; // 10 segments max

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [30_000, 60_000, 180_000]; // 30s, 1m, 3m

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
  return config !== null && twilioClient !== null;
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
 * Format message for SMS delivery
 * Handles character limits, emoji optimization, and link shortening
 */
export function formatSMSMessage(
  body: string,
  options: {
    includeOptOut?: boolean;
    shortenLinks?: boolean;
    maxSegments?: number;
  } = {}
): { body: string; segments: number; truncated: boolean } {
  let formattedBody = body;
  const maxSegments = options.maxSegments ?? 3;
  const maxChars = maxSegments * SMS_CHAR_LIMIT;

  // Optional opt-out footer
  if (options.includeOptOut) {
    formattedBody += '\n\nReply STOP to opt out';
  }

  // Check if truncation needed
  let truncated = false;
  if (formattedBody.length > maxChars) {
    formattedBody = `${formattedBody.slice(0, maxChars - 3)}...`;
    truncated = true;
  }

  // Calculate segments (SMS uses GSM-7 encoding, but emojis use UCS-2)
  // eslint-disable-next-line no-control-regex -- Intentional: detecting non-ASCII chars
  const hasUnicode = /[^\u0000-\u007F]/.test(formattedBody);
  const charsPerSegment = hasUnicode ? 70 : 160;
  const segments = Math.ceil(formattedBody.length / charsPerSegment);

  return { body: formattedBody, segments, truncated };
}

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
    // Format message
    const { body, segments, truncated } = formatSMSMessage(message.body, {
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

    // Schedule retry
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingRetries.delete(message.outreachId);
        void sendSMSWithRetry(message, retryCount + 1).then(resolve);
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
      await new Promise<void>((resolve) => { setTimeout(resolve, 1000); });
    }
  }

  return results;
}

// ============================================================================
// STATUS HANDLING
// ============================================================================

/**
 * Handle Twilio status webhook
 */
export function handleSMSStatus(
  messageSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): void {
  const record = deliveryRecords.get(messageSid);
  if (!record) {
    log.warn({ messageSid }, 'Received status for unknown message');
    return;
  }

  // Update record
  record.status = status as DeliveryRecord['status'];

  if (status === 'delivered') {
    record.deliveredAt = new Date();
    log.info({ messageSid, userId: record.userId }, '✅ SMS delivered');
  } else if (status === 'failed' || status === 'undelivered') {
    record.errorCode = errorCode;
    record.errorMessage = errorMessage;
    log.warn(
      { messageSid, userId: record.userId, errorCode, errorMessage },
      '❌ SMS delivery failed'
    );
  }

  deliveryRecords.set(messageSid, record);
}

/**
 * Get delivery record
 */
export function getDeliveryRecord(messageSid: string): DeliveryRecord | undefined {
  return deliveryRecords.get(messageSid);
}

/**
 * Get all delivery records for a user
 */
export function getUserDeliveryRecords(userId: string): DeliveryRecord[] {
  return Array.from(deliveryRecords.values()).filter((r) => r.userId === userId);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cancel pending retry
 */
export function cancelPendingRetry(outreachId: string): boolean {
  const timeout = pendingRetries.get(outreachId);
  if (timeout) {
    clearTimeout(timeout);
    pendingRetries.delete(outreachId);
    return true;
  }
  return false;
}

/**
 * Clear old delivery records
 */
export function clearOldRecords(maxAgeDays = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  let cleared = 0;
  for (const [sid, record] of deliveryRecords) {
    if (record.sentAt < cutoff) {
      deliveryRecords.delete(sid);
      cleared++;
    }
  }

  if (cleared > 0) {
    log.info({ cleared }, 'Cleared old SMS delivery records');
  }

  return cleared;
}

/**
 * Shutdown SMS delivery
 */
export function shutdownSMSDelivery(): void {
  // Cancel all pending retries
  for (const [id, timeout] of pendingRetries) {
    clearTimeout(timeout);
  }
  pendingRetries.clear();

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
