/**
 * Outreach History Service
 *
 * Tracks all outreach attempts, responses, and preferences to learn
 * optimal outreach patterns for each user.
 *
 * Key insights we derive:
 * - Best times/channels for outreach
 * - What types of outreach get positive responses
 * - When to avoid outreach (learned from negative responses)
 *
 * @module services/outreach/outreach-history
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import { getRedisCache } from '../../memory/redis-cache.js';
import {
  onOutreachAttemptChange,
  onOutreachResponseChange,
  onOutreachPreferenceChange,
} from '../data-layer/hooks/outreach-history-hooks.js';
import type {
  OutreachAttemptEntity,
  OutreachResponseEntity,
  OutreachPreferenceEntity,
} from '../data-layer/types.js';

const log = getLogger().child({ module: 'outreach-history' });

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachAttempt extends OutreachAttemptEntity {
  id: string;
}

export interface OutreachResponse extends OutreachResponseEntity {
  id: string;
}

export interface OutreachStats {
  totalAttempts: number;
  byType: Record<string, number>;
  byChannel: Record<string, number>;
  responseRate: number;
  positiveResponseRate: number;
  averageResponseTime: number | null; // seconds
  mostEffectiveChannel: string | null;
  mostEffectiveType: string | null;
  bestTimeOfDay: string | null; // e.g., "09:00-12:00"
  bestDayOfWeek: string | null;
}

// ============================================================================
// OUTREACH ATTEMPT TRACKING
// ============================================================================

/**
 * Record an outreach attempt
 */
export async function recordOutreachAttempt(
  userId: string,
  attempt: Omit<OutreachAttemptEntity, 'sentAt'>
): Promise<string> {
  try {
    const db = getFirestore();
    const attemptData: OutreachAttemptEntity = {
      ...attempt,
      sentAt: new Date().toISOString(),
    };

    // Save to Firestore
    const ref = await db.collection(`bogle_users/${userId}/outreach_attempts`).add({
      ...attemptData,
      createdAt: Timestamp.now(),
    });

    // Index to semantic memory
    await onOutreachAttemptChange(userId, ref.id, attemptData, 'create');

    // Check if we should suppress further outreach
    const redis = getRedisCache();
    if (attemptData.status === 'sent') {
      // Suppress outreach for 2 hours after sending
      await redis.suppressOutreach(userId, 'recent_outreach', 7200);
    }

    log.info(
      { userId, type: attemptData.type, channel: attemptData.channel },
      'Outreach attempt recorded'
    );
    return ref.id;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record outreach attempt');
    throw error;
  }
}

/**
 * Update outreach attempt status (e.g., delivered)
 */
export async function updateOutreachStatus(
  userId: string,
  attemptId: string,
  status: 'pending' | 'sent' | 'delivered' | 'failed',
  deliveredAt?: string
): Promise<void> {
  try {
    const db = getFirestore();
    const ref = db.doc(`bogle_users/${userId}/outreach_attempts/${attemptId}`);

    const update: Record<string, unknown> = { status };
    if (deliveredAt) update.deliveredAt = deliveredAt;

    await ref.update(update);
    log.debug({ userId, attemptId, status }, 'Outreach status updated');
  } catch (error) {
    log.error({ error: String(error), userId, attemptId }, 'Failed to update outreach status');
  }
}

// ============================================================================
// OUTREACH RESPONSE TRACKING
// ============================================================================

/**
 * Record user's response to outreach
 */
export async function recordOutreachResponse(
  userId: string,
  outreachId: string,
  response: Omit<OutreachResponseEntity, 'outreachId' | 'timestamp'>
): Promise<string> {
  try {
    const db = getFirestore();
    const responseData: OutreachResponseEntity = {
      ...response,
      outreachId,
      timestamp: new Date().toISOString(),
    };

    // Save to Firestore
    const ref = await db.collection(`bogle_users/${userId}/outreach_responses`).add({
      ...responseData,
      createdAt: Timestamp.now(),
    });

    // Index to semantic memory
    await onOutreachResponseChange(userId, ref.id, responseData, 'create');

    // Learn from the response
    await learnFromResponse(userId, outreachId, responseData);

    log.info(
      { userId, outreachId, responseType: responseData.responseType },
      'Outreach response recorded'
    );
    return ref.id;
  } catch (error) {
    log.error({ error: String(error), userId, outreachId }, 'Failed to record outreach response');
    throw error;
  }
}

/**
 * Learn from outreach response to improve future outreach
 */
