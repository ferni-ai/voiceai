/**
 * Review Moderation
 *
 * Handles moderation workflow for reviews.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserId } from '../schema/types.js';
import { state } from './state.js';
import { updateStats } from './stats.js';
import type { Review } from './types.js';

const log = getLogger().child({ module: 'marketplace-reviews' });

// ============================================================================
// MODERATION
// ============================================================================

/**
 * Moderate a review (admin only)
 */
export function moderateReview(
  reviewId: string,
  moderatorId: string,
  decision: 'approved' | 'rejected' | 'flagged',
  note?: string
): Review {
  const review = state.reviews.get(reviewId);
  if (!review) {
    throw new Error('Review not found');
  }

  review.status = decision;
  review.moderatedAt = new Date().toISOString();
  review.moderatedBy = moderatorId;
  review.moderationNote = note;

  // Update stats when review is approved/rejected
  updateStats(review.itemId);

  log.info({ reviewId, decision, moderatorId }, 'Review moderated');
  return review;
}

/**
 * Get reviews pending moderation
 */
export function getPendingReviews(limit = 50): Review[] {
  return Array.from(state.reviews.values())
    .filter((r) => r.status === 'pending')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, limit);
}

/**
 * Flag a review for moderation
 */
export function flagReview(reviewId: string, userId: UserId, reason: string): void {
  const review = state.reviews.get(reviewId);
  if (!review) {
    throw new Error('Review not found');
  }

  review.status = 'flagged';
  review.moderationNote = `Flagged by ${userId}: ${reason}`;

  log.info({ reviewId, userId, reason }, 'Review flagged');
}
