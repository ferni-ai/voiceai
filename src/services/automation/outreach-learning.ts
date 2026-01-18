/**
 * Outreach Learning Loop - Feedback-Driven Optimization
 *
 * Part of the "Better Than Human" automation layer.
 * Closes the feedback loop on outreach effectiveness.
 *
 * Problem: We send outreach but don't learn what works.
 * Solution: Track every outreach, measure response, learn preferences.
 *
 * @module services/automation/outreach-learning
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import type { OutreachChannel } from './insight-action-bridge.js';

const log = createLogger({ module: 'outreach-learning' });

// ============================================================================
// Types (OutreachChannel imported from insight-action-bridge)
// ============================================================================

export interface OutreachFeedback {
  outreachId: string;
  userId: string;
  channel: OutreachChannel;
  templateId: string;
  personaId: string;
  sentAt: string;
  // Engagement metrics
  opened: boolean;
  openedAt?: string;
  responded: boolean;
  respondedAt?: string;
  responseTime?: number; // milliseconds
  // Quality metrics
  sentiment: 'positive' | 'neutral' | 'negative' | 'unknown';
  ledToConversation: boolean;
  conversationSessionId?: string;
  conversationDuration?: number;
  // User feedback
  userFeedback?: string;
  userRating?: 1 | 2 | 3 | 4 | 5;
  optedOut?: boolean;
}

export interface UserOutreachPreferences {
  userId: string;
  preferredChannel: OutreachChannel;
  preferredTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  preferredDayOfWeek: number[]; // 0-6, Sunday-Saturday
  preferredPersona: string;
  optimalFrequency: number; // days between outreach
  dislikedTemplates: string[];
  lastUpdated: string;
}

export interface TemplateEffectiveness {
  templateId: string;
  totalSent: number;
  openRate: number;
  responseRate: number;
  conversionRate: number; // led to conversation
  averageSentiment: number; // -1 to 1
  averageRating: number;
  optOutRate: number;
}

export interface LearningUpdate {
  userId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  timestamp: string;
}

export interface OutreachEffectiveness {
  templateId: string;
  metrics: {
    totalSent: number;
    openRate: number;
    responseRate: number;
    conversionRate: number;
    averageSentiment: number;
    averageRating: number;
    optOutRate: number;
  };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Record feedback for an outreach
 */
