/**
 * Marketplace Reviews Types
 *
 * Type definitions for the reviews system.
 */

import type { MarketplaceId, UserId } from '../schema/types.js';

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
