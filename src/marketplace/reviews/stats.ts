/**
 * Review Statistics
 *
 * Handles calculation and caching of review statistics.
 */

import type { MarketplaceId } from '../schema/types.js';
import { state } from './state.js';
import type { ReviewStats } from './types.js';

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
export function updateStats(itemId: MarketplaceId): void {
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