export async function recordOutreachFeedback(
  feedback: Partial<OutreachFeedback> & { outreachId: string; userId: string }
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.warn('Firestore not available, skipping feedback recording');
    return;
  }

  try {
    const existingDoc = await db
      .collection('bogle_users')
      .doc(feedback.userId)
      .collection('outreach_feedback')
      .doc(feedback.outreachId)
      .get();

    if (existingDoc.exists) {
      // Update existing feedback
      await existingDoc.ref.update({
        ...feedback,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Create new feedback record
      await existingDoc.ref.set({
        ...feedback,
        createdAt: new Date().toISOString(),
      });
    }

    log.debug({ userId: feedback.userId, outreachId: feedback.outreachId }, 'Recorded outreach feedback');
  } catch (error) {
    log.error({ error: String(error), feedback }, 'Failed to record outreach feedback');
  }
}

/**
 * Analyze feedback and update user preferences
 */
export async function updateLearning(userId: string): Promise<LearningUpdate[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const updates: LearningUpdate[] = [];

  try {
    // Get recent feedback (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const feedbackSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('outreach_feedback')
      .where('sentAt', '>=', thirtyDaysAgo.toISOString())
      .get();

    if (feedbackSnapshot.empty) {
      return updates;
    }

    const feedbacks = feedbackSnapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as OutreachFeedback);

    // Get current preferences
    const prefsDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('outreach_preferences')
      .doc('current')
      .get();

    const currentPrefs: UserOutreachPreferences = prefsDoc.exists
      ? (prefsDoc.data() as UserOutreachPreferences)
      : {
          userId,
          preferredChannel: 'push',
          preferredTimeOfDay: 'morning',
          preferredDayOfWeek: [1, 2, 3, 4, 5],
          preferredPersona: 'ferni',
          optimalFrequency: 3,
          dislikedTemplates: [],
          lastUpdated: new Date().toISOString(),
        };

    // Analyze channel effectiveness
    const channelStats = analyzeChannelEffectiveness(feedbacks);
    const bestChannel = findBestChannel(channelStats);
    if (bestChannel && bestChannel !== currentPrefs.preferredChannel) {
      updates.push({
        userId,
        field: 'preferredChannel',
        oldValue: currentPrefs.preferredChannel,
        newValue: bestChannel,
        reason: `${bestChannel} has higher engagement rate`,
        timestamp: new Date().toISOString(),
      });
      currentPrefs.preferredChannel = bestChannel;
    }

    // Analyze time of day effectiveness
    const timeStats = analyzeTimeEffectiveness(feedbacks);
    const bestTime = findBestTime(timeStats);
    if (bestTime && bestTime !== currentPrefs.preferredTimeOfDay) {
      updates.push({
        userId,
        field: 'preferredTimeOfDay',
        oldValue: currentPrefs.preferredTimeOfDay,
        newValue: bestTime,
        reason: `${bestTime} shows better response rates`,
        timestamp: new Date().toISOString(),
      });
      currentPrefs.preferredTimeOfDay = bestTime;
    }

    // Analyze persona effectiveness
    const personaStats = analyzePersonaEffectiveness(feedbacks);
    const bestPersona = findBestPersona(personaStats);
    if (bestPersona && bestPersona !== currentPrefs.preferredPersona) {
      updates.push({
        userId,
        field: 'preferredPersona',
        oldValue: currentPrefs.preferredPersona,
        newValue: bestPersona,
        reason: `${bestPersona} resonates better with user`,
        timestamp: new Date().toISOString(),
      });
      currentPrefs.preferredPersona = bestPersona;
    }

    // Identify disliked templates (opt-out or negative sentiment)
    const dislikedTemplates = feedbacks
      .filter((f: OutreachFeedback) => f.optedOut || f.sentiment === 'negative' || (f.userRating && f.userRating <= 2))
      .map((f: OutreachFeedback) => f.templateId)
      .filter((t: string | undefined): t is string => t !== undefined);

    const newDisliked = [...new Set([...currentPrefs.dislikedTemplates, ...dislikedTemplates])];
    if (newDisliked.length > currentPrefs.dislikedTemplates.length) {
      updates.push({
        userId,
        field: 'dislikedTemplates',
        oldValue: currentPrefs.dislikedTemplates,
        newValue: newDisliked,
        reason: 'User showed negative response to templates',
        timestamp: new Date().toISOString(),
      });
      currentPrefs.dislikedTemplates = newDisliked;
    }

    // Calculate optimal frequency based on response patterns
    const optimalFreq = calculateOptimalFrequency(feedbacks);
    if (optimalFreq !== currentPrefs.optimalFrequency) {
      updates.push({
        userId,
        field: 'optimalFrequency',
        oldValue: currentPrefs.optimalFrequency,
        newValue: optimalFreq,
        reason: 'Adjusted based on response patterns',
        timestamp: new Date().toISOString(),
      });
      currentPrefs.optimalFrequency = optimalFreq;
    }

    // Save updated preferences
    currentPrefs.lastUpdated = new Date().toISOString();
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('outreach_preferences')
      .doc('current')
      .set(currentPrefs);

    log.info({ userId, updateCount: updates.length }, 'Updated user outreach preferences');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update learning');
  }

  return updates;
}

/**
 * Get user's outreach preferences
 */
export async function getUserOutreachPreferences(
  userId: string
): Promise<UserOutreachPreferences | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('outreach_preferences')
      .doc('current')
      .get();

    return doc.exists ? (doc.data() as UserOutreachPreferences) : null;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user preferences');
    return null;
  }
}

