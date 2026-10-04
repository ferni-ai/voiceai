/**
 * Which user a request may act on when the client names one.
 *
 * bindVerifiedIdentity (servers/api/request-identity.ts) rewrites the
 * ?userId= query and x-user-id header to the verified caller, but it cannot
 * see a userId inside a request body or a path segment. Routes that read one
 * there must check it against the verified caller themselves, or any signed-in
 * user can act on another user's data.
 *
 * Rule: the verified caller acts on their own data. A named user that is not
 * the caller is refused (403) unless the caller is an admin. The caller's id is
 * never swapped in silently for a different named user: a client that names
 * someone else is told no, not quietly redirected to its own account.
 *
 * @module api/acting-user
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { requireAuth } from './auth-middleware.js';

export type ActingUserResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * @param callerId - verified caller (auth.userId), or nothing when unauthenticated
 * @param isAdmin - whether the verified caller is an admin
 * @param named - the user id the client put in the body or path (may be absent)
 */
export function resolveActingUser(
  callerId: string | null | undefined,
  isAdmin: boolean | undefined,
  named: unknown
): ActingUserResult {
  if (!callerId) return { ok: false, status: 401, error: 'Authentication required' };
  if (named === undefined || named === null || named === '' || named === callerId) {
    return { ok: true, userId: callerId };
  }
  if (isAdmin === true && typeof named === 'string') return { ok: true, userId: named };
  return { ok: false, status: 403, error: 'Forbidden' };
}

/**
 * For a route that already authenticated: the user to act on, or null after
 * replying 401/403 with `{ success: false, error }`.
 */
export function actingUserOrReply(
  res: ServerResponse,
  auth: { userId: string; isAdmin: boolean },
  named: unknown
): string | null {
  const result = resolveActingUser(auth.userId, auth.isAdmin, named);
  if (result.ok) return result.userId;
  res.writeHead(result.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: result.error }));
  return null;
}

/**
 * Route form of resolveActingUser: authenticate the request, then resolve the
 * named user. Sends the 401/403 itself and returns null when refused.
 * Read the body BEFORE calling this, so the stream is consumed in one place.
 */
export async function requireActingUser(
  req: IncomingMessage,
  res: ServerResponse,
  named: unknown
): Promise<string | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null; // 401 already sent
  const result = resolveActingUser(auth.userId, auth.isAdmin, named);
  if (result.ok) return result.userId;
  res.writeHead(result.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: result.error }));
  return null;
}
