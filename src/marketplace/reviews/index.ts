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
 *
 * Module Structure:
 * - types.ts: Type definitions
 * - state.ts: In-memory storage
 * - crud.ts: Create, Read, Update, Delete operations
 * - voting.ts: Helpfulness voting
 * - moderation.ts: Moderation workflow
 * - publisher.ts: Publisher responses
 * - stats.ts: Statistics calculation
 */

// Types
export type { CreateReviewInput, Review, ReviewStats, ReviewVote, UpdateReviewInput } from './types.js';

// State management
export { clearReviews, clearReviewsData } from './state.js';

// CRUD operations
export { createReview, deleteReview, getReview, getUserReviews, listReviews, updateReview } from './crud.js';

// Voting
export { removeVote, voteReview } from './voting.js';

// Moderation
export { flagReview, getPendingReviews, moderateReview } from './moderation.js';

// Publisher responses
export { addPublisherResponse } from './publisher.js';

// Statistics
export { getReviewStats } from './stats.js';

// ============================================================================
// SERVICE FACADE
// ============================================================================

import { createReview, deleteReview, getReview, getUserReviews, listReviews, updateReview } from './crud.js';
import { flagReview, getPendingReviews, moderateReview } from './moderation.js';
import { addPublisherResponse } from './publisher.js';
import { clearReviews } from './state.js';
import { getReviewStats } from './stats.js';
import { removeVote, voteReview } from './voting.js';

/**
 * Reviews service facade for convenient access
 */
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
