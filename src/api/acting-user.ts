/**
 * Which user a request may act on when the client names one.
 *
 * A userId in a request body (or path) is written by the client, so it is a
 * claim, not an identity. Several routes used to act on whoever the body
 * named — often with no credentials at all — so one person could disconnect
 * another's calendar, open their billing portal, overwrite their streaks, or
 * point their outreach at a different phone. bindVerifiedIdentity
 * (servers/api/request-identity.ts) already rewrites ?userId= and x-user-id;
 * it cannot see bodies, so routes check them here.
 *
 * The rule: act on the verified caller. A body that names the caller (or
 * nobody) is fine. One that names someone else gets 403, unless the caller is
 * a verified admin, who may act for the user they name. Never quietly swap in
 * the caller's id: a client that names someone else has a bug or is probing,
 * and either way it should hear "no", not get a success for a different user.
 *
 * @module api/acting-user
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth, type AuthContext } from './auth-middleware.js';
import { sendError } from './helpers.js';

const log = createLogger({ module: 'ActingUser' });

/** The verified caller, as requireAuth returns it. */
export type VerifiedCaller = Pick<AuthContext, 'userId' | 'isAdmin'>;

export type ActingUserResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

/** The rule itself, with no I/O: whom may this caller act on? */
export function decideActingUser(
  callerId: string | null | undefined,
  isAdmin: boolean | undefined,
  claimed: unknown
): ActingUserResult {
  if (!callerId) return { ok: false, status: 401, error: 'Authentication required' };
  if (claimed === undefined || claimed === null || claimed === '' || claimed === callerId) {
    return { ok: true, userId: callerId };
  }
  if (isAdmin === true && typeof claimed === 'string') return { ok: true, userId: claimed };
  return { ok: false, status: 403, error: 'Not authorized' };
}

/**
 * Check a client-named user against an already-verified caller.
 * Returns the user to act on, or null after sending 401/403.
 */
export function claimedUserFor(
  caller: VerifiedCaller,
  claimed: unknown,
  res: ServerResponse
): string | null {
  const result = decideActingUser(caller.userId, caller.isAdmin, claimed);
  if (result.ok) return result.userId;
  if (result.status === 403) {
    log.warn({ callerId: caller.userId }, 'Refused a request that names a different user');
  }
  sendError(res, result.error, result.status);
  return null;
}

/**
 * Require a verified caller (401 otherwise), then check the user the client
 * named. Returns the user to act on, or null once a response has been sent.
 */
export async function resolveActingUser(
  req: IncomingMessage,
  res: ServerResponse,
  claimed: unknown
): Promise<string | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  return claimedUserFor(auth, claimed, res);
}
