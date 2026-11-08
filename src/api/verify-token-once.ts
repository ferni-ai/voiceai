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
 * A token whose account couldn't be checked (token-revocation.ts: Auth down, no recent
 * state) is neither signed in nor refused: verify resolves null for it, the request is
 * marked, and requireAuth answers 503, try again (authCheckUnavailable).
 *
 * @module api/verify-token-once
 */
import type { IncomingMessage, ServerResponse } from 'http';

import { isAuthCheckUnavailable } from '../services/identity/token-revocation.js';

import type { AuthContext } from './auth-middleware.js';

type Verify = (req: IncomingMessage, token: string) => Promise<AuthContext | null>;

const verified = new WeakMap<
  IncomingMessage,
  { token: string; strict: boolean; auth: Promise<AuthContext | null> }
>();

/**
 * `verify` for the request's pending Bearer token, at most once per request and token.
 * A strict check (token-revocation.ts) never reuses an earlier lax one.
 */
export function verifyTokenOnce(
  req: IncomingMessage,
  verify: Verify,
  strict = false
): Promise<AuthContext | null> {
  const token = (req as IncomingMessage & { _pendingFirebaseToken?: string })._pendingFirebaseToken;
  if (!token) return Promise.resolve(null);
  const earlier = verified.get(req);
  if (earlier?.token === token && (earlier.strict || !strict)) return earlier.auth;
  const auth = verify(req, token).catch((error: unknown) => nullIfUnavailable(req, error));
  verified.set(req, { token, strict, auth });
  return auth;
}

const unavailable = new WeakSet<IncomingMessage>();

/** For a token check that threw: null (the request marked) when it couldn't be checked; else rethrows */
export function nullIfUnavailable(req: IncomingMessage, error: unknown): null {
  if (!isAuthCheckUnavailable(error)) throw error;
  unavailable.add(req);
  return null;
}

/** Sends the 503 (and true) when this request's token couldn't be checked */
export function authCheckUnavailable(req: IncomingMessage, res: ServerResponse): boolean {
  if (!unavailable.has(req)) return false;
  res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '5' });
  res.end(JSON.stringify({ error: 'Sign-in could not be checked. Try again shortly.' }));
  return true;
}
