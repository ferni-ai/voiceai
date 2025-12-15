/**
 * Marketplace Admin API Routes
 *
 * Admin endpoints for reviewing and moderating marketplace submissions.
 *
 * Routes:
 * - GET /api/admin/marketplace/queue - Get items pending review (NEW - uses review-queue system)
 * - POST /api/admin/marketplace/review/:id/assign - Assign reviewer (NEW)
 * - POST /api/admin/marketplace/review/:id/decide - Submit review decision (NEW)
 * - GET /api/admin/marketplace/review/:itemId/history - Get review history (NEW)
 * - GET /api/admin/marketplace/item/:id - Get item details
 * - POST /api/admin/marketplace/item/:id/approve - Approve an item (LEGACY)
 * - POST /api/admin/marketplace/item/:id/reject - Reject an item (LEGACY)
 * - POST /api/admin/marketplace/item/:id/suspend - Suspend an item
 * - GET /api/admin/marketplace/reviews/pending - Get reviews pending moderation
 * - POST /api/admin/marketplace/reviews/:id/moderate - Moderate a review
 * - GET /api/admin/marketplace/stats - Get marketplace statistics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getAgent,
  getTool,
  listAgents,
  listTools,
  type AgentManifest,
  type ToolManifest,
} from '../../marketplace/index.js';
import {
  getPendingReviews,
  getReviewStats,
  moderateReview,
} from '../../marketplace/reviews/index.js';
import {
  assignReviewer,
  getReviewHistory,
  getReviewQueue,
  getSubmission,
  submitReview,
} from '../review-queue.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'marketplace-admin' });

// ============================================================================
// TYPES
// ============================================================================

interface AdminSession {
  adminId: string;
  adminName: string;
  permissions: string[];
}

interface ReviewQueueItem {
  id: string;
  type: 'tool' | 'agent';
  name: string;
  displayName?: string;
  version: string;
  publisher: {
    id: string;
    name: string;
    verified: boolean;
  };
  description: string;
  submittedAt: string;
  trustLevel: string;
  permissions: {
    required: number;
    optional: number;
  };
  category: string;
  tags: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Verify admin authentication
 */
function getAdmin(req: IncomingMessage): AdminSession | null {
  const adminId = req.headers['x-admin-id'] as string;
  const adminName = req.headers['x-admin-name'] as string;

  if (!adminId) return null;

  return {
    adminId,
    adminName: adminName || 'Admin',
    permissions: ['marketplace:review', 'marketplace:moderate'],
  };
}

/**
 * Convert manifest to queue item
 */
