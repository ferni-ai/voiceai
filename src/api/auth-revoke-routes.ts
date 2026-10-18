/**
 * Auth Revoke Route
 *
 * - POST /api/auth/revoke - Revoke the caller's own Firebase refresh tokens
 *
 * `ferni auth logout` has always called this route, but no server had it
 * (#2127), so a CLI logout only deleted the local file and the refresh token
 * kept working. The uid comes from the verified ID token and nowhere else:
 * the body is never read, so no request can revoke someone else's sessions.
 *
 * @module AuthRevokeRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { revokeRefreshTokens } from '../services/identity/firebase-auth.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'AuthRevokeRoutes' });

/**
 * Handle POST /api/auth/revoke.
 * Returns true if the request was handled, false otherwise.
 */
export async function handleAuthRevokeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (pathname !== '/api/auth/revoke' || req.method !== 'POST') return false;

  if (rateLimit(req, res, { maxRequests: 10, windowMs: 60_000 })) return true;

  const auth = await requireAuth(req, res);
  if (!auth) return true;
  // The real gate: only a verified Firebase user, never an API key or dev-mode header.
  if (auth.authMethod !== 'firebase' || !auth.firebaseUid) {
    sendError(res, 'Sign in to sign out your other sessions', 403);
    return true;
  }

  const uid = auth.firebaseUid;
  if (!(await revokeRefreshTokens(uid))) {
    log.error({ uid: `${uid.substring(0, 8)}...` }, 'Refresh token revoke failed');
    sendError(res, "Couldn't revoke your sessions right now", 502);
    return true;
  }

  sendJSON(res, { revoked: true });
  return true;
}
