/**
 * One Firebase token verification per request, however many handlers ask.
 *
 * A request can pass through several route modules that each authenticate
 * (engagement routes' optional auth, then a handler's requireAuth, then a
 * second handler's). Verifying the same token again repeats the crypto and,
 * for a bad token, counts the failure toward lockout once per pass. The
 * result is kept on the request for that exact token, so a token that changes
 * mid-request is verified afresh.
 *
 * @module api/verify-token-once
 */
import type { IncomingMessage } from 'http';

import type { AuthContext } from './auth-middleware.js';

type Verify = (req: IncomingMessage, token: string) => Promise<AuthContext | null>;

const verified = new WeakMap<
  IncomingMessage,
  { token: string; auth: Promise<AuthContext | null> }
>();

/** `verify` for the request's pending Bearer token, at most once per request and token. */
export function verifyTokenOnce(req: IncomingMessage, verify: Verify): Promise<AuthContext | null> {
  const token = (req as IncomingMessage & { _pendingFirebaseToken?: string })._pendingFirebaseToken;
  if (!token) return Promise.resolve(null);
  const earlier = verified.get(req);
  if (earlier?.token === token) return earlier.auth;
  const auth = verify(req, token);
  verified.set(req, { token, auth });
  return auth;
}