function toQueueItem(
  manifest: ToolManifest | AgentManifest,
  type: 'tool' | 'agent'
): ReviewQueueItem {
  return {
    id: manifest.id,
    type,
    name: manifest.name,
    displayName: type === 'agent' ? (manifest as AgentManifest).displayName : undefined,
    version: manifest.version,
    publisher: manifest.publisher,
    description: manifest.description.short,
    submittedAt: manifest.verification.verifiedAt || new Date().toISOString(),
    trustLevel: manifest.verification.trustLevel,
    permissions: {
      required: manifest.permissions.required.length,
      optional: manifest.permissions.optional.length,
    },
    category: manifest.metadata.category,
    tags: manifest.metadata.tags,
  };
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleMarketplaceAdminRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // All admin routes require authentication
  const admin = getAdmin(req);
  if (!admin) {
    sendJson(res, 401, { error: 'Admin authentication required' });
    return true;
  }

  // GET /api/admin/marketplace/queue - Get items pending review (NEW - uses review-queue)
  if (pathname === '/api/admin/marketplace/queue' && method === 'GET') {
    try {
      // Use the new review queue system
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const status = url.searchParams.get('status') as 'pending_review' | 'in_review' | null;
      const assignedTo = url.searchParams.get('assignedTo') || undefined;

      const submissions = await getReviewQueue({
        status: status || ['pending_review', 'in_review'],
        assignedTo,
        sortBy: 'submittedAt',
        sortOrder: 'asc',
      });

      sendJson(res, 200, {
        queue: submissions,
        totalCount: submissions.length,
        breakdown: {
          pending: submissions.filter((s) => s.status === 'pending_review').length,
          inReview: submissions.filter((s) => s.status === 'in_review').length,
          tools: submissions.filter((s) => s.itemType === 'tool').length,
          agents: submissions.filter((s) => s.itemType === 'agent').length,
        },
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // POST /api/admin/marketplace/review/:id/assign - Assign reviewer (NEW)
  if (pathname.match(/^\/api\/admin\/marketplace\/review\/[^/]+\/assign$/) && method === 'POST') {
    const itemId = pathname.split('/')[5];

    try {
      const body = await parseBody<{ reviewerId: string; reviewerName?: string }>(req);

      if (!body.reviewerId) {
        sendJson(res, 400, { error: 'reviewerId is required' });
        return true;
      }

      const submission = await assignReviewer(
        itemId,
        body.reviewerId,
        body.reviewerName || admin.adminName
      );

      log.info({ itemId, reviewerId: body.reviewerId, adminId: admin.adminId }, 'Reviewer assigned');

      sendJson(res, 200, { submission });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, err.message.includes('not found') ? 404 : 400, { error: err.message });
      return true;
    }
  }

  // POST /api/admin/marketplace/review/:id/decide - Submit review decision (NEW)
  if (pathname.match(/^\/api\/admin\/marketplace\/review\/[^/]+\/decide$/) && method === 'POST') {
    const itemId = pathname.split('/')[5];

    try {
      const body = await parseBody<{
        decision: 'approved' | 'rejected' | 'changes_requested';
        feedback: string;
      }>(req);

      if (!body.decision || !body.feedback) {
        sendJson(res, 400, { error: 'decision and feedback are required' });
        return true;
      }

      if (!['approved', 'rejected', 'changes_requested'].includes(body.decision)) {
        sendJson(res, 400, { error: 'Invalid decision' });
        return true;
      }

      const submission = await submitReview(
        itemId,
        admin.adminId,
        body.decision,
        body.feedback
      );

      log.info({ itemId, decision: body.decision, adminId: admin.adminId }, 'Review submitted');

      sendJson(res, 200, { submission });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, err.message.includes('not found') ? 404 : 400, { error: err.message });
      return true;
    }
  }

  // GET /api/admin/marketplace/review/:itemId/history - Get review history (NEW)
  if (pathname.match(/^\/api\/admin\/marketplace\/review\/[^/]+\/history$/) && method === 'GET') {
    const itemId = pathname.split('/')[5];

    try {
      const history = await getReviewHistory(itemId);

      sendJson(res, 200, { history, totalVersions: history.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/admin/marketplace/item/:id - Get item details
  if (pathname.match(/^\/api\/admin\/marketplace\/item\/[^/]+$/) && method === 'GET') {
    const itemId = pathname.split('/')[5];

    try {
      const tool = getTool(itemId);
      const agent = getAgent(itemId);
      const item = tool || agent;

      if (!item) {
        sendJson(res, 404, { error: 'Item not found' });
        return true;
      }

      const type = tool ? 'tool' : 'agent';

      sendJson(res, 200, {
        item,
        type,
        reviewStats: getReviewStats(itemId),
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // POST /api/admin/marketplace/item/:id/approve - Approve an item
  if (pathname.match(/^\/api\/admin\/marketplace\/item\/[^/]+\/approve$/) && method === 'POST') {
    const itemId = pathname.split('/')[5];

    try {
      const body = await parseBody<{ note?: string; trustLevel?: string }>(req);
      const tool = getTool(itemId);
      const agent = getAgent(itemId);
      const item = tool || agent;

      if (!item) {
        sendJson(res, 404, { error: 'Item not found' });
        return true;
      }

      // Update verification status
      item.verification.verified = true;
      item.verification.verifiedAt = new Date().toISOString();
      item.verification.verifiedBy = admin.adminId;

      // Optionally upgrade trust level
      if (body.trustLevel === 'verified') {
        item.verification.trustLevel = 'verified';
      }

      log.info(
        { itemId, adminId: admin.adminId, trustLevel: item.verification.trustLevel },
        'Item approved'
      );

      sendJson(res, 200, {
        success: true,
        message: 'Item approved and published to marketplace',
        item: {
          id: item.id,
          name: item.name,
          trustLevel: item.verification.trustLevel,
          verifiedAt: item.verification.verifiedAt,
        },
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // POST /api/admin/marketplace/item/:id/reject - Reject an item
  if (pathname.match(/^\/api\/admin\/marketplace\/item\/[^/]+\/reject$/) && method === 'POST') {
    const itemId = pathname.split('/')[5];

    try {
      const body = await parseBody<{ reason: string; note?: string }>(req);

      if (!body.reason) {
        sendJson(res, 400, { error: 'Rejection reason is required' });
        return true;
      }

      const tool = getTool(itemId);
      const agent = getAgent(itemId);
      const item = tool || agent;

      if (!item) {
        sendJson(res, 404, { error: 'Item not found' });
        return true;
      }

      // Mark as rejected (in production, this would move to a rejected collection)
      item.verification.verified = false;
      item.verification.verifiedAt = new Date().toISOString();
      item.verification.verifiedBy = admin.adminId;

      log.info({ itemId, adminId: admin.adminId, reason: body.reason }, 'Item rejected');

      // TODO: Send rejection email to publisher

      sendJson(res, 200, {
        success: true,
        message: 'Item rejected',
        reason: body.reason,
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // POST /api/admin/marketplace/item/:id/suspend - Suspend an item
  if (pathname.match(/^\/api\/admin\/marketplace\/item\/[^/]+\/suspend$/) && method === 'POST') {
    const itemId = pathname.split('/')[5];

    try {
      const body = await parseBody<{ reason: string; duration?: string }>(req);

      if (!body.reason) {
        sendJson(res, 400, { error: 'Suspension reason is required' });
        return true;
      }

      const tool = getTool(itemId);
      const agent = getAgent(itemId);
      const item = tool || agent;

      if (!item) {
        sendJson(res, 404, { error: 'Item not found' });
        return true;
      }

      // Suspend by revoking verification
      item.verification.verified = false;

      log.info({ itemId, adminId: admin.adminId, reason: body.reason }, 'Item suspended');

      sendJson(res, 200, {
        success: true,
        message: 'Item suspended from marketplace',
        reason: body.reason,
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/admin/marketplace/reviews/pending - Get reviews pending moderation
  if (pathname === '/api/admin/marketplace/reviews/pending' && method === 'GET') {
    try {
      const reviews = getPendingReviews(50);
      sendJson(res, 200, { reviews, totalCount: reviews.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // POST /api/admin/marketplace/reviews/:id/moderate - Moderate a review
  if (
    pathname.match(/^\/api\/admin\/marketplace\/reviews\/[^/]+\/moderate$/) &&
    method === 'POST'
  ) {
    const reviewId = pathname.split('/')[5];

    try {
      const body = await parseBody<{
        decision: 'approved' | 'rejected' | 'flagged';
        note?: string;
      }>(req);

      if (!body.decision || !['approved', 'rejected', 'flagged'].includes(body.decision)) {
        sendJson(res, 400, { error: 'Invalid decision. Must be: approved, rejected, or flagged' });
        return true;
      }

      const review = moderateReview(reviewId, admin.adminId, body.decision, body.note);

      log.info({ reviewId, adminId: admin.adminId, decision: body.decision }, 'Review moderated');

      sendJson(res, 200, { review });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, err.message.includes('not found') ? 404 : 400, { error: err.message });
      return true;
    }
  }

  // GET /api/admin/marketplace/stats - Get marketplace statistics
  if (pathname === '/api/admin/marketplace/stats' && method === 'GET') {
    try {
      const allTools = listTools();
      const allAgents = listAgents();

      const stats = {
        items: {
          total: allTools.length + allAgents.length,
          tools: allTools.length,
          agents: allAgents.length,
          verified:
            allTools.filter((t) => t.verification.verified).length +
            allAgents.filter((a) => a.verification.verified).length,
          pending:
            allTools.filter((t) => !t.verification.verified).length +
            allAgents.filter((a) => !a.verification.verified).length,
        },
        trustLevels: {
          platform:
            allTools.filter((t) => t.verification.trustLevel === 'platform').length +
            allAgents.filter((a) => a.verification.trustLevel === 'platform').length,
          verified:
            allTools.filter((t) => t.verification.trustLevel === 'verified').length +
            allAgents.filter((a) => a.verification.trustLevel === 'verified').length,
          community:
            allTools.filter((t) => t.verification.trustLevel === 'community').length +
            allAgents.filter((a) => a.verification.trustLevel === 'community').length,
          unverified:
            allTools.filter((t) => t.verification.trustLevel === 'unverified').length +
            allAgents.filter((a) => a.verification.trustLevel === 'unverified').length,
        },
        pendingReviews: getPendingReviews(100).length,
      };

      sendJson(res, 200, { stats });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  return false;
}

/**
 * Check if a path is an admin marketplace route
 */
export function isMarketplaceAdminRoute(pathname: string): boolean {
  return pathname.startsWith('/api/admin/marketplace');
}
