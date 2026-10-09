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
const verifiedAdmins = new WeakSet<IncomingMessage>();

/** Called once per request by the server, after verifying its credentials. */
export function rememberVerifiedUid(req: IncomingMessage, uid: string | null): void {
  if (uid) verifiedUids.set(req, uid);
  else verifiedUids.delete(req);
  verifiedAdmins.delete(req);
}

/** Called by the server when the credentials it verified are an admin's. */
export function rememberVerifiedAdmin(req: IncomingMessage): void {
  verifiedAdmins.add(req);
}

/** The verified uid behind this request, or null for anonymous/invalid. */
export function rateLimitUid(req: IncomingMessage): string | null {
  return verifiedUids.get(req) ?? null;
}

/**
 * Whether the door verified this request as an admin (admin API key or admin
 * claim). Routes use it to decide if a client-named user may be acted for.
 */
export function isVerifiedAdmin(req: IncomingMessage): boolean {
  return verifiedAdmins.has(req);
}