/**
 * Get template effectiveness metrics
 */
export async function getTemplateEffectiveness(
  templateId: string
): Promise<OutreachEffectiveness | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    // Aggregate across all users (collection group query)
    const snapshot = await db
      .collectionGroup('outreach_feedback')
      .where('templateId', '==', templateId)
      .get();

    if (snapshot.empty) return null;

    const feedbacks = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as OutreachFeedback);

    const totalSent = feedbacks.length;
    const opened = feedbacks.filter((f: OutreachFeedback) => f.opened).length;
    const responded = feedbacks.filter((f: OutreachFeedback) => f.responded).length;
    const converted = feedbacks.filter((f: OutreachFeedback) => f.ledToConversation).length;
    const optedOut = feedbacks.filter((f: OutreachFeedback) => f.optedOut).length;

    const sentiments: number[] = feedbacks
      .filter((f: OutreachFeedback) => f.sentiment !== 'unknown')
      .map((f: OutreachFeedback) => (f.sentiment === 'positive' ? 1 : f.sentiment === 'negative' ? -1 : 0));

    const ratings = feedbacks
      .filter((f: OutreachFeedback) => f.userRating !== undefined)
      .map((f: OutreachFeedback) => f.userRating as number);

    return {
      templateId,
      metrics: {
        totalSent,
        openRate: totalSent > 0 ? opened / totalSent : 0,
        responseRate: totalSent > 0 ? responded / totalSent : 0,
        conversionRate: totalSent > 0 ? converted / totalSent : 0,
        averageSentiment: sentiments.length > 0 ? sentiments.reduce((a: number, b: number) => a + b, 0) / sentiments.length : 0,
        averageRating: ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0,
        optOutRate: totalSent > 0 ? optedOut / totalSent : 0,
      },
    };
  } catch (error) {
    log.error({ error: String(error), templateId }, 'Failed to get template effectiveness');
    return null;
  }
}

/**
 * Run batch learning update for all users with recent feedback
 */
export async function runBatchLearningUpdate(): Promise<{
  usersProcessed: number;
  totalUpdates: number;
}> {
  const db = getFirestoreDb();
  if (!db) return { usersProcessed: 0, totalUpdates: 0 };

  try {
    // Find users with recent feedback
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 7);

    const usersSnapshot = await db.collection('bogle_users').get();

    let usersProcessed = 0;
    let totalUpdates = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Check if user has recent feedback
      const feedbackCheck = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('outreach_feedback')
        .where('sentAt', '>=', recentCutoff.toISOString())
        .limit(1)
        .get();

      if (!feedbackCheck.empty) {
        const updates = await updateLearning(userId);
        if (updates.length > 0) {
          usersProcessed++;
          totalUpdates += updates.length;
        }
      }
    }

    log.info({ usersProcessed, totalUpdates }, 'Completed batch learning update');
    return { usersProcessed, totalUpdates };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed batch learning update');
    return { usersProcessed: 0, totalUpdates: 0 };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function analyzeChannelEffectiveness(
  feedbacks: OutreachFeedback[]
): Map<OutreachChannel, { total: number; responded: number; positive: number }> {
  const stats = new Map<OutreachChannel, { total: number; responded: number; positive: number }>();

  for (const feedback of feedbacks) {
    const channel = feedback.channel;
    if (!channel) continue;

    const current = stats.get(channel) || { total: 0, responded: 0, positive: 0 };
    current.total++;
    if (feedback.responded) current.responded++;
    if (feedback.sentiment === 'positive') current.positive++;
    stats.set(channel, current);
  }

  return stats;
}

