/**
 * Marketplace Reviews System
 *
 * Ratings and reviews for marketplace tools and agents.
 *
 * Features:
 * - Star ratings (1-5)
 * - Text reviews with moderation
 * - Helpful/not helpful votes
 * - Publisher responses
 * - Aggregate statistics
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { MarketplaceId, UserId } from '../schema/types.js';

const log = getLogger().child({ module: 'marketplace-reviews' });

// ============================================================================
// TYPES
// ============================================================================

export interface Review {
  id: string;
  itemId: MarketplaceId;
  itemType: 'tool' | 'agent';
  userId: UserId;
  userName?: string; // Display name (optional, can be anonymous)

  // Rating
  rating: number; // 1-5
  title?: string;
  body: string;

  // Metadata
  createdAt: string;
  updatedAt?: string;
  version?: string; // Version of item when reviewed

  // Moderation
  status: 'pending' | 'approved' | 'rejected' | 'flagged';
  moderatedAt?: string;
  moderatedBy?: string;
  moderationNote?: string;

  // Engagement
  helpfulCount: number;
  notHelpfulCount: number;

  // Publisher response
  publisherResponse?: {
    body: string;
    respondedAt: string;
    respondedBy: string;
  };
}

export interface ReviewStats {
  itemId: MarketplaceId;
  totalReviews: number;
  averageRating: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  recommendationRate: number; // % of 4+ star reviews
}

export interface ReviewVote {
  reviewId: string;
  userId: UserId;
  helpful: boolean;
  votedAt: string;
}

export interface CreateReviewInput {
  itemId: MarketplaceId;
  itemType: 'tool' | 'agent';
  userId: UserId;
  userName?: string;
  rating: number;
  title?: string;
  body: string;
  version?: string;
}

export interface UpdateReviewInput {
  rating?: number;
  title?: string;
  body?: string;
}

// ============================================================================
// IN-MEMORY STORAGE (Firestore in production)
// ============================================================================

interface ReviewsState {
  reviews: Map<string, Review>;
  votes: Map<string, ReviewVote>; // key: `${reviewId}:${userId}`
  stats: Map<MarketplaceId, ReviewStats>;
}

const state: ReviewsState = {
  reviews: new Map(),
  votes: new Map(),
  stats: new Map(),
};

// ============================================================================
// REVIEW CRUD
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

/**
 * Get a review by ID
 */
export function getReview(reviewId: string): Review | null {
  return state.reviews.get(reviewId) || null;
}

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

// ============================================================================
// PUBLISHER RESPONSES
// ============================================================================

/**
 * Add a publisher response to a review
 */
export function addPublisherResponse(reviewId: string, publisherId: string, body: string): Review {
  const review = state.reviews.get(reviewId);
  if (!review) {
    throw new Error('Review not found');
  }

  review.publisherResponse = {
    body,
    respondedAt: new Date().toISOString(),
    respondedBy: publisherId,
  };

  log.info({ reviewId, publisherId }, 'Publisher response added');
  return review;
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get review statistics for an item
 */
export function getReviewStats(itemId: MarketplaceId): ReviewStats {
  const cached = state.stats.get(itemId);
  if (cached) return cached;

  // Calculate fresh stats
  return calculateStats(itemId);
}

/**
 * Update stats for an item
 */
function updateStats(itemId: MarketplaceId): void {
  const stats = calculateStats(itemId);
  state.stats.set(itemId, stats);
}

/**
 * Calculate review statistics
 */
function calculateStats(itemId: MarketplaceId): ReviewStats {
  const reviews = Array.from(state.reviews.values()).filter(
    (r) => r.itemId === itemId && r.status === 'approved'
  );

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  let totalRating = 0;
  let highRatingCount = 0;

  for (const review of reviews) {
    const rating = review.rating as 1 | 2 | 3 | 4 | 5;
    distribution[rating]++;
    totalRating += review.rating;
    if (review.rating >= 4) highRatingCount++;
  }

  const totalReviews = reviews.length;
  const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;
  const recommendationRate = totalReviews > 0 ? (highRatingCount / totalReviews) * 100 : 0;

  return {
    itemId,
    totalReviews,
    averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
    ratingDistribution: distribution,
    recommendationRate: Math.round(recommendationRate),
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Clear all review data (for testing)
 */
export function clearReviews(): void {
  state.reviews.clear();
  state.votes.clear();
  state.stats.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const reviewsService = {
  // CRUD
  create: createReview,
  get: getReview,
  update: updateReview,
  delete: deleteReview,
  list: listReviews,
  getUserReviews,

  // Voting
  vote: voteReview,
  removeVote,

  // Moderation
  moderate: moderateReview,
  getPending: getPendingReviews,
  flag: flagReview,

  // Publisher
  respond: addPublisherResponse,

  // Stats
  getStats: getReviewStats,

  // Utils
  clear: clearReviews,
};
