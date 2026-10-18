/**
 * Commitments API Routes
 *
 * Exposes the Commitment Keeper superhuman service to the frontend.
 * "Better Than Human" - We never forget what you said you'd do.
 *
 * GET /api/commitments - Get user's commitments
 * GET /api/commitments/:id - Get specific commitment
 * PATCH /api/commitments/:id - Update commitment status
 * POST /api/commitments/:id/complete | /dismiss - Close one (owner only)
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import type { ClosedBy } from '../../services/superhuman/commitment-store.js';
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
  // The verified caller; a ?userId= naming someone else is not an identity.
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 20, 100);
    // Only active commitments are loaded, so 'active' and 'all' are the useful values
    const status = parsedUrl.searchParams.get('status');
    const type = parsedUrl.searchParams.get('type'); // commitment type filter

    // The throwing read: a store failure is a 500 here, never an empty "all caught up"
    const { loadActiveCommitmentsOrThrow } =
      await import('../../services/superhuman/commitment-store.js');

    let commitments = [...(await loadActiveCommitmentsOrThrow(userId))];

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
      personaId: c.personaId,
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
// POST /api/commitments/:id/complete | /dismiss - Close one from the app
// ============================================================================

const CLOSE_ROUTE = /^\/api\/commitments\/([A-Za-z0-9_-]{1,200})\/(complete|dismiss)$/;

/**
 * Close one of the verified caller's active commitments: done, or dismissed.
 * Its follow-through follow-up closes with it (done or released), so a
 * dismissed commitment is never texted about. 404 when they have no such
 * active commitment; 500 when a write fails, never a success that didn't land
 * (a retry of the same close finishes the follow-up step).
 */
export async function handleCloseCommitment(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  commitmentId: string,
  status: ClosedBy
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;
  try {
    const { closeCommitmentOrThrow } =
      await import('../../services/superhuman/commitment-store.js');
    const outcome = await closeCommitmentOrThrow(userId, commitmentId, status);
    if (outcome === 'missing') {
      sendError(res, 'Commitment not found', 404);
      return;
    }
    await closeCommitmentFollowUp(userId, commitmentId, status);
    if (status === 'completed' && outcome === 'closed') {
      const { recordWinFromCommitment } = await import('../../services/superhuman/wins.js');
      void recordWinFromCommitment(userId, commitmentId);
    }
    sendJSON(res, { success: true, id: commitmentId, status });
  } catch (err) {
    log.error({ error: String(err), userId, commitmentId }, 'Failed to close commitment');
    sendError(res, 'Failed to update commitment', 500);
  }
}

/** The follow-up imported from this commitment (source 'commitments'), closed the same way. */
async function closeCommitmentFollowUp(
  userId: string,
  commitmentId: string,
  status: ClosedBy
): Promise<void> {
  const [{ closeFromSource }, { firestoreFollowUpStore }] = await Promise.all([
    import('../../services/follow-through/index.js'),
    import('../../services/stores/follow-through-store.js'),
  ]);
  const store = firestoreFollowUpStore();
  if (!store) throw new Error('Follow-through store unavailable');
  const source = { store: 'commitments', ref: commitmentId };
  await closeFromSource(
    store,
    userId,
    source,
    status === 'completed' ? 'done' : 'release',
    new Date()
  );
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

  // POST /api/commitments/:id/complete | /dismiss
  const closeMatch = pathname.match(CLOSE_ROUTE);
  if (closeMatch && req.method === 'POST') {
    const status = closeMatch[2] === 'complete' ? 'completed' : 'dismissed';
    await handleCloseCommitment(req, res, parsedUrl, closeMatch[1]!, status);
    return true;
  }

  return false;
}
