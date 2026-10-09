/**
 * Who a request is, for rate limiting.
 *
 * The synchronous authenticate() can't verify Firebase tokens, so every
 * rateLimit() call keyed signed-in users by IP as if anonymous. Most route
 * limits also share one key per IP, so people behind one office or mobile-
 * carrier address shared a single bucket across routes, and an app load (a
 * few dozen API calls) could throttle all of them.
 *
 * The API server already verifies each request's credentials once, at the
 * door (servers/api/request-identity.ts). It records the verified uid here,
 * against the request object itself: server-side state a client can't set,
 * unlike a header, and no second verification.
 */

import type { IncomingMessage } from 'http';

const verifiedUids = new WeakMap<IncomingMessage, string>();

/** Called once per request by the server, after verifying its credentials. */
export function rememberVerifiedUid(req: IncomingMessage, uid: string | null): void {
  if (uid) verifiedUids.set(req, uid);
  else verifiedUids.delete(req);
}

/** The verified uid behind this request, or null for anonymous/invalid. */
export function rateLimitUid(req: IncomingMessage): string | null {
  return verifiedUids.get(req) ?? null;
}
