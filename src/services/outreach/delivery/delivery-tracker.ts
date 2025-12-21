/**
 * Delivery Tracker
 *
 * Centralized tracking of all outreach deliveries across channels:
 * - Unified status tracking
 * - Cross-channel analytics
 * - Retry coordination
 * - Delivery queue management
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  smsDelivery,
  type SMSDeliveryResult,
  type DeliveryRecord as SMSRecord,
} from './sms-delivery.js';
import {
  emailDelivery,
  type EmailDeliveryResult,
  type EmailDeliveryRecord,
} from './email-delivery.js';

const log = getLogger().child({ module: 'delivery-tracker' });

// ============================================================================
// TYPES
// ============================================================================

export type DeliveryChannel = 'sms' | 'email' | 'call' | 'push' | 'voice_message';

export type DeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'responded'
  | 'failed'
  | 'bounced'
  | 'unsubscribed';

export interface UnifiedDeliveryRecord {
  id: string;
  outreachId: string;
  userId: string;
  personaId: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  externalId?: string; // messageSid, messageId, etc.

  // Timing
  queuedAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  respondedAt?: Date;

  // Content
  to: string;
  subject?: string;
  bodyPreview?: string;

  // Metadata
  triggerType: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  retryCount: number;
  maxRetries: number;

  // Error tracking
  lastError?: string;
  errorCode?: string;

  // Analytics
  segments?: number; // for SMS
  clickedLinks?: string[]; // for email
}

export interface DeliveryQueueItem {
  id: string;
  outreachId: string;
  userId: string;
  personaId: string;
  channel: DeliveryChannel;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  scheduledFor: Date;
  payload: {
    to: string;
    body: string;
    subject?: string;
    html?: string;
    mediaUrl?: string;
    // Additional fields for push/voice channels
    title?: string;
    phone?: string;
    data?: Record<string, string>;
  };
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
}

export interface DeliveryStats {
  total: number;
  byStatus: Record<DeliveryStatus, number>;
  byChannel: Record<DeliveryChannel, number>;
  successRate: number;
  avgDeliveryTimeMs: number;
  avgResponseTimeMs: number;
}

// ============================================================================
// STATE
// ============================================================================

const deliveryRecords = new Map<string, UnifiedDeliveryRecord>();
const deliveryQueue: DeliveryQueueItem[] = [];
let queueProcessor: NodeJS.Timeout | null = null;

// Priority weights for queue ordering
const PRIORITY_WEIGHTS: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Add item to delivery queue
 */
