/**
 * POST /api/identity/merge-anonymous
 *
 * The iPhone app signs people in anonymously. When they then sign in with a
 * credential that already belongs to an account (credentialAlreadyInUse), the
 * app switches to that account, and this route brings over what the anonymous
 * uid built up, so Ferni still knows them.
 *
 * Request: `Authorization: Bearer <ID token of the real account>`, body
 * `{ "anonIdToken": "<ID token of the anonymous account>" }`. Both tokens are
 * verified with firebase-admin. The anonymous uid comes only from its verified
 * token; nothing in the body names an account.
 *
 * Responses: 200 `{ merged: true, conversations, memories }`;
 * 409 `{ merged: false, reason }` with reason already-merged, not-anonymous or
 * same-account; 401 for a missing, invalid or stale token; 403 when the real
 * account is itself anonymous; 404 while IDENTITY_MERGE_ANON is off.
 *
 * @module api/identity-merge-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';

import { flagOn } from '../config/env-flag.js';
import {
  isVerifiedToken,
  verifyFirebaseToken,
  type VerifiedToken,
} from '../services/identity/firebase-auth.js';
import { linkVerifiedAnonymousIdentity } from '../services/identity/identity-linking.js';
import { readMigration } from '../services/identity/migration-flag.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { API_ERRORS } from './error-messages.js';
import { parseBody, sendError, sendJSON } from './helpers.js';
import { authCheckUnavailable, nullIfUnavailable } from './verify-token-once.js';

export const MERGE_ANONYMOUS_PATH = '/api/identity/merge-anonymous';

/** The anonymous sign-in must be this recent (auth_time or iat), in seconds. */
const MAX_ANON_TOKEN_AGE_S = 60 * 60;

const log = createLogger({ module: 'IdentityMergeRoutes' });

type Reason = 'already-merged' | 'not-anonymous' | 'same-account';

const short = (uid: string): string => `${uid.substring(0, 8)}...`;

/** True when the token's auth_time or iat falls within the last hour. */
export function isFreshAnonToken(token: VerifiedToken, nowS = Date.now() / 1000): boolean {
  const within = (t: unknown) =>
    typeof t === 'number' && t <= nowS + 60 && nowS - t <= MAX_ANON_TOKEN_AGE_S;
  return within(token.claims.auth_time) || within(token.claims.iat);
}

/** Documents copied per kind, from linkIdentity's "<collection>:<count>" entries. */
function countsOf(migrated: readonly string[]): { conversations: number; memories: number } {
  const count = (names: readonly string[]) =>
    migrated
      .map((entry) => entry.split(':'))
      .filter(([name]) => names.includes(name ?? ''))
      .reduce((sum, [, n]) => sum + (Number(n) || 0), 0);
  return { conversations: count(['summaries']), memories: count(['memories', 'moments']) };
}

/** null for no token or a bad one; one whose account couldn't be checked also marks `req`, for a 503 */
async function verified(req: IncomingMessage, token: unknown): Promise<VerifiedToken | null> {
  if (typeof token !== 'string' || !token) return null;
  const result = await verifyFirebaseToken(token).catch((e) => nullIfUnavailable(req, e));
  return isVerifiedToken(result) ? result : null;
}

function refuse(res: ServerResponse, reason: Reason): void {
  sendJSON(res, { merged: false, reason }, 409);
}

/** Handles MERGE_ANONYMOUS_PATH. Returns false for any other request. */
export async function handleIdentityMergeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (pathname !== MERGE_ANONYMOUS_PATH || req.method !== 'POST') return false;
  if (!flagOn('IDENTITY_MERGE_ANON')) {
    sendError(res, API_ERRORS.NOT_FOUND, 404);
    return true;
  }
  // Like POST /api/auth/migrate: 5 an hour, in its own bucket
  if (rateLimit(req, res, { maxRequests: 5, windowMs: 3600000, keyPrefix: 'merge-anon' })) {
    return true;
  }

  const auth = await requireAuth(req, res, { allowDevMode: false });
  if (!auth) return true;
  const bearer = req.headers.authorization?.slice('Bearer '.length);
  const real = auth.authMethod === 'firebase' ? await verified(req, bearer) : null;
  if (!real || real.uid !== auth.firebaseUid) {
    if (authCheckUnavailable(req, res)) return true;
    sendError(res, API_ERRORS.AUTH_REQUIRED, 401);
    return true;
  }
  if (real.signInProvider === 'anonymous') {
    sendError(res, 'Sign in to your account before moving data into it', 403);
    return true;
  }

  let body: { anonIdToken?: unknown };
  try {
    body = (await parseBody<{ anonIdToken?: unknown }>(req)) ?? {};
  } catch {
    sendError(res, 'Invalid request body', 400);
    return true;
  }
  const anon = await verified(req, body.anonIdToken);
  if (!anon) {
    if (authCheckUnavailable(req, res)) return true;
    sendError(res, API_ERRORS.AUTH_REQUIRED, 401);
    return true;
  }
  const reason: Reason | null =
    anon.uid === real.uid
      ? 'same-account'
      : anon.signInProvider !== 'anonymous'
        ? 'not-anonymous'
        : null;
  if (reason) {
    refuse(res, reason);
    return true;
  }
  if (!isFreshAnonToken(anon)) {
    sendError(res, 'The anonymous sign-in is too old; refresh its token', 401);
    return true;
  }

  const db = getFirestoreDb();
  if (!db) {
    sendError(res, API_ERRORS.INTERNAL_ERROR, 503);
    return true;
  }
  const ids = { anon: short(anon.uid), real: short(real.uid) };
  const before = await readMigration(db, anon.uid);
  if (before.to && (before.to !== real.uid || !before.incomplete)) {
    log.info(ids, 'Anonymous account already merged');
    refuse(res, 'already-merged');
    return true;
  }

  const result = await linkVerifiedAnonymousIdentity(anon, real.uid);
  if (!result.success) {
    log.warn({ ...ids, errors: result.errors }, 'Anonymous account merge failed');
    sendJSON(res, { merged: false, error: 'Merge failed; try again' }, 500);
    return true;
  }
  const counts = countsOf(result.migratedCollections);
  log.info({ ...ids, ...counts }, 'Merged anonymous account into signed-in account');
  sendJSON(res, { merged: true, ...counts });
  return true;
}
