/**
 * Predictive Insight Feedback Store
 *
 * Persists explicit feedback (helpful/accurate/notes) so we can:
 * - measure insight quality by type
 * - improve ranking and surfacing over time
 * - audit user experience
 *
 * This store is intentionally lightweight and safe:
 * - If Firestore isn't available, it returns a graceful failure
 * - It never blocks the user-facing request with a hard crash
 *
 * NOTE: Also delegates to the unified ConversationFeedbackStore for
 * cross-system analytics.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { removeUndefined } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { createFeedbackPrompt } from '../feedback/index.js';

const log = createLogger({ module: 'PredictiveInsightFeedbackStore' });

export interface PredictiveInsightFeedbackInput {
  userId: string;
  insightId: string;
  helpful?: boolean;
  accurate?: boolean;
  notes?: string;
  source?: 'api';
}

export interface PredictiveInsightFeedbackRecord extends PredictiveInsightFeedbackInput {
  id: string;
  createdAt: Date;
}

export async function recordPredictiveInsightFeedback(
  input: PredictiveInsightFeedbackInput
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const { userId, insightId, helpful, accurate, notes, source = 'api' } = input;

  if (!userId) return { ok: false, reason: 'userId required' };
  if (!insightId) return { ok: false, reason: 'insightId required' };
  if (helpful === undefined && accurate === undefined && !notes) {
    return { ok: false, reason: 'At least one of helpful, accurate, or notes is required' };
  }
  if (helpful !== undefined && typeof helpful !== 'boolean') {
    return { ok: false, reason: 'helpful must be boolean' };
  }
  if (accurate !== undefined && typeof accurate !== 'boolean') {
    return { ok: false, reason: 'accurate must be boolean' };
  }
  if (notes !== undefined && typeof notes !== 'string') {
    return { ok: false, reason: 'notes must be string' };
  }

  try {
    const db = getFirestore();
    const id = `pif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Store under the user profile for easy retrieval/aggregation
    const ref = db
      .collection('profiles')
      .doc(userId)
      .collection('predictiveInsightFeedback')
      .doc(id);

    await ref.set(
      removeUndefined({
        id,
        userId,
        insightId,
        helpful: helpful ?? null,
        accurate: accurate ?? null,
        notes: notes ?? null,
        source,
        createdAt: FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      })
    );

    // Delegate to unified feedback store for cross-system analytics
    // This is fire-and-forget, don't block on it
    void createFeedbackPrompt({
      userId,
      sessionId: `insight_${insightId}`,
      personaId: 'ferni', // Insights come from Ferni
      trigger: 'insight_moment',
      context: {
        lastAgentMessage: notes || '',
        lastUserMessage: '',
        topic: 'predictive_insight',
        turnCount: 0,
      },
    })
      .then((result) => {
        if (result.ok) {
          // Record the reaction immediately since we have it
          void import('../feedback/index.js')
            .then(({ recordFeedbackReaction }) => {
              void recordFeedbackReaction({
                feedbackId: result.feedbackId,
                userId,
                reaction: helpful ? 'helpful' : 'off_track',
              }).catch(() => {
                // Silent fail - feedback recording is optional
              });
            })
            .catch(() => {
              // Silent fail - feedback module load is optional
            });
        }
      })
      .catch(() => {
        // Silent fail - unified store is optional
      });

    return { ok: true, id };
  } catch (error) {
    // In local/dev, Firestore may not be initialized. Don't hard fail the API.
    log.warn({ error, userId, insightId }, 'Failed to record predictive insight feedback');
    return { ok: false, reason: 'storage_unavailable' };
  }
}
