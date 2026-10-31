/**
 * GET  /api/pending-actions/:id           the stored action, owner only
 * POST /api/pending-actions/:id/decision  { decision, actionHash }
 *
 * SECURITY: requireAuth; owner checked on the server (someone else's action
 * is the same 404 as a missing one). A decision also needs a non-anonymous
 * Firebase sign-in in the last 5 minutes (auth_time, token re-verified with
 * revocation checked), the hash of the action the page showed, and CSRF
 * safety: JSON body, allowed Origin when sent, bearer token (no cookies).
 * Everything is 404 unless APPROVALS_PAGE=on.
 * @module PendingActionRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { isApprovalsPageEnabled } from '../services/approvals/flag.js';
import {
  type DecisionOutcome,
  decidePendingAction,
  getPendingActionForUser,
} from '../services/approvals/pending-actions.js';
import { verifyFirebaseToken } from '../services/identity/firebase-auth.js';
import { isOriginAllowed } from '../servers/shared/cors.js';
import { parseJsonBodySafe } from '../utils/ddos-protection.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { sendApiError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'PendingActionRoutes' });

const PREFIX = '/api/pending-actions/';
export const FRESH_SIGN_IN_MS = 5 * 60 * 1000;

const NOT_FOUND = { status: 404, message: "Couldn't find that." };

const OUTCOME: Record<DecisionOutcome, { status: number; message: string; code?: string }> = {
  approved: { status: 200, message: 'Approved' },
  declined: { status: 200, message: 'Declined' },
  not_found: NOT_FOUND,
  expired: { status: 410, message: 'That one expired. Ask me again?', code: 'EXPIRED' },
  already_decided: { status: 409, message: 'You already answered that.', code: 'DECIDED' },
  hash_mismatch: { status: 409, message: 'That changed. Reload?', code: 'ACTION_CHANGED' },
  passkey_required: { status: 403, message: 'This one needs a passkey.', code: 'PASSKEY_REQUIRED' },
  passkey_failed: {
    status: 403,
    message: "That passkey didn't check out.",
    code: 'PASSKEY_FAILED',
  },
};

/** When userId last signed in (ms), from their own non-anonymous bearer token re-verified. */
async function signInTime(req: IncomingMessage, userId: string): Promise<number | null> {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const verified = await verifyFirebaseToken(header.slice(7));
  if (!verified || 'expired' in verified || verified.isAnonymous) return null;
  const authTime = verified.claims.auth_time;
  return verified.uid === userId && typeof authTime === 'number' ? authTime * 1000 : null;
}

function isCsrfSafe(req: IncomingMessage): boolean {
  const type = req.headers['content-type'] ?? '';
  const origin = req.headers.origin;
  return type.startsWith('application/json') && (origin === undefined || isOriginAllowed(origin));
}

async function decide(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  userId: string
): Promise<void> {
  if (!isCsrfSafe(req)) {
    sendApiError(res, { status: 403, message: "Couldn't do that from here.", code: 'CSRF' });
    return;
  }
  const body = await parseJsonBodySafe<{ decision?: unknown; actionHash?: unknown }>(req, res, {
    maxSize: 2048,
  });
  if (!body) return;
  const { decision, actionHash } = body;
  if ((decision !== 'approve' && decision !== 'decline') || typeof actionHash !== 'string') {
    sendApiError(res, { status: 400, message: "Couldn't read that answer.", code: 'BAD_REQUEST' });
    return;
  }
  // Approving needs a sign-in from the last 5 minutes; declining is always safe.
  const authTime = (await signInTime(req, userId)) ?? 0;
  if (decision === 'approve' && Date.now() - authTime > FRESH_SIGN_IN_MS) {
    sendApiError(res, {
      status: 401,
      message: 'Sign in again to approve.',
      code: 'REAUTH_REQUIRED',
    });
    return;
  }
  // No passkey check is wired yet (#887 follow-up), so money-moving actions stay unapprovable.
  const outcome = await decidePendingAction({ id, userId, decision, actionHash, authTime });
  const shown = OUTCOME[outcome];
  if (shown.status === 200) sendJSON(res, { status: outcome });
  else sendApiError(res, shown);
}

export async function handlePendingActionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(PREFIX)) return false;
  const [id, tail, ...rest] = pathname.slice(PREFIX.length).split('/');
  const isRead = req.method === 'GET' && tail === undefined;
  const isDecision = req.method === 'POST' && tail === 'decision' && rest.length === 0;
  if (!isApprovalsPageEnabled() || !(isRead || isDecision)) {
    sendApiError(res, NOT_FOUND);
    return true;
  }
  if (rateLimit(req, res, { maxRequests: 30, windowMs: 60_000, keyPrefix: 'pending-actions' }))
    return true;
  const auth = await requireAuth(req, res);
  if (!auth) return true;
  // Only a person's own Firebase sign-in, never a service API key or dev header.
  if (auth.authMethod !== 'firebase') {
    sendApiError(res, NOT_FOUND);
    return true;
  }

  try {
    const action = await getPendingActionForUser(id, auth.userId);
    if (!action) {
      sendApiError(res, NOT_FOUND);
      return true;
    }
    if (isRead) {
      const { userId: _owner, decision: _decision, deleteAt: _deleteAt, ...shown } = action;
      sendJSON(res, { action: shown });
      return true;
    }
    await decide(req, res, id, auth.userId);
  } catch (error) {
    log.error({ error: String(error) }, 'Pending action request failed');
    sendApiError(res, { status: 500, message: 'Internal error' });
  }
  return true;
}
