/**
 * Reviews State
 *
 * In-memory storage for reviews (Firestore in production).
 */

import type { MarketplaceId } from '../schema/types.js';
import type { Review, ReviewStats, ReviewVote } from './types.js';

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

interface ReviewsState {
  reviews: Map<string, Review>;
  votes: Map<string, ReviewVote>; // key: `${reviewId}:${userId}`
  stats: Map<MarketplaceId, ReviewStats>;
}

export const state: ReviewsState = {
  reviews: new Map(),
  votes: new Map(),
  stats: new Map(),
};

/**
 * Clear all review data (for testing)
 */
export function clearReviews(): void {
  state.reviews.clear();
  state.votes.clear();
  state.stats.clear();
}

// Alias for test compatibility
export const clearReviewsData = clearReviews;

