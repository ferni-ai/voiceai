/**
 * Routes that name a user in the path (/api/x/:userId) must check the caller is that user.
 *
 * The door (servers/api/request-identity.ts) rewrites ?userId= to the verified caller, but it
 * can't rewrite a path segment, so a route that trusts one lets any signed-in caller read or
 * write anyone's data by changing the id.
 *
 * @module api/path-owner
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { requireAuth } from './auth-middleware.js';
import { sendError } from './helpers.js';

/**
 * True when the verified caller is the user the path names, or an admin. Otherwise the
 * response is already sent (401 if not signed in, 403 if it's someone else's) and it's false.
 */
export async function requirePathOwner(
  req: IncomingMessage,
  res: ServerResponse,
  pathUserId: string
): Promise<boolean> {
  const auth = await requireAuth(req, res);
  if (!auth) return false;
  if (auth.userId === pathUserId || auth.isAdmin) return true;
  sendError(res, "That isn't yours to see.", 403);
  return false;
}
