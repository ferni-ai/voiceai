/**
 * Engagement Tracking Service
 *
 * > "We learn what works. Not to manipulate. To serve better."
 *
 * Tracks email opens, clicks, and responses to:
 * - Learn optimal messaging for each user
 * - Identify best times to reach out
 * - Improve content personalization
 *
 * Privacy-first: We track patterns, not surveillance.
 *
 * @module EngagementTracking
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';

const log = createLogger({ module: 'EngagementTracking' });

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementEvent {
  userId: string;
  messageId: string;
  channel: 'email' | 'sms' | 'push' | 'voice_call';
  eventType: 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'spam' | 'unsubscribed';
  timestamp: Date;
  metadata?: {
    linkUrl?: string;
    userAgent?: string;
    ipCity?: string;
    sendgridEventId?: string;
  };
}

export interface UserEngagementStats {
  userId: string;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  preferredChannel: 'email' | 'sms' | 'push' | 'voice_call' | null;
  bestHourToReach: number | null; // 0-23
  bestDayToReach: number | null; // 0-6 (Sunday = 0)
  lastEngagement: Date | null;
}

export interface SendGridWebhookEvent {
  email: string;
  timestamp: number;
  event: 'delivered' | 'open' | 'click' | 'bounce' | 'spam_report' | 'unsubscribe';
  sg_message_id: string;
  sg_event_id: string;
  url?: string;
  useragent?: string;
  ip?: string;
}

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record an engagement event
 */
export async function recordEngagementEvent(event: EngagementEvent): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      log.debug({ userId: event.userId }, 'Firestore not available, skipping engagement tracking');
      return;
    }

    // Store the event
    await db
      .collection('bogle_users')
      .doc(event.userId)
      .collection('engagement_events')
      .add({
        ...event,
        timestamp: event.timestamp.toISOString(),
        recordedAt: new Date().toISOString(),
      });

    // Update aggregate stats
    await updateEngagementStats(event.userId, event);

    log.debug(
      {
        userId: event.userId,
        eventType: event.eventType,
        channel: event.channel,
      },
      'Engagement event recorded'
    );
  } catch (error) {
    log.error({ error: String(error), userId: event.userId }, 'Failed to record engagement event');
  }
}

/**
 * Update aggregate engagement stats for a user
 */
async function updateEngagementStats(userId: string, event: EngagementEvent): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const statsRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('analytics')
    .doc('engagement');

  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(statsRef);
      const current = doc.exists
        ? (doc.data() as UserEngagementStats)
        : {
            userId,
            totalSent: 0,
            totalOpened: 0,
            totalClicked: 0,
            totalReplied: 0,
            openRate: 0,
            clickRate: 0,
            replyRate: 0,
            preferredChannel: null,
            bestHourToReach: null,
            bestDayToReach: null,
            lastEngagement: null,
          };

      // Update counters based on event type
      switch (event.eventType) {
        case 'delivered':
          current.totalSent++;
          break;
        case 'opened':
          current.totalOpened++;
          current.lastEngagement = event.timestamp;
          // Track hour and day for optimal timing
          updateTimingStats(current, event.timestamp);
          break;
        case 'clicked':
          current.totalClicked++;
          current.lastEngagement = event.timestamp;
          updateTimingStats(current, event.timestamp);
          break;
        case 'replied':
          current.totalReplied++;
          current.lastEngagement = event.timestamp;
          updateTimingStats(current, event.timestamp);
          break;
      }

      // Recalculate rates
      if (current.totalSent > 0) {
        current.openRate = current.totalOpened / current.totalSent;
        current.clickRate = current.totalClicked / current.totalSent;
        current.replyRate = current.totalReplied / current.totalSent;
      }

      // Update channel preference
      await updateChannelPreference(userId, event.channel, transaction, statsRef, current);

      transaction.set(statsRef, {
        ...current,
        lastEngagement: current.lastEngagement?.toISOString() || null,
        updatedAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update engagement stats');
  }
}

/**
 * Update timing statistics for optimal outreach
 */
function updateTimingStats(stats: UserEngagementStats, timestamp: Date): void {
  const hour = timestamp.getHours();
  const day = timestamp.getDay();

  // Simple approach: track most recent engagement time
  // More sophisticated: use weighted average or ML model
  stats.bestHourToReach = hour;
  stats.bestDayToReach = day;
}

/**
 * Update channel preference based on engagement
 */
async function updateChannelPreference(
  userId: string,
  channel: EngagementEvent['channel'],
  transaction: FirebaseFirestore.Transaction,
  statsRef: FirebaseFirestore.DocumentReference,
  stats: UserEngagementStats
): Promise<void> {
  // For now, track the channel that gets the most engagement
  // Could be enhanced with more sophisticated logic
  stats.preferredChannel = channel;
}

// ============================================================================
// SENDGRID WEBHOOK HANDLER
// ============================================================================

/**
 * Handle SendGrid webhook events for email tracking
 */
export async function handleSendGridWebhook(events: SendGridWebhookEvent[]): Promise<void> {
  log.info({ eventCount: events.length }, 'Processing SendGrid webhook events');

  for (const event of events) {
    try {
      // Look up user by email
      const userId = await findUserIdByEmail(event.email);
      if (!userId) {
        log.debug({ email: event.email }, 'User not found for email engagement event');
        continue;
      }

      // Map SendGrid event types to our types
      const eventTypeMap: Record<string, EngagementEvent['eventType']> = {
        delivered: 'delivered',
        open: 'opened',
        click: 'clicked',
        bounce: 'bounced',
        spam_report: 'spam',
        unsubscribe: 'unsubscribed',
      };

      const engagementEvent: EngagementEvent = {
        userId,
        messageId: event.sg_message_id,
        channel: 'email',
        eventType: eventTypeMap[event.event] || 'delivered',
        timestamp: new Date(event.timestamp * 1000),
        metadata: {
          linkUrl: event.url,
          userAgent: event.useragent,
          sendgridEventId: event.sg_event_id,
        },
      };

      await recordEngagementEvent(engagementEvent);
    } catch (error) {
      log.error({ error: String(error), event }, 'Failed to process SendGrid event');
    }
  }
}

/**
 * Find user ID by email address
 */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const snapshot = await db.collection('bogle_users').where('email', '==', email).limit(1).get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].id;
  } catch (error) {
    log.error({ error: String(error), email }, 'Failed to find user by email');
    return null;
  }
}

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

/**
 * Get engagement stats for a user
 */
export async function getEngagementStats(userId: string): Promise<UserEngagementStats | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('analytics')
      .doc('engagement')
      .get();

    if (!doc.exists) return null;
    return doc.data() as UserEngagementStats;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get engagement stats');
    return null;
  }
}

/**
 * Get optimal time to reach a user
 */
export async function getOptimalOutreachTime(
  userId: string
): Promise<{ hour: number; day: number } | null> {
  const stats = await getEngagementStats(userId);
  if (!stats || stats.bestHourToReach === null) return null;

  return {
    hour: stats.bestHourToReach,
    day: stats.bestDayToReach || 0,
  };
}

/**
 * Get preferred channel for a user
 */
export async function getPreferredChannel(
  userId: string
): Promise<EngagementEvent['channel'] | null> {
  const stats = await getEngagementStats(userId);
  return stats?.preferredChannel || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const engagementTracking = {
  recordEvent: recordEngagementEvent,
  handleSendGridWebhook,
  getStats: getEngagementStats,
  getOptimalTime: getOptimalOutreachTime,
  getPreferredChannel,
};

export default engagementTracking;
