/**
 * Review Voting
 *
 * Handles helpfulness voting for reviews.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserId } from '../schema/types.js';
import { state } from './state.js';
import type { Review, ReviewVote } from './types.js';

const log = getLogger().child({ module: 'marketplace-reviews' });

// ============================================================================
// VOTING
// ============================================================================

/**
 * Vote on a review's helpfulness
 */
export function voteReview(reviewId: string, userId: UserId, helpful: boolean): Review {
  const review = state.reviews.get(reviewId);
  if (!review) {
    throw new Error('Review not found');
  }

  if (review.userId === userId) {
    throw new Error('Cannot vote on your own review');
  }

  const voteKey = `${reviewId}:${userId}`;
  const existingVote = state.votes.get(voteKey);

  // Remove previous vote counts
  if (existingVote) {
    if (existingVote.helpful) {
      review.helpfulCount = Math.max(0, review.helpfulCount - 1);
    } else {
      review.notHelpfulCount = Math.max(0, review.notHelpfulCount - 1);
    }
  }

  // Add new vote
  const vote: ReviewVote = {
    reviewId,
    userId,
    helpful,
    votedAt: new Date().toISOString(),
  };

  state.votes.set(voteKey, vote);

  if (helpful) {
    review.helpfulCount++;
  } else {
    review.notHelpfulCount++;
  }

  log.debug({ reviewId, userId, helpful }, 'Review vote recorded');
  return review;
}

/**
 * Remove a vote
 */
export function removeVote(reviewId: string, userId: UserId): void {
  const review = state.reviews.get(reviewId);
  if (!review) return;

  const voteKey = `${reviewId}:${userId}`;
  const existingVote = state.votes.get(voteKey);

  if (existingVote) {
    if (existingVote.helpful) {
      review.helpfulCount = Math.max(0, review.helpfulCount - 1);
    } else {
      review.notHelpfulCount = Math.max(0, review.notHelpfulCount - 1);
    }
    state.votes.delete(voteKey);
  }
}
