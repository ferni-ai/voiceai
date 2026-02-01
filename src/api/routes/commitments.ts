/**
 * Commitments API Routes
 *
 * Exposes the Commitment Keeper superhuman service to the frontend.
 * "Better Than Human" - We never forget what you said you'd do.
 *
 * GET /api/commitments - Get user's commitments
 * GET /api/commitments/:id - Get specific commitment
 * PATCH /api/commitments/:id - Update commitment status
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireUserId, sendJSON, sendError, parsePositiveInt, readBody } from '../helpers.js';

const log = createLogger({ module: 'CommitmentsAPI' });

// ============================================================================
// GET /api/commitments - List commitments
// ============================================================================

export async function handleGetCommitments(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  // Get userId from query param (like background-results API)
  const userId = parsedUrl.searchParams.get('userId');
  if (!userId) {
    sendError(res, 'userId is required', 400);
    return;
  }

  try {
    const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 20, 100);
    const status = parsedUrl.searchParams.get('status'); // 'pending', 'completed', 'all'
    const type = parsedUrl.searchParams.get('type'); // commitment type filter

    const { loadUserCommitments } = await import('../../services/superhuman/commitment-keeper.js');

    let commitments = await loadUserCommitments(userId);

    // Filter by status
    if (status && status !== 'all') {
      commitments = commitments.filter((c) => c.status === status);
    }

    // Filter by type
    if (type) {
      commitments = commitments.filter((c) => c.type === type);
    }

    // Sort by createdAt descending (most recent first)
    commitments.sort((a, b) => b.createdAt - a.createdAt);

    // Limit results
    commitments = commitments.slice(0, limit);

    // Transform for frontend
    const items = commitments.map((c) => ({
      id: c.id,
      type: c.type,
      description: c.summary,
      topic: c.topic,
      dueDate: c.targetDate,
      status: c.status,
      createdAt: c.createdAt,
      lastMentioned: c.lastMentioned,
      followUpCount: c.followUpCount,
    }));

    sendJSON(res, {
      success: true,
      items,
      count: items.length,
      total: commitments.length,
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get commitments');
    sendError(res, 'Failed to fetch commitments', 500);
  }
}

// ============================================================================
// PATCH /api/commitments/:id - Update commitment
// ============================================================================

export async function handleUpdateCommitment(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  commitmentId: string
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = await readBody<{
      status?: 'active' | 'completed' | 'deferred' | 'abandoned' | 'unclear';
      reaction?: 'appreciated' | 'annoyed' | 'neutral';
    }>(req);

    if (!body) return;

    const { updateCommitmentStatus, loadUserCommitments } =
      await import('../../services/superhuman/commitment-keeper.js');

    // Verify commitment belongs to user
    const commitments = await loadUserCommitments(userId);
    const commitment = commitments.find((c) => c.id === commitmentId);

    if (!commitment) {
      sendError(res, 'Commitment not found', 404);
      return;
    }

    if (body.status) {
      await updateCommitmentStatus(userId, commitmentId, body.status, body.reaction);
    }

    sendJSON(res, {
      success: true,
      message: 'Commitment updated',
    });
  } catch (err) {
    log.error({ error: err, userId, commitmentId }, 'Failed to update commitment');
    sendError(res, 'Failed to update commitment', 500);
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleCommitmentsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/commitments
  if (pathname === '/api/commitments' && req.method === 'GET') {
    await handleGetCommitments(req, res, parsedUrl);
    return true;
  }

  // PATCH /api/commitments/:id
  const updateMatch = pathname.match(/^\/api\/commitments\/([^/]+)$/);
  if (updateMatch && req.method === 'PATCH') {
    await handleUpdateCommitment(req, res, parsedUrl, updateMatch[1]);
    return true;
  }

  return false;
}