export function queueDelivery(item: Omit<DeliveryQueueItem, 'id' | 'createdAt'>): string {
  const id = `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const queueItem: DeliveryQueueItem = {
    ...item,
    id,
    createdAt: new Date(),
  };

  deliveryQueue.push(queueItem);
  sortQueue();

  // Create tracking record
  const record: UnifiedDeliveryRecord = {
    id,
    outreachId: item.outreachId,
    userId: item.userId,
    personaId: item.personaId,
    channel: item.channel,
    status: 'queued',
    queuedAt: new Date(),
    to: item.payload.to,
    subject: item.payload.subject,
    bodyPreview: item.payload.body.slice(0, 100),
    triggerType: 'unknown', // Will be updated
    priority: item.priority,
    retryCount: item.retryCount,
    maxRetries: item.maxRetries,
  };
  deliveryRecords.set(id, record);

  log.debug(
    { id, channel: item.channel, priority: item.priority, userId: item.userId },
    'Queued delivery'
  );

  return id;
}

/**
 * Sort queue by priority and scheduled time
 */
function sortQueue(): void {
  deliveryQueue.sort((a, b) => {
    // First by priority
    const priorityDiff = PRIORITY_WEIGHTS[a.priority] - PRIORITY_WEIGHTS[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by scheduled time
    return a.scheduledFor.getTime() - b.scheduledFor.getTime();
  });
}

/**
 * Process next item in queue
 */
async function processQueue(): Promise<void> {
  if (deliveryQueue.length === 0) return;

  const now = new Date();
  const readyItems = deliveryQueue.filter((item) => item.scheduledFor <= now);

  if (readyItems.length === 0) return;

  // Process up to 5 items in parallel
  const batch = readyItems.slice(0, 5);

  await Promise.all(
    batch.map(async (item) => {
      // Remove from queue
      const index = deliveryQueue.findIndex((q) => q.id === item.id);
      if (index !== -1) {
        deliveryQueue.splice(index, 1);
      }

      // Process delivery
      await processDeliveryItem(item);
    })
  );
}

/**
 * Process a single delivery item
 */
async function processDeliveryItem(item: DeliveryQueueItem): Promise<void> {
  const record = deliveryRecords.get(item.id);
  if (!record) return;

  // Update status
  record.status = 'sending';
  deliveryRecords.set(item.id, record);

  try {
    let result: { success: boolean; messageId?: string; messageSid?: string; error?: string };

    switch (item.channel) {
      case 'sms':
        result = await smsDelivery.send({
          to: item.payload.to,
          body: item.payload.body,
          personaId: item.personaId,
          userId: item.userId,
          outreachId: item.outreachId,
          mediaUrl: item.payload.mediaUrl,
        });
        if (result.success) {
          record.externalId = result.messageSid;
        }
        break;

      case 'email':
        result = await emailDelivery.send({
          to: item.payload.to,
          subject: item.payload.subject || 'A message from Ferni',
          body: item.payload.body,
          html: item.payload.html,
          personaId: item.personaId,
          userId: item.userId,
          outreachId: item.outreachId,
        });
        if (result.success) {
          record.externalId = result.messageId;
        }
        break;

      case 'push':
        // Use FCM push notifications
        try {
          const { sendPushNotification, isPushNotificationsAvailable } =
            await import('./push-notifications.js');

          if (!isPushNotificationsAvailable()) {
            result = { success: false, error: 'Push notifications not configured' };
          } else {
            const pushResult = await sendPushNotification({
              userId: item.userId,
              outreachId: item.outreachId,
              personaId: item.personaId,
              title: item.payload.title || 'Ferni',
              body: item.payload.body,
              priority: item.priority === 'high' ? 'high' : 'normal',
              data: item.payload.data as Record<string, string> | undefined,
            });
            const success = pushResult.some((r) => r.success);
            result = success
              ? { success: true, messageId: pushResult.find((r) => r.messageId)?.messageId }
              : { success: false, error: pushResult.map((r) => r.error).join('; ') };
          }
        } catch (error) {
          result = { success: false, error: `Push error: ${error}` };
        }
        break;

      case 'voice_message':
        // Use Cartesia TTS + Twilio for voice messages
        try {
          const { sendVoiceMessage } = await import('../../scheduling/reminder-scheduler.js');
          const toPhone = item.payload.phone;

          if (!toPhone) {
            result = { success: false, error: 'No phone number for voice message' };
          } else {
            const callSid = await sendVoiceMessage(item.outreachId, toPhone);
            result = callSid
              ? { success: true, messageId: callSid }
              : { success: false, error: 'Voice message failed' };
          }
        } catch (error) {
          result = { success: false, error: `Voice message error: ${error}` };
        }
        break;

      case 'call':
        // Use Twilio for outbound calls (handled by voice-call service)
        try {
          const { callWithPersonaVoice } = await import('../../voice/voice-call.js');
          const toPhone = item.payload.phone;

          if (!toPhone) {
            result = { success: false, error: 'No phone number for call' };
          } else {
            const callResult = await callWithPersonaVoice(
              toPhone,
              item.payload.body,
              item.personaId
            );
            result = callResult.success
              ? { success: true, messageId: callResult.callSid }
              : { success: false, error: callResult.message };
          }
        } catch (error) {
          result = { success: false, error: `Call error: ${error}` };
        }
        break;

      default:
        result = { success: false, error: `Unknown channel: ${item.channel}` };
    }

    if (result.success) {
      record.status = 'sent';
      record.sentAt = new Date();
      log.info({ id: item.id, channel: item.channel, userId: item.userId }, '✅ Delivery sent');
    } else {
      record.lastError = result.error;
      record.retryCount++;

      if (record.retryCount < record.maxRetries) {
        // Re-queue with backoff
        const backoffMs = Math.min(1000 * Math.pow(2, record.retryCount), 300_000);
        item.scheduledFor = new Date(Date.now() + backoffMs);
        item.retryCount = record.retryCount;
        deliveryQueue.push(item);
        sortQueue();
        record.status = 'queued';
        log.warn({ id: item.id, retryCount: record.retryCount, backoffMs }, 'Retrying delivery');
      } else {
        record.status = 'failed';
        log.error(
          { id: item.id, error: result.error, retryCount: record.retryCount },
          '❌ Delivery failed permanently'
        );
      }
    }

    deliveryRecords.set(item.id, record);
  } catch (error) {
    record.status = 'failed';
    record.lastError = String(error);
    deliveryRecords.set(item.id, record);
    log.error({ error, id: item.id }, 'Delivery processing error');
  }
}

/**
 * Start queue processor
 */
export function startQueueProcessor(intervalMs = 5000): void {
  if (queueProcessor) return;

  queueProcessor = setInterval(() => {
    void processQueue();
  }, intervalMs);

  log.info({ intervalMs }, 'Started delivery queue processor');
}

/**
 * Stop queue processor
 */
export function stopQueueProcessor(): void {
  if (queueProcessor) {
    clearInterval(queueProcessor);
    queueProcessor = null;
    log.info('Stopped delivery queue processor');
  }
}

// ============================================================================
// STATUS UPDATES
// ============================================================================

/**
 * Update delivery status (from webhook)
 */
export function updateDeliveryStatus(
  idOrExternalId: string,
  status: DeliveryStatus,
  details?: {
    clickedUrl?: string;
    errorCode?: string;
    errorMessage?: string;
  }
): boolean {
  // Find by ID or external ID
  let record = deliveryRecords.get(idOrExternalId);
  if (!record) {
    for (const r of deliveryRecords.values()) {
      if (r.externalId === idOrExternalId) {
        record = r;
        break;
      }
    }
  }

  if (!record) {
    log.warn({ id: idOrExternalId }, 'Status update for unknown delivery');
    return false;
  }

  record.status = status;

  switch (status) {
    case 'delivered':
      record.deliveredAt = new Date();
      break;
    case 'opened':
      record.openedAt = new Date();
      break;
    case 'clicked':
      record.clickedAt = new Date();
      if (details?.clickedUrl) {
        record.clickedLinks = record.clickedLinks || [];
        record.clickedLinks.push(details.clickedUrl);
      }
      break;
    case 'responded':
      record.respondedAt = new Date();
      break;
    case 'failed':
    case 'bounced':
      record.errorCode = details?.errorCode;
      record.lastError = details?.errorMessage;
      break;
  }

  deliveryRecords.set(record.id, record);

  log.debug({ id: record.id, status, userId: record.userId }, 'Updated delivery status');

  return true;
}

/**
 * Mark delivery as responded
 */
export function markResponded(
  userId: string,
  channel: DeliveryChannel,
  responseTimeMs?: number
): void {
  // Find most recent delivery to this user on this channel
  const userRecords = Array.from(deliveryRecords.values())
    .filter((r) => r.userId === userId && r.channel === channel && r.status !== 'failed')
    .sort((a, b) => (b.sentAt?.getTime() || 0) - (a.sentAt?.getTime() || 0));

  const record = userRecords[0];
  if (record) {
    record.status = 'responded';
    record.respondedAt = new Date();
    deliveryRecords.set(record.id, record);

    log.info({ id: record.id, userId, channel, responseTimeMs }, '💬 User responded to outreach');
  }
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get delivery record by ID
 */
export function getDeliveryRecord(id: string): UnifiedDeliveryRecord | undefined {
  return deliveryRecords.get(id);
}

/**
 * Get delivery record by external ID
 */
export function getDeliveryByExternalId(externalId: string): UnifiedDeliveryRecord | undefined {
  for (const record of deliveryRecords.values()) {
    if (record.externalId === externalId) {
      return record;
    }
  }
  return undefined;
}

/**
 * Get all deliveries for a user
 */
export function getUserDeliveries(userId: string, limit = 50): UnifiedDeliveryRecord[] {
  return Array.from(deliveryRecords.values())
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime())
    .slice(0, limit);
}

/**
 * Get deliveries by outreach ID
 */
export function getOutreachDeliveries(outreachId: string): UnifiedDeliveryRecord[] {
  return Array.from(deliveryRecords.values()).filter((r) => r.outreachId === outreachId);
}

/**
 * Get pending queue items
 */
export function getQueueItems(userId?: string): DeliveryQueueItem[] {
  if (userId) {
    return deliveryQueue.filter((q) => q.userId === userId);
  }
  return [...deliveryQueue];
}

/**
 * Cancel queued delivery
 */
export function cancelQueuedDelivery(id: string): boolean {
  const index = deliveryQueue.findIndex((q) => q.id === id);
  if (index !== -1) {
    deliveryQueue.splice(index, 1);

    const record = deliveryRecords.get(id);
    if (record) {
      record.status = 'failed';
      record.lastError = 'Cancelled';
      deliveryRecords.set(id, record);
    }

    log.info({ id }, 'Cancelled queued delivery');
    return true;
  }
  return false;
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Calculate delivery statistics
 */
export function calculateDeliveryStats(userId?: string, sinceDate?: Date): DeliveryStats {
  let records = Array.from(deliveryRecords.values());

  if (userId) {
    records = records.filter((r) => r.userId === userId);
  }

  if (sinceDate) {
    records = records.filter((r) => r.queuedAt >= sinceDate);
  }

  const byStatus: Record<DeliveryStatus, number> = {
    queued: 0,
    sending: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    responded: 0,
    failed: 0,
    bounced: 0,
    unsubscribed: 0,
  };

  const byChannel: Record<DeliveryChannel, number> = {
    sms: 0,
    email: 0,
    call: 0,
    push: 0,
    voice_message: 0,
  };

  let totalDeliveryTime = 0;
  let deliveryCount = 0;
  let totalResponseTime = 0;
  let responseCount = 0;

  for (const record of records) {
    byStatus[record.status]++;
    byChannel[record.channel]++;

    if (record.sentAt && record.deliveredAt) {
      totalDeliveryTime += record.deliveredAt.getTime() - record.sentAt.getTime();
      deliveryCount++;
    }

    if (record.sentAt && record.respondedAt) {
      totalResponseTime += record.respondedAt.getTime() - record.sentAt.getTime();
      responseCount++;
    }
  }

  const successful = byStatus.delivered + byStatus.opened + byStatus.clicked + byStatus.responded;
  const attempted = records.filter((r) => r.sentAt).length;

  return {
    total: records.length,
    byStatus,
    byChannel,
    successRate: attempted > 0 ? successful / attempted : 0,
    avgDeliveryTimeMs: deliveryCount > 0 ? totalDeliveryTime / deliveryCount : 0,
    avgResponseTimeMs: responseCount > 0 ? totalResponseTime / responseCount : 0,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear old delivery records
 */
export function clearOldRecords(maxAgeDays = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  let cleared = 0;
  for (const [id, record] of deliveryRecords) {
    if (record.queuedAt < cutoff) {
      deliveryRecords.delete(id);
      cleared++;
    }
  }

  if (cleared > 0) {
    log.info({ cleared }, 'Cleared old delivery records');
  }

  return cleared;
}

/**
 * Shutdown tracker
 */
export function shutdownDeliveryTracker(): void {
  stopQueueProcessor();
  log.info('Delivery tracker shut down');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const deliveryTracker = {
  queue: queueDelivery,
  startProcessor: startQueueProcessor,
  stopProcessor: stopQueueProcessor,
  updateStatus: updateDeliveryStatus,
  markResponded,
  getRecord: getDeliveryRecord,
  getByExternalId: getDeliveryByExternalId,
  getUserDeliveries,
  getOutreachDeliveries,
  getQueueItems,
  cancelQueued: cancelQueuedDelivery,
  calculateStats: calculateDeliveryStats,
  clearOldRecords,
  shutdown: shutdownDeliveryTracker,
};
