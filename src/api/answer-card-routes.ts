/**
 * GET /api/answer-cards/:id — one answer card, for its owner only.
 *
 * The page at /a/:id (apps/web answer-card-page.ui.ts) reads this. A card
 * that is missing, malformed or someone else's answers the same 404, and the
 * whole route answers 404 while APPROVALS_PAGE is off.
 *
 * SECURITY: requireAuth (Firebase ID token); owner checked against
 * auth.userId on the server; responses are no-store (sendJSON).
 *
 * @module AnswerCardRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getAnswerCardForUser } from '../services/approvals/answer-cards.js';
import { isApprovalsPageEnabled } from '../services/approvals/flag.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'AnswerCardRoutes' });

const PREFIX = '/api/answer-cards/';
/** One answer for missing, malformed, someone else's, and flag-off. */
const NOT_FOUND = "Couldn't find that.";

export async function handleAnswerCardRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(PREFIX)) return false;
  if (!isApprovalsPageEnabled() || req.method !== 'GET') {
    sendError(res, NOT_FOUND, 404);
    return true;
  }
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60_000, keyPrefix: 'answer-cards' }))
    return true;

  const auth = await requireAuth(req, res);
  if (!auth) return true;
  // Only a person's own Firebase sign-in, never a service API key or dev header.
  if (auth.authMethod !== 'firebase') {
    sendError(res, NOT_FOUND, 404);
    return true;
  }

  const id = pathname.slice(PREFIX.length);
  try {
    const card = await getAnswerCardForUser(id, auth.userId);
    if (!card) {
      sendError(res, NOT_FOUND, 404);
      return true;
    }
    const { userId: _owner, deleteAt: _deleteAt, ...shown } = card;
    sendJSON(res, { card: shown });
  } catch (error) {
    log.error({ error: String(error) }, 'Answer card read failed');
    sendError(res, 'Internal error', 500);
  }
  return true;
}
