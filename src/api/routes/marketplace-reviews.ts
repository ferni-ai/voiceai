/**
 * Marketplace Reviews API Routes
 *
 * Endpoints for managing reviews and ratings for marketplace items.
 *
 * Routes:
 * - GET /api/marketplace/reviews/:itemId - List reviews for an item
 * - GET /api/marketplace/reviews/:itemId/stats - Get review statistics
 * - POST /api/marketplace/reviews - Create a review
 * - PUT /api/marketplace/reviews/:reviewId - Update a review
 * - DELETE /api/marketplace/reviews/:reviewId - Delete a review
 * - POST /api/marketplace/reviews/:reviewId/vote - Vote on a review
 * - POST /api/marketplace/reviews/:reviewId/flag - Flag a review
 * - POST /api/marketplace/reviews/:reviewId/respond - Publisher response
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  addPublisherResponse,
  createReview,
  deleteReview,
  flagReview,
  getReviewStats,
  listReviews,
  updateReview,
  voteReview,
  type CreateReviewInput,
  type UpdateReviewInput,
} from '../../marketplace/reviews/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { parseBody, sendJSON } from '../helpers.js';

const log = getLogger().child({ module: 'reviews-api' });

// ============================================================================
// HELPERS
// ============================================================================

// parseBody and sendJSON imported from '../helpers.js'

/**
 * Legacy wrapper for sendJSON with (res, status, data) signature.
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

function getUserId(req: IncomingMessage): string | null {
  // SECURITY: Prioritize Firebase auth over deprecated x-user-id
  const firebaseUid = req.headers['x-firebase-uid'] as string | undefined;
  if (firebaseUid) return firebaseUid;
  return (req.headers['x-user-id'] as string) || null;
}

function getPublisherId(req: IncomingMessage): string | null {
  return (req.headers['x-publisher-id'] as string) || null;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleReviewsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // GET /api/marketplace/reviews/:itemId/stats
  if (pathname.match(/^\/api\/marketplace\/reviews\/[^/]+\/stats$/) && method === 'GET') {
    const itemId = pathname.split('/')[4];

    try {
      const stats = getReviewStats(itemId);
      sendJson(res, 200, { stats });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/reviews/:itemId
  if (pathname.match(/^\/api\/marketplace\/reviews\/[^/]+$/) && method === 'GET') {
    const itemId = pathname.split('/')[4];

    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const sortBy = url.searchParams.get('sortBy') as
        | 'recent'
        | 'helpful'
        | 'rating_high'
        | 'rating_low'
        | null;
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const result = listReviews(itemId, {
        sortBy: sortBy || 'recent',
        limit,
        offset,
      });

      sendJson(res, 200, result);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // POST /api/marketplace/reviews
  if (pathname === '/api/marketplace/reviews' && method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const body = await parseBody<CreateReviewInput>(req);

      if (!body.itemId || !body.itemType || !body.rating || !body.body) {
        sendJson(res, 400, { error: 'Missing required fields: itemId, itemType, rating, body' });
        return true;
      }

      const review = createReview({
        ...body,
        userId,
      });

      log.info({ reviewId: review.id, itemId: body.itemId, userId }, 'Review created');
      sendJson(res, 201, { review });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const status = err.message.includes('already reviewed') ? 409 : 400;
      sendJson(res, status, { error: err.message });
      return true;
    }
  }

  // PUT /api/marketplace/reviews/:reviewId
  if (pathname.match(/^\/api\/marketplace\/reviews\/[^/]+$/) && method === 'PUT') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const reviewId = pathname.split('/')[4];

    try {
      const body = await parseBody<UpdateReviewInput>(req);
      const review = updateReview(reviewId, userId, body);

      log.info({ reviewId, userId }, 'Review updated');
      sendJson(res, 200, { review });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const status = err.message.includes('not found')
        ? 404
        : err.message.includes('Not authorized')
          ? 403
          : 400;
      sendJson(res, status, { error: err.message });
      return true;
    }
  }

  // DELETE /api/marketplace/reviews/:reviewId
  if (pathname.match(/^\/api\/marketplace\/reviews\/[^/]+$/) && method === 'DELETE') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const reviewId = pathname.split('/')[4];

    try {
      deleteReview(reviewId, userId);
      log.info({ reviewId, userId }, 'Review deleted');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const status = err.message.includes('not found')
        ? 404
        : err.message.includes('Not authorized')
          ? 403
          : 400;
      sendJson(res, status, { error: err.message });
      return true;
    }
  }

  // POST /api/marketplace/reviews/:reviewId/vote
  if (pathname.match(/^\/api\/marketplace\/reviews\/[^/]+\/vote$/) && method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const reviewId = pathname.split('/')[4];

    try {
      const body = await parseBody<{ helpful: boolean }>(req);

      if (typeof body.helpful !== 'boolean') {
        sendJson(res, 400, { error: 'Missing required field: helpful (boolean)' });
        return true;
      }

      const review = voteReview(reviewId, userId, body.helpful);
      sendJson(res, 200, { review });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const status = err.message.includes('not found')
        ? 404
        : err.message.includes('own review')
          ? 400
          : 500;
      sendJson(res, status, { error: err.message });
      return true;
    }
  }

  // POST /api/marketplace/reviews/:reviewId/flag
  if (pathname.match(/^\/api\/marketplace\/reviews\/[^/]+\/flag$/) && method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const reviewId = pathname.split('/')[4];

    try {
      const body = await parseBody<{ reason: string }>(req);

      if (!body.reason) {
        sendJson(res, 400, { error: 'Missing required field: reason' });
        return true;
      }

      flagReview(reviewId, userId, body.reason);
      sendJson(res, 200, { success: true, message: 'Review flagged for moderation' });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, err.message.includes('not found') ? 404 : 400, { error: err.message });
      return true;
    }
  }

  // POST /api/marketplace/reviews/:reviewId/respond
  if (pathname.match(/^\/api\/marketplace\/reviews\/[^/]+\/respond$/) && method === 'POST') {
    const publisherId = getPublisherId(req);
    if (!publisherId) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return true;
    }

    const reviewId = pathname.split('/')[4];

    try {
      const body = await parseBody<{ body: string }>(req);

      if (!body.body) {
        sendJson(res, 400, { error: 'Missing required field: body' });
        return true;
      }

      // TODO: Verify publisher owns the item being reviewed
      const review = addPublisherResponse(reviewId, publisherId, body.body);
      log.info({ reviewId, publisherId }, 'Publisher response added');
      sendJson(res, 200, { review });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, err.message.includes('not found') ? 404 : 400, { error: err.message });
      return true;
    }
  }

  return false;
}

/**
 * Check if a path is a reviews route
 */
export function isReviewsRoute(pathname: string): boolean {
  return pathname.startsWith('/api/marketplace/reviews');
}
