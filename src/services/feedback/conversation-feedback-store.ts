/**
 * Conversation Feedback Store
 *
 * Unified storage for contextual feedback collected during conversations.
 * Stores in Firestore under profiles/{userId}/conversationFeedback/{feedbackId}
 *
 * Features:
 * - Create pending feedback prompts
 * - Record user reactions
 * - Query feedback history
 * - Generate aggregated stats
 *
 * @module services/feedback/conversation-feedback-store
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { deepRemoveUndefined } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

import type {
  ConversationFeedback,
  FeedbackPromptInput,
  FeedbackReaction,
  FeedbackReactionInput,
  UserFeedbackStats,
} from './types.js';

const log = createLogger({ module: 'ConversationFeedbackStore' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_PATH = 'conversationFeedback';

// ============================================================================
// CREATE FEEDBACK PROMPT
// ============================================================================

/**
 * Create a pending feedback prompt.
 * Called when the trigger engine decides to show a feedback prompt.
 *
 * @returns The created feedback ID, or null if storage unavailable
 */
export async function createFeedbackPrompt(
  input: FeedbackPromptInput
): Promise<{ ok: true; feedbackId: string } | { ok: false; reason: string }> {
  const { userId, sessionId, personaId, trigger, context } = input;

  if (!userId) return { ok: false, reason: 'userId required' };
  if (!sessionId) return { ok: false, reason: 'sessionId required' };

  try {
    const db = getFirestore();
    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const feedbackDoc: Omit<ConversationFeedback, 'promptedAt'> & {
      promptedAt: FirebaseFirestore.FieldValue;
      promptedAtMs: number;
    } = {
      id: feedbackId,
      userId,
      sessionId,
      personaId,
      trigger,
      context,
      reaction: null,
      promptedAt: FieldValue.serverTimestamp(),
      promptedAtMs: Date.now(),
      wasEngaged: false,
    };

    const ref = db.collection('profiles').doc(userId).collection(COLLECTION_PATH).doc(feedbackId);

    await ref.set(deepRemoveUndefined(feedbackDoc));

    log.info({ feedbackId, userId, trigger }, 'Created feedback prompt');

    return { ok: true, feedbackId };
  } catch (error) {
    log.warn({ error, userId }, 'Failed to create feedback prompt');
    return { ok: false, reason: 'storage_unavailable' };
  }
}

// ============================================================================
// RECORD REACTION
// ============================================================================

/**
 * Record user's reaction to a feedback prompt.
 *
 * @returns Success status
 */
export async function recordFeedbackReaction(
  input: FeedbackReactionInput
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { feedbackId, userId, reaction } = input;

  if (!feedbackId) return { ok: false, reason: 'feedbackId required' };
  if (!userId) return { ok: false, reason: 'userId required' };

  try {
    const db = getFirestore();
    const ref = db.collection('profiles').doc(userId).collection(COLLECTION_PATH).doc(feedbackId);

    const doc = await ref.get();
    if (!doc.exists) {
      return { ok: false, reason: 'feedback_not_found' };
    }

    const data = doc.data() as ConversationFeedback & { promptedAtMs?: number };
    const promptedAtMs = data.promptedAtMs ?? Date.now();
    const responseTimeMs = Date.now() - promptedAtMs;

    await ref.update({
      reaction,
      respondedAt: FieldValue.serverTimestamp(),
      responseTimeMs,
      wasEngaged: reaction !== 'skipped' && reaction !== null,
    });

    log.info({ feedbackId, userId, reaction, responseTimeMs }, 'Recorded feedback reaction');

    return { ok: true };
  } catch (error) {
    log.warn({ error, userId, feedbackId }, 'Failed to record feedback reaction');
    return { ok: false, reason: 'storage_unavailable' };
  }
}

// ============================================================================
// MARK AS SKIPPED
// ============================================================================

/**
 * Mark a feedback prompt as skipped (auto-hidden without response).
 */
export async function markFeedbackSkipped(
  feedbackId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return recordFeedbackReaction({
    feedbackId,
    userId,
    reaction: 'skipped',
  });
}

// ============================================================================
// QUERY FEEDBACK
// ============================================================================

/**
 * Get recent feedback for a user.
 */
export async function getRecentFeedback(
  userId: string,
  limit = 50
): Promise<ConversationFeedback[]> {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection('profiles')
      .doc(userId)
      .collection(COLLECTION_PATH)
      .orderBy('promptedAtMs', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        promptedAt: data.promptedAt?.toDate?.() ?? new Date(data.promptedAtMs),
        respondedAt: data.respondedAt?.toDate?.(),
      } as ConversationFeedback;
    });
  } catch (error) {
    log.warn({ error, userId }, 'Failed to get recent feedback');
    return [];
  }
}

/**
 * Get feedback for a specific session.
 */
