/**
 * Publisher Responses
 *
 * Handles publisher responses to reviews.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { state } from './state.js';
import type { Review } from './types.js';

const log = getLogger().child({ module: 'marketplace-reviews' });

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
