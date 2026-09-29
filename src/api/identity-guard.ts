/**
 * Identity guard — runs once per request, before any route handler.
 *
 * Many handlers read identity from `x-firebase-uid`, `x-user-id` or a
 * `userId` query parameter (see api/helpers.ts getUserId). Those are client
 * controlled, so without this guard anyone could act as any user.
 *
 * Rules:
 * - `x-firebase-uid` is server-set only: always stripped, then set from a
 *   verified credential (Firebase ID token, API key, or dev-mode key).
 * - An unverified `x-user-id` header or `userId` query parameter is kept only
 *   when it is an anonymous device identity (`device:…` / `device_…`) or equals
 *   the verified identity. Anything else (a real account's UID) is removed.
 *
 * Anonymous device identities stay usable (the web app uses `device:<id>`
 * before sign-in); signed-in accounts can only be reached with their token.
 */

import type { IncomingMessage } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { optionalAuthAsync } from './auth-middleware.js';

const log = createLogger({ module: 'IdentityGuard' });

const ANONYMOUS_ID = /^device[:_][\w.:-]+$/;

export function isAnonymousIdentity(id: string): boolean {
  return ANONYMOUS_ID.test(id);
}

/**
 * True for Bearer tokens issued by Firebase Auth. Other Bearer tokens (e.g.
 * Cloud Scheduler OIDC) are verified by their own routes; sending them through
 * Firebase verification would count as failed logins.
 */
function isFirebaseBearer(authorization: string): boolean {
  const token = authorization.replace(/^Bearer\s+/i, '');
  const payload = token.split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { iss?: unknown };
    return typeof claims.iss === 'string' && claims.iss.startsWith('https://securetoken.google.com/');
  } catch {
    return false;
  }
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Normalise identity headers and query parameters on the request in place.
 * Returns the verified user ID, or null for anonymous/unauthenticated requests.
 */
export async function enforceVerifiedIdentity(req: IncomingMessage): Promise<string | null> {
  // Never trust a client-sent server header
  delete req.headers['x-firebase-uid'];

  const authorization = headerValue(req, 'authorization');
  const hasCredential = Boolean(
    (authorization && isFirebaseBearer(authorization)) ||
      headerValue(req, 'x-api-key') ||
      headerValue(req, 'x-admin-key')
  );
  const auth = hasCredential ? await optionalAuthAsync(req) : null;
  const verifiedId = auth?.userId ?? null;

  if (verifiedId) {
    req.headers['x-firebase-uid'] = verifiedId;
  }

  const allowed = (claimed: string): boolean => claimed === verifiedId || isAnonymousIdentity(claimed);

  const claimedHeader = headerValue(req, 'x-user-id');
  if (claimedHeader && !allowed(claimedHeader)) {
    delete req.headers['x-user-id'];
    log.warn({ url: req.url }, 'Dropped unverified x-user-id for a non-anonymous identity');
  }

  if (req.url?.includes('userId=')) {
    const url = new URL(req.url, 'http://internal');
    const claimedQuery = url.searchParams.get('userId');
    if (claimedQuery && !allowed(claimedQuery)) {
      url.searchParams.delete('userId');
      req.url = url.pathname + url.search;
      log.warn({ path: url.pathname }, 'Dropped unverified userId query for a non-anonymous identity');
    }
  }

  return verifiedId;
}
