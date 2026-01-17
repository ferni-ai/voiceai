/**
 * Family Routes
 *
 * GET /api/family/pending - Get pending family member approvals
 * POST /api/family/approve - Approve a pending family member
 * POST /api/family/reject - Reject a pending family member
 *
 * These routes handle the sponsor approval workflow for family members
 * who self-register during phone calls.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { getUserId, sendJSON, parseRequestBody } from '../helpers.js';
import type { AnyRecord } from './types.js';
import {
  getPendingApprovalsForSponsor,
  approvePendingApproval,
  rejectPendingApproval,
} from '../../services/identity/sponsor-notifications.js';

const log = createLogger({ module: 'FamilyAPI' });

// ============================================================================
// GET /api/family/pending
// Get all pending family member approvals for the current user
// ============================================================================

export async function handleGetPendingApprovals(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendJSON(res, { success: false, error: 'Unauthorized' }, 401);
    return;
  }

  log.debug({ userId }, 'Getting pending family approvals');

  try {
    const pending = getPendingApprovalsForSponsor(userId);

    // Transform for API response
    const pendingList = pending.map((approval) => ({
      id: approval.id,
      identityId: approval.identityId,
      callerName: approval.callerName,
      callerPhone: maskPhone(approval.callerPhone),
      relationship: approval.relationship,
      notes: approval.notes,
      callTimestamp: approval.callTimestamp.toISOString(),
      status: approval.status,
    }));

    log.info({ userId, pendingCount: pendingList.length }, 'Retrieved pending approvals');

    sendJSON(res, {
      success: true,
      pending: pendingList,
      count: pendingList.length,
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error getting pending approvals');
    sendJSON(res, { success: false, error: 'Failed to get pending approvals' }, 500);
  }
}

// ============================================================================
// POST /api/family/approve
// Approve a pending family member registration
// ============================================================================

interface ApproveRequestBody {
  approvalId: string;
  displayName?: string;
  relationship?: string;
  accessLevel?: 'full' | 'limited' | 'supervised';
  notes?: string;
}

export async function handleApproveFamily(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendJSON(res, { success: false, error: 'Unauthorized' }, 401);
    return;
  }

  try {
    const body = (await parseRequestBody(req)) as ApproveRequestBody;
    const { approvalId, displayName, relationship, accessLevel, notes } = body;

    if (!approvalId) {
      sendJSON(res, { success: false, error: 'Missing approvalId' }, 400);
      return;
    }

    log.info({ userId, approvalId }, 'Approving family member');

    const result = await approvePendingApproval(approvalId, userId, {
      displayName,
      relationship,
      accessLevel,
      notes,
    });

    if (result.success) {
      log.info({ userId, approvalId }, 'Family member approved successfully');
      sendJSON(res, { success: true, message: 'Family member approved' });
    } else {
      log.warn({ userId, approvalId, error: result.error }, 'Failed to approve family member');
      sendJSON(res, { success: false, error: result.error }, 400);
    }
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error approving family member');
    sendJSON(res, { success: false, error: 'Failed to approve family member' }, 500);
  }
}

// ============================================================================
// POST /api/family/reject
// Reject a pending family member registration
// ============================================================================

interface RejectRequestBody {
  approvalId: string;
}

export async function handleRejectFamily(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendJSON(res, { success: false, error: 'Unauthorized' }, 401);
    return;
  }

  try {
    const body = (await parseRequestBody(req)) as RejectRequestBody;
    const { approvalId } = body;

    if (!approvalId) {
      sendJSON(res, { success: false, error: 'Missing approvalId' }, 400);
      return;
    }

    log.info({ userId, approvalId }, 'Rejecting family member');

    const result = await rejectPendingApproval(approvalId, userId);

    if (result.success) {
      log.info({ userId, approvalId }, 'Family member rejected');
      sendJSON(res, { success: true, message: 'Family member rejected' });
    } else {
      log.warn({ userId, approvalId, error: result.error }, 'Failed to reject family member');
      sendJSON(res, { success: false, error: result.error }, 400);
    }
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error rejecting family member');
    sendJSON(res, { success: false, error: 'Failed to reject family member' }, 500);
  }
}

// ============================================================================
// ROUTER
// ============================================================================

export async function familyRouter(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method;

  // GET /api/family/pending
  if (method === 'GET' && pathname === '/api/family/pending') {
    await handleGetPendingApprovals(req, res, parsedUrl);
    return true;
  }

  // POST /api/family/approve
  if (method === 'POST' && pathname === '/api/family/approve') {
    await handleApproveFamily(req, res, parsedUrl);
    return true;
  }

  // POST /api/family/reject
  if (method === 'POST' && pathname === '/api/family/reject') {
    await handleRejectFamily(req, res, parsedUrl);
    return true;
  }

  return false;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Mask phone number for privacy.
 */
function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  return phone.slice(0, 4) + '****' + phone.slice(-2);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  familyRouter,
  handleGetPendingApprovals,
  handleApproveFamily,
  handleRejectFamily,
};