export async function getSessionFeedback(
  userId: string,
  sessionId: string
): Promise<ConversationFeedback[]> {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection('profiles')
      .doc(userId)
      .collection(COLLECTION_PATH)
      .where('sessionId', '==', sessionId)
      .orderBy('promptedAtMs', 'asc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        promptedAt: data.promptedAt?.toDate?.() ?? new Date(data.promptedAtMs),
        respondedAt: data.respondedAt?.toDate?.(),
      } as ConversationFeedback;
    });
  } catch (error) {
    log.warn({ error, userId, sessionId }, 'Failed to get session feedback');
    return [];
  }
}

/**
 * Get feedback by persona.
 */
export async function getPersonaFeedback(
  userId: string,
  personaId: string,
  limit = 100
): Promise<ConversationFeedback[]> {
  try {
    const db = getFirestore();
    const snapshot = await db
      .collection('profiles')
      .doc(userId)
      .collection(COLLECTION_PATH)
      .where('personaId', '==', personaId)
      .orderBy('promptedAtMs', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        promptedAt: data.promptedAt?.toDate?.() ?? new Date(data.promptedAtMs),
        respondedAt: data.respondedAt?.toDate?.(),
      } as ConversationFeedback;
    });
  } catch (error) {
    log.warn({ error, userId, personaId }, 'Failed to get persona feedback');
    return [];
  }
}

// ============================================================================
// AGGREGATED STATS
// ============================================================================

/**
 * Calculate aggregated feedback statistics for a user.
 */
export async function calculateUserFeedbackStats(
  userId: string
): Promise<UserFeedbackStats | null> {
  try {
    const feedback = await getRecentFeedback(userId, 500);

    if (feedback.length === 0) {
      return null;
    }

    const stats: UserFeedbackStats = {
      userId,
      totalPrompts: feedback.length,
      totalResponses: 0,
      responseRate: 0,
      reactionCounts: {},
      avgResponseTimeMs: 0,
      byPersona: {},
      byTrigger: {
        natural_pause: { prompts: 0, responses: 0, positiveRate: 0 },
        topic_transition: { prompts: 0, responses: 0, positiveRate: 0 },
        insight_moment: { prompts: 0, responses: 0, positiveRate: 0 },
        explicit_ask: { prompts: 0, responses: 0, positiveRate: 0 },
      },
      lastUpdated: new Date(),
    };

    let totalResponseTime = 0;
    let responseCount = 0;

    for (const fb of feedback) {
      // Count reactions
      const reaction = fb.reaction ?? 'skipped';
      stats.reactionCounts[reaction] = (stats.reactionCounts[reaction] ?? 0) + 1;

      // Track engagement
      if (fb.wasEngaged) {
        stats.totalResponses++;
        if (fb.responseTimeMs) {
          totalResponseTime += fb.responseTimeMs;
          responseCount++;
        }
      }

      // By persona
      if (!stats.byPersona[fb.personaId]) {
        stats.byPersona[fb.personaId] = {
          prompts: 0,
          resonated: 0,
          helpful: 0,
          tooMuch: 0,
          offTrack: 0,
        };
      }
      const personaStats = stats.byPersona[fb.personaId];
      if (personaStats) {
        personaStats.prompts++;
        if (fb.reaction === 'resonated') personaStats.resonated++;
        if (fb.reaction === 'helpful') personaStats.helpful++;
        if (fb.reaction === 'too_much') personaStats.tooMuch++;
        if (fb.reaction === 'off_track') personaStats.offTrack++;
      }

      // By trigger
      const triggerStats = stats.byTrigger[fb.trigger];
      if (triggerStats) {
        triggerStats.prompts++;
        if (fb.wasEngaged) triggerStats.responses++;
        if (fb.reaction === 'resonated' || fb.reaction === 'helpful') {
          // Will calculate positive rate at the end
        }
      }
    }

    // Calculate averages
    stats.responseRate = stats.totalPrompts > 0 ? stats.totalResponses / stats.totalPrompts : 0;
    stats.avgResponseTimeMs = responseCount > 0 ? totalResponseTime / responseCount : 0;

    // Calculate positive rates by trigger
    for (const trigger of Object.keys(stats.byTrigger) as Array<keyof typeof stats.byTrigger>) {
      const triggerData = stats.byTrigger[trigger];
      const triggerFeedback = feedback.filter((f) => f.trigger === trigger);
      const positiveCount = triggerFeedback.filter(
        (f) => f.reaction === 'resonated' || f.reaction === 'helpful'
      ).length;
      const respondedCount = triggerFeedback.filter((f) => f.wasEngaged).length;
      triggerData.positiveRate = respondedCount > 0 ? positiveCount / respondedCount : 0;
    }

    return stats;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to calculate feedback stats');
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const conversationFeedbackStore = {
  createPrompt: createFeedbackPrompt,
  recordReaction: recordFeedbackReaction,
  markSkipped: markFeedbackSkipped,
  getRecent: getRecentFeedback,
  getSession: getSessionFeedback,
  getPersona: getPersonaFeedback,
  calculateStats: calculateUserFeedbackStats,
};
