/**
 * Journal reads name their subject only through the verified caller.
 *
 * GET /api/journal/chronicle used to read whose chronicle to return from
 * `?userId=` with no auth, so anyone could fetch anyone's. In production the
 * request-identity door rewrites that param to the verified uid, but on a
 * developer's machine it doesn't, and the route shouldn't depend on it.
 *
 * @module api/journal-owner
 */
import type { IncomingMessage, ServerResponse } from 'http';

/** Answer 403 when `?userId=` names someone other than `uid`. Returns true when it answered. */
export function refuseOtherUsersJournal(
  req: IncomingMessage,
  res: ServerResponse,
  uid: string
): boolean {
  const claimed = new URL(req.url || '/', 'http://local').searchParams.get('userId');
  if (!claimed || claimed === uid) return false;
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: "That journal isn't yours" }));
  return true;
}