async function learnFromResponse(
  userId: string,
  outreachId: string,
  response: OutreachResponseEntity
): Promise<void> {
  try {
    const db = getFirestore();

    // Get the original attempt to understand what worked/didn't
    const attemptDoc = await db.doc(`bogle_users/${userId}/outreach_attempts/${outreachId}`).get();
    if (!attemptDoc.exists) return;

    const attempt = attemptDoc.data() as OutreachAttemptEntity;

    // If negative feedback, maybe adjust preferences
    if (response.responseType === 'negative_feedback' || response.sentiment === 'negative') {
      log.info(
        { userId, channel: attempt.channel, type: attempt.type },
        'Learning from negative outreach response'
      );

      // Could update implicit preferences here
      // For now, just log the learning opportunity
    }

    // If outreach led to session, that's a success signal
    if (response.ledToSession) {
      log.info(
        { userId, channel: attempt.channel, type: attempt.type },
        'Outreach successfully led to session'
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to learn from response');
  }
}

// ============================================================================
// OUTREACH PREFERENCES
// ============================================================================

/**
 * Get user's outreach preferences
 */
export async function getOutreachPreferences(
  userId: string
): Promise<OutreachPreferenceEntity | null> {
  try {
    const db = getFirestore();
    const doc = await db.doc(`bogle_users/${userId}/settings/outreach_preferences`).get();
    if (!doc.exists) return null;
    return doc.data() as OutreachPreferenceEntity;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get outreach preferences');
    return null;
  }
}

/**
 * Update user's outreach preferences
 */
export async function updateOutreachPreferences(
  userId: string,
  preferences: Partial<OutreachPreferenceEntity>
): Promise<void> {
  try {
    const db = getFirestore();
    const current = await getOutreachPreferences(userId);
    const updated: OutreachPreferenceEntity = {
      preferredChannels: preferences.preferredChannels || current?.preferredChannels || ['push'],
      preferredTimes: preferences.preferredTimes || current?.preferredTimes,
      preferredDays: preferences.preferredDays || current?.preferredDays,
      frequency: preferences.frequency || current?.frequency || 'occasionally',
      doNotDisturb: preferences.doNotDisturb || current?.doNotDisturb,
      topicPreferences: preferences.topicPreferences || current?.topicPreferences,
    };

    await db.doc(`bogle_users/${userId}/settings/outreach_preferences`).set(updated);

    // Index to semantic memory
    await onOutreachPreferenceChange(userId, 'outreach_preferences', updated, 'update');

    log.info({ userId }, 'Outreach preferences updated');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update outreach preferences');
    throw error;
  }
}

// ============================================================================
// ANALYTICS & INSIGHTS
// ============================================================================

/**
 * Get outreach statistics for a user
 */
export async function getOutreachStats(userId: string, daysBack = 90): Promise<OutreachStats> {
  try {
    const db = getFirestore();
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    // Get all attempts in the time range
    const attemptsSnapshot = await db
      .collection(`bogle_users/${userId}/outreach_attempts`)
      .where('sentAt', '>=', cutoffDate)
      .get();

    const attempts = attemptsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as OutreachAttempt[];

    // Get all responses
    const responsesSnapshot = await db
      .collection(`bogle_users/${userId}/outreach_responses`)
      .where('timestamp', '>=', cutoffDate)
      .get();

    const responses = responsesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as OutreachResponse[];

    // Calculate stats
    const byType: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    const responseTimesByChannel: Record<string, number[]> = {};
    const positiveByChannel: Record<string, number> = {};
    const totalByChannel: Record<string, number> = {};

    for (const attempt of attempts) {
      byType[attempt.type] = (byType[attempt.type] || 0) + 1;
      byChannel[attempt.channel] = (byChannel[attempt.channel] || 0) + 1;
    }

    let positiveResponses = 0;
    let responsesWithTime = 0;
    let totalResponseTime = 0;

    for (const response of responses) {
      if (response.responseType === 'engaged' || response.sentiment === 'positive') {
        positiveResponses++;

        // Find the original attempt to get the channel
        const attempt = attempts.find((a) => a.id === response.outreachId);
        if (attempt) {
          positiveByChannel[attempt.channel] = (positiveByChannel[attempt.channel] || 0) + 1;
          totalByChannel[attempt.channel] = (totalByChannel[attempt.channel] || 0) + 1;
        }
      }

      if (response.responseTime) {
        responsesWithTime++;
        totalResponseTime += response.responseTime;

        const attempt = attempts.find((a) => a.id === response.outreachId);
        if (attempt) {
          if (!responseTimesByChannel[attempt.channel]) {
            responseTimesByChannel[attempt.channel] = [];
          }
          responseTimesByChannel[attempt.channel].push(response.responseTime);
        }
      }
    }

    // Find most effective channel
    let mostEffectiveChannel: string | null = null;
    let highestPositiveRate = 0;
    for (const [channel, total] of Object.entries(totalByChannel)) {
      const positive = positiveByChannel[channel] || 0;
      const rate = positive / total;
      if (rate > highestPositiveRate) {
        highestPositiveRate = rate;
        mostEffectiveChannel = channel;
      }
    }

    // Find most effective type (similar logic)
    const typeResponses: Record<string, { positive: number; total: number }> = {};
    for (const response of responses) {
      const attempt = attempts.find((a) => a.id === response.outreachId);
      if (attempt) {
        if (!typeResponses[attempt.type]) {
          typeResponses[attempt.type] = { positive: 0, total: 0 };
        }
        typeResponses[attempt.type].total++;
        if (response.responseType === 'engaged' || response.sentiment === 'positive') {
          typeResponses[attempt.type].positive++;
        }
      }
    }

    let mostEffectiveType: string | null = null;
    let highestTypeRate = 0;
    for (const [type, { positive, total }] of Object.entries(typeResponses)) {
      const rate = positive / total;
      if (rate > highestTypeRate) {
        highestTypeRate = rate;
        mostEffectiveType = type;
      }
    }

    return {
      totalAttempts: attempts.length,
      byType,
      byChannel,
      responseRate: attempts.length > 0 ? responses.length / attempts.length : 0,
      positiveResponseRate: responses.length > 0 ? positiveResponses / responses.length : 0,
      averageResponseTime: responsesWithTime > 0 ? totalResponseTime / responsesWithTime : null,
      mostEffectiveChannel,
      mostEffectiveType,
      bestTimeOfDay: null, // TODO: Implement time-of-day analysis
      bestDayOfWeek: null, // TODO: Implement day-of-week analysis
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get outreach stats');
    return {
      totalAttempts: 0,
      byType: {},
      byChannel: {},
      responseRate: 0,
      positiveResponseRate: 0,
      averageResponseTime: null,
      mostEffectiveChannel: null,
      mostEffectiveType: null,
      bestTimeOfDay: null,
      bestDayOfWeek: null,
    };
  }
}

/**
 * Should we reach out to this user right now?
 */
export async function shouldOutreach(
  userId: string,
  outreachType: string,
  channel: 'voice' | 'sms' | 'push' | 'email'
): Promise<{ should: boolean; reason?: string }> {
  try {
    // Check Redis suppression first
    const redis = getRedisCache();
    const suppression = await redis.isOutreachSuppressed(userId);
    if (suppression.suppressed) {
      return { should: false, reason: suppression.reason };
    }

    // Check if user is currently in a session
    const isActive = await redis.isUserActive(userId);
    if (isActive) {
      return { should: false, reason: 'User is in active session' };
    }

    // Check user preferences
    const preferences = await getOutreachPreferences(userId);
    if (preferences) {
      // Check channel preference
      if (!preferences.preferredChannels.includes(channel)) {
        return {
          should: false,
          reason: `User prefers ${preferences.preferredChannels.join(', ')}`,
        };
      }

      // Check DND
      if (preferences.doNotDisturb?.length) {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        for (const dnd of preferences.doNotDisturb) {
          if (currentTime >= dnd.start && currentTime <= dnd.end) {
            return { should: false, reason: 'Do Not Disturb active' };
          }
        }
      }

      // Check frequency
      if (preferences.frequency === 'rarely') {
        const stats = await getOutreachStats(userId, 7);
        if (stats.totalAttempts > 1) {
          return {
            should: false,
            reason: 'User prefers rare outreach (already reached out this week)',
          };
        }
      }
    }

    return { should: true };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Error checking outreach eligibility');
    // Fail open - allow outreach if we can't check
    return { should: true };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const outreachHistory = {
  recordAttempt: recordOutreachAttempt,
  recordResponse: recordOutreachResponse,
  updateStatus: updateOutreachStatus,
  getPreferences: getOutreachPreferences,
  updatePreferences: updateOutreachPreferences,
  getStats: getOutreachStats,
  shouldOutreach,
};

export default outreachHistory;
