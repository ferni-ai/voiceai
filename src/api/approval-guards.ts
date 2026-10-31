/**
 * Guards for the approvals routes that change something on a person's
 * behalf (approve an action, add or remove a passkey).
 *
 * - CSRF: a JSON body (a cross-site form can't send one without a
 *   preflight), an allowed Origin when the browser sends one, and bearer
 *   auth only (never a cookie).
 * - Fresh sign-in: when the person last actually signed in, read from their
 *   own non-anonymous Firebase token, re-verified with revocation checked.
 *
 * @module ApprovalGuards
 */

import type { IncomingMessage } from 'http';
import { verifyFirebaseToken } from '../services/identity/firebase-auth.js';
import { isOriginAllowed } from '../servers/shared/cors.js';

export const FRESH_SIGN_IN_MS = 5 * 60 * 1000;

export function isCsrfSafe(req: IncomingMessage): boolean {
  const type = req.headers['content-type'] ?? '';
  const origin = req.headers.origin;
  return type.startsWith('application/json') && (origin === undefined || isOriginAllowed(origin));
}

/** True when uid's own bearer token says they signed in within the last 5 minutes. */
export async function signedInRecently(
  req: IncomingMessage,
  uid: string,
  now = Date.now()
): Promise<boolean> {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const verified = await verifyFirebaseToken(header.slice(7));
  if (!verified || 'expired' in verified || verified.isAnonymous || verified.uid !== uid) {
    return false;
  }
  const authTime = verified.claims.auth_time;
  return typeof authTime === 'number' && now - authTime * 1000 <= FRESH_SIGN_IN_MS;
}