function findBestChannel(
  stats: Map<OutreachChannel, { total: number; responded: number; positive: number }>
): OutreachChannel | null {
  let bestChannel: OutreachChannel | null = null;
  let bestScore = 0;

  for (const [channel, data] of stats) {
    if (data.total < 3) continue; // Need minimum sample size

    const responseRate = data.responded / data.total;
    const positiveRate = data.positive / data.total;
    const score = responseRate * 0.6 + positiveRate * 0.4;

    if (score > bestScore) {
      bestScore = score;
      bestChannel = channel;
    }
  }

  return bestChannel;
}

function analyzeTimeEffectiveness(
  feedbacks: OutreachFeedback[]
): Map<string, { total: number; responded: number }> {
  const stats = new Map<string, { total: number; responded: number }>();

  for (const feedback of feedbacks) {
    if (!feedback.sentAt) continue;

    const hour = new Date(feedback.sentAt).getHours();
    let timeOfDay: string;
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const current = stats.get(timeOfDay) || { total: 0, responded: 0 };
    current.total++;
    if (feedback.responded) current.responded++;
    stats.set(timeOfDay, current);
  }

  return stats;
}

function findBestTime(
  stats: Map<string, { total: number; responded: number }>
): 'morning' | 'afternoon' | 'evening' | 'night' | null {
  let bestTime: 'morning' | 'afternoon' | 'evening' | 'night' | null = null;
  let bestRate = 0;

  for (const [time, data] of stats) {
    if (data.total < 2) continue;

    const rate = data.responded / data.total;
    if (rate > bestRate) {
      bestRate = rate;
      bestTime = time as 'morning' | 'afternoon' | 'evening' | 'night';
    }
  }

  return bestTime;
}

function analyzePersonaEffectiveness(
  feedbacks: OutreachFeedback[]
): Map<string, { total: number; positive: number; rating: number[] }> {
  const stats = new Map<string, { total: number; positive: number; rating: number[] }>();

  for (const feedback of feedbacks) {
    const persona = feedback.personaId;
    if (!persona) continue;

    const current = stats.get(persona) || { total: 0, positive: 0, rating: [] };
    current.total++;
    if (feedback.sentiment === 'positive') current.positive++;
    if (feedback.userRating) current.rating.push(feedback.userRating);
    stats.set(persona, current);
  }

  return stats;
}

function findBestPersona(
  stats: Map<string, { total: number; positive: number; rating: number[] }>
): string | null {
  let bestPersona: string | null = null;
  let bestScore = 0;

  for (const [persona, data] of stats) {
    if (data.total < 2) continue;

    const positiveRate = data.positive / data.total;
    const avgRating = data.rating.length > 0
      ? data.rating.reduce((a, b) => a + b, 0) / data.rating.length / 5
      : 0.5;
    const score = positiveRate * 0.5 + avgRating * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestPersona = persona;
    }
  }

  return bestPersona;
}

function calculateOptimalFrequency(feedbacks: OutreachFeedback[]): number {
  // Sort by sent date
  const sorted = feedbacks
    .filter((f) => f.sentAt)
    .sort((a, b) => new Date(a.sentAt!).getTime() - new Date(b.sentAt!).getTime());

  if (sorted.length < 3) return 3; // Default

  // Find gaps between positive responses
  const positiveGaps: number[] = [];
  let lastPositive: Date | null = null;

  for (const feedback of sorted) {
    if (feedback.sentiment === 'positive' || feedback.responded) {
      if (lastPositive) {
        const gap = (new Date(feedback.sentAt!).getTime() - lastPositive.getTime()) / (1000 * 60 * 60 * 24);
        positiveGaps.push(gap);
      }
      lastPositive = new Date(feedback.sentAt!);
    }
  }

  if (positiveGaps.length === 0) return 3;

  // Return median gap, clamped between 1 and 14 days
  const medianGap = positiveGaps.sort((a, b) => a - b)[Math.floor(positiveGaps.length / 2)];
  return Math.max(1, Math.min(14, Math.round(medianGap)));
}
