/**
 * Review CRUD Operations
 *
 * Create, Read, Update, Delete operations for reviews.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { MarketplaceId, UserId } from '../schema/types.js';
import { state } from './state.js';
import { updateStats } from './stats.js';
import type { CreateReviewInput, Review, UpdateReviewInput } from './types.js';

const log = getLogger().child({ module: 'marketplace-reviews' });

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new review
 */
export function createReview(input: CreateReviewInput): Review {
  // Validate rating
  if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
    throw new Error('Rating must be an integer between 1 and 5');
  }

  // Check for existing review from same user on same item
  const existing = Array.from(state.reviews.values()).find(
    (r) => r.itemId === input.itemId && r.userId === input.userId && r.status !== 'rejected'
  );

  if (existing) {
    throw new Error('You have already reviewed this item');
  }

  const review: Review = {
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    itemId: input.itemId,
    itemType: input.itemType,
    userId: input.userId,
    userName: input.userName,
    rating: input.rating,
    title: input.title,
    body: input.body,
    version: input.version,
    createdAt: new Date().toISOString(),
    status: 'pending', // Reviews go through moderation
    helpfulCount: 0,
    notHelpfulCount: 0,
  };

  state.reviews.set(review.id, review);
  updateStats(input.itemId);

  log.info({ reviewId: review.id, itemId: input.itemId, rating: input.rating }, 'Review created');

  return review;
}

// ============================================================================
// READ
// ============================================================================

/**
 * Get a review by ID
 */
export function getReview(reviewId: string): Review | null {
  return state.reviews.get(reviewId) || null;
}

/**
 * List reviews for an item
 */
export function listReviews(
  itemId: MarketplaceId,
  options?: {
    status?: Review['status'];
    sortBy?: 'recent' | 'helpful' | 'rating_high' | 'rating_low';
    limit?: number;
    offset?: number;
  }
): { reviews: Review[]; total: number } {
  let reviews = Array.from(state.reviews.values()).filter((r) => r.itemId === itemId);

  // Default to approved reviews only for public access
  const status = options?.status || 'approved';
  reviews = reviews.filter((r) => r.status === status);

  // Sort
  const sortBy = options?.sortBy || 'recent';
  switch (sortBy) {
    case 'recent':
      reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case 'helpful':
      reviews.sort((a, b) => b.helpfulCount - a.helpfulCount);
      break;
    case 'rating_high':
      reviews.sort((a, b) => b.rating - a.rating);
      break;
    case 'rating_low':
      reviews.sort((a, b) => a.rating - b.rating);
      break;
  }

  const total = reviews.length;
  const offset = options?.offset || 0;
  const limit = options?.limit || 20;

  return {
    reviews: reviews.slice(offset, offset + limit),
    total,
  };
}

/**
 * Get reviews by a user
 */
export function getUserReviews(userId: UserId): Review[] {
  return Array.from(state.reviews.values()).filter((r) => r.userId === userId);
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update a review (by the author)
 */
export function updateReview(reviewId: string, userId: UserId, input: UpdateReviewInput): Review {
  const review = state.reviews.get(reviewId);
  if (!review) {
    throw new Error('Review not found');
  }

  if (review.userId !== userId) {
    throw new Error('Not authorized to update this review');
  }

  if (input.rating !== undefined) {
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
      throw new Error('Rating must be an integer between 1 and 5');
    }
    review.rating = input.rating;
  }

  if (input.title !== undefined) {
    review.title = input.title;
  }

  if (input.body !== undefined) {
    review.body = input.body;
  }

  review.updatedAt = new Date().toISOString();
  review.status = 'pending'; // Re-submit for moderation

  updateStats(review.itemId);

  log.info({ reviewId }, 'Review updated');
  return review;
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Delete a review (by the author)
 */
export function deleteReview(reviewId: string, userId: UserId): void {
  const review = state.reviews.get(reviewId);
  if (!review) {
    throw new Error('Review not found');
  }

  if (review.userId !== userId) {
    throw new Error('Not authorized to delete this review');
  }

  const itemId = review.itemId;
  state.reviews.delete(reviewId);
  updateStats(itemId);

  log.info({ reviewId }, 'Review deleted');
}
