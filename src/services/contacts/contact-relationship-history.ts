/**
 * Contact interaction history, stats and topics ("Better Than Human" memory).
 * Extracted from contact-relationship-service.ts.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { INTERACTIONS_COLLECTION, getContact, getFirestore } from './contact-relationship-store.js';
import type { InteractionRecord, InteractionType } from './contact-relationship-types.js';

const log = getLogger();

// ============================================================================
// INTERACTION HISTORY - "Better Than Human" Memory
// ============================================================================

/**
 * Get full interaction history for a contact
 */
export async function getInteractionHistory(
  userId: string,
  contactId: string,
  options: {
    limit?: number;
    type?: InteractionType;
    since?: Date;
  } = {}
): Promise<InteractionRecord[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    let query = firestore
      .collection(INTERACTIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('contactId', '==', contactId);

    if (options.type) {
      query = query.where('type', '==', options.type);
    }

    if (options.since) {
      query = query.where('date', '>=', options.since);
    }

    query = query.orderBy('date', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date: data.date?.toDate?.() || new Date(data.date),
      } as InteractionRecord;
    });
  } catch (error) {
    log.warn({ error: String(error), userId, contactId }, 'Failed to get interaction history');
    return [];
  }
}

/**
 * Get interaction statistics for a contact
 *
 * "Better Than Human" - Perfect pattern recognition
 */
export async function getInteractionStats(
  userId: string,
  contactId: string
): Promise<{
  totalInteractions: number;
  byType: Record<string, number>;
  avgPerMonth: number;
  longestStreak: { type: InteractionType; count: number } | null;
  lastByType: Record<string, Date>;
  sentimentTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  suggestedNextInteraction: InteractionType;
}> {
  const history = await getInteractionHistory(userId, contactId, { limit: 100 });

  if (history.length === 0) {
    return {
      totalInteractions: 0,
      byType: {},
      avgPerMonth: 0,
      longestStreak: null,
      lastByType: {},
      sentimentTrend: 'unknown',
      suggestedNextInteraction: 'text',
    };
  }

  // Count by type
  const byType: Record<string, number> = {};
  const lastByType: Record<string, Date> = {};
  let longestStreak: { type: InteractionType; count: number } | null = null;

  for (const int of history) {
    byType[int.type] = (byType[int.type] || 0) + 1;

    if (!lastByType[int.type] || int.date > lastByType[int.type]) {
      lastByType[int.type] = int.date;
    }

    if (int.isStreak && int.streakCount) {
      if (!longestStreak || int.streakCount > longestStreak.count) {
        longestStreak = { type: int.type, count: int.streakCount };
      }
    }
  }

  // Calculate avg per month
  const firstInteraction = history[history.length - 1]?.date || new Date();
  const monthsSpan = Math.max(
    1,
    Math.ceil((Date.now() - firstInteraction.getTime()) / (1000 * 60 * 60 * 24 * 30))
  );
  const avgPerMonth = Math.round((history.length / monthsSpan) * 10) / 10;

  // Sentiment trend (last 10 vs previous 10)
  const recent = history.slice(0, 10);
  const previous = history.slice(10, 20);
  const recentPositive = recent.filter((i) => i.sentiment === 'positive').length;
  const previousPositive = previous.filter((i) => i.sentiment === 'positive').length;

  let sentimentTrend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
  if (previous.length >= 5) {
    if (recentPositive > previousPositive + 2) sentimentTrend = 'improving';
    else if (recentPositive < previousPositive - 2) sentimentTrend = 'declining';
    else sentimentTrend = 'stable';
  }

  // Suggest next interaction based on patterns
  const mostCommon = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  let suggestedNextInteraction: InteractionType = 'text';

  // If they mostly text, suggest a call for variety
  if (mostCommon?.[0] === 'text' && byType['call'] < byType['text'] / 3) {
    suggestedNextInteraction = 'call';
  } else if (mostCommon?.[0] === 'call' && !byType['hangout']) {
    suggestedNextInteraction = 'hangout';
  } else {
    suggestedNextInteraction = (mostCommon?.[0] as InteractionType) || 'text';
  }

  return {
    totalInteractions: history.length,
    byType,
    avgPerMonth,
    longestStreak,
    lastByType,
    sentimentTrend,
    suggestedNextInteraction,
  };
}

/**
 * Get conversation topics to bring up
 *
 * "Better Than Human" - Perfect recall of what they care about
 */
export async function getTopicsToDiscuss(
  userId: string,
  contactId: string
): Promise<
  Array<{
    topic: string;
    lastDiscussed: Date;
    sentiment: string;
    suggestion: string;
  }>
> {
  const contact = await getContact(userId, contactId);
  if (!contact || contact.topics.length === 0) return [];

  const now = new Date();

  return contact.topics
    .filter((t) => t.mentionCount >= 2) // Topics they've mentioned multiple times
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 5)
    .map((topic) => {
      const daysSince = Math.floor(
        (now.getTime() - topic.lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
      );

      let suggestion = '';
      if (daysSince > 30) {
        suggestion = `It's been a while since you discussed ${topic.topic}. Ask how it's going!`;
      } else if (topic.sentiment === 'negative') {
        suggestion = `Check in on ${topic.topic} - they seemed stressed about it.`;
      } else if (topic.sentiment === 'positive') {
        suggestion = `They were excited about ${topic.topic} - celebrate their progress!`;
      } else {
        suggestion = `${topic.topic} comes up often. Show you remember!`;
      }

      return {
        topic: topic.topic,
        lastDiscussed: topic.lastMentioned,
        sentiment: topic.sentiment || 'neutral',
        suggestion,
      };
    });
}
