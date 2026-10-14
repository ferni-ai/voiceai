/**
 * Who is making this request: decided once, at the door, from verified
 * credentials only.
 *
 * Routes read identity from the x-firebase-uid header (via helpers.getUserId)
 * and from a ?userId= query parameter (~75 places read it directly). Both used
 * to be taken as given, so any caller could act as any user: on 2026-10-03 a
 * request with no token and a made-up X-Firebase-UID or ?userId= got that
 * user's data export back from production.
 *
 * Now, before routing:
 * - an inbound x-firebase-uid header is always removed: only this module sets
 *   it, from a verified Firebase ID token or API key;
 * - unless NODE_ENV is development, a userId query parameter is replaced with the verified uid,
 *   or removed when the request carries no verified identity. Public
 *   endpoints that use it as an anonymous visitor id keep it.
 * - likewise the legacy x-user-id header (~26 route helpers fall back
 *   to it) gets the same treatment: the verified uid, or nothing.
 * - every alias of those gets it too (`?user_id=`, `?uid=`, `?firebase_uid=`,
 *   any casing; `x-uid`, `x-userid`). /api/conversation/cost read `user_id`
 *   and so bypassed the door; a route that picks up an alias later can't.
 *   Request bodies are not rewritten here: a route that reads a user id from
 *   its body must resolve it against the verified caller itself.
 *
 * Only NODE_ENV=development keeps the old behavior, so an unset NODE_ENV fails
 * closed. A verified admin keeps the target user it names.
 *
 * @module servers/api/request-identity
 */
import type { IncomingMessage } from 'node:http';
import { optionalAuthAsync } from '../../api/auth-middleware.js';
import { rememberVerifiedAdmin, rememberVerifiedUid } from '../../api/rate-limit-identity.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RequestIdentity' });

/** Endpoints where userId is an anonymous visitor id, not an account. */
const ANONYMOUS_USER_ID_PREFIXES = ['/api/v1/public/', '/api/landing/'];

/** Query params that name a user, compared lower-cased. */
const SUBJECT_PARAMS = new Set(['userid', 'user_id', 'uid', 'firebase_uid', 'firebaseuid']);
/** Headers (already lower-cased by node) that name a user. */
const SUBJECT_HEADERS = ['x-user-id', 'x-userid', 'x-uid'] as const;

function hasCredential(req: IncomingMessage): boolean {
  const auth = req.headers.authorization;
  return (typeof auth === 'string' && auth.startsWith('Bearer ')) || !!req.headers['x-api-key'];
}

/** Point every user-naming query param at the verified uid, or drop it. */
function rebindSubjectParams(req: IncomingMessage, url: URL, uid: string | null): void {
  const claimed = new Set(
    [...url.searchParams.keys()].filter((k) => SUBJECT_PARAMS.has(k.toLowerCase()))
  );
  if (claimed.size === 0) return;
  for (const name of claimed) {
    if (uid !== null) url.searchParams.set(name, uid);
    else url.searchParams.delete(name);
  }
  req.url = `${url.pathname}${url.search}`;
}

/** Client-claimed ids are only taken as given on a developer's machine. */
function trustsClaimedIds(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === 'development';
}

/**
 * Strip client-claimed identity and bind the verified one onto the request.
 * Returns the verified user id, or null.
 */
export async function bindVerifiedIdentity(
  req: IncomingMessage,
  env: Record<string, string | undefined> = process.env
): Promise<string | null> {
  delete req.headers['x-firebase-uid'];
  // A verification error counts as no identity (fail closed).
  const auth = hasCredential(req)
    ? await optionalAuthAsync(req).catch((error: unknown) => {
        log.warn({ error: String(error) }, 'Credential verification failed; treating as anonymous');
        return null;
      })
    : null;
  const uid = auth?.userId ?? null;
  rememberVerifiedUid(req, uid); // rate limits count per person, not per IP
  const url = new URL(req.url || '/', 'http://local');

  // A verified admin (admin API key or admin claim) may act for a target user
  // named in ?userId= or x-user-id; rewriting that to the admin's own id would
  // turn an admin action into a wrong-user action.
  if (auth?.isAdmin) {
    rememberVerifiedAdmin(req);
    const target = url.searchParams.get('userId') || req.headers['x-user-id'];
    if (!target && uid) req.headers['x-firebase-uid'] = uid;
    return uid;
  }

  if (uid) req.headers['x-firebase-uid'] = uid;
  if (trustsClaimedIds(env)) return uid;

  for (const name of SUBJECT_HEADERS) {
    if (uid !== null) req.headers[name] = uid;
    else delete req.headers[name];
  }
  if (!ANONYMOUS_USER_ID_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    rebindSubjectParams(req, url, uid);
  }
  return uid;
}

/**
 * The caller's user id, as bound by bindVerifiedIdentity: a verified Firebase
 * uid, else (in development only) a raw x-user-id. Use this instead of
 * reading the Authorization header: the bearer string is a token, not a user id.
 */
export function getVerifiedUserId(req: IncomingMessage): string | null {
  for (const name of ['x-firebase-uid', 'x-user-id'] as const) {
    const value = req.headers[name];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}
