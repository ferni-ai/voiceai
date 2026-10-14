/**
 * The user a read-only route reports on: the verified caller, never a query param.
 *
 * Several routes took their subject from `?userId=` and were safe only because
 * the request-identity door rewrites that param in production. On a developer
 * machine the door passes it through, and a route shouldn't depend on one
 * global rewrite for its own authorization. Admins may still name a user.
 *
 * @module api/verified-subject
 */
import type { IncomingMessage, ServerResponse } from 'http';

import { requireAuth } from './auth-middleware.js';

/**
 * The verified caller's uid (or, for an admin, the `?userId=` they name).
 * Answers 401 without auth and 403 when the query names someone else, and
 * returns null when it answered.
 */
export async function requireVerifiedSubject(
  req: IncomingMessage,
  res: ServerResponse
): Promise<string | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  const claimed = new URL(req.url || '/', 'http://local').searchParams.get('userId');
  if (claimed === null || claimed === '' || claimed === auth.userId) return auth.userId;
  if (auth.isAdmin) return claimed;
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'You can only see your own data' }));
  return null;
}
