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
 * - in production, a userId query parameter is replaced with the verified uid,
 *   or removed when the request carries no verified identity. Public
 *   endpoints that use it as an anonymous visitor id keep it.
 *
 * Development keeps the old query behavior so local tools keep working.
 *
 * @module servers/api/request-identity
 */
import type { IncomingMessage } from 'node:http';
import { optionalAuthAsync } from '../../api/auth-middleware.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RequestIdentity' });

/** Endpoints where userId is an anonymous visitor id, not an account. */
const ANONYMOUS_USER_ID_PREFIXES = ['/api/v1/public/', '/api/landing'];

function hasCredential(req: IncomingMessage): boolean {
  const auth = req.headers.authorization;
  return (typeof auth === 'string' && auth.startsWith('Bearer ')) || !!req.headers['x-api-key'];
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
  const auth = hasCredential(req) ? await optionalAuthAsync(req).catch((error: unknown) => {
        log.warn({ error: String(error) }, 'Credential verification failed; treating as anonymous');
        return null;
      }) : null;
  const uid = auth?.userId ?? null;
  if (uid) req.headers['x-firebase-uid'] = uid;

  if (env.NODE_ENV === 'production' && req.url) {
    const url = new URL(req.url, 'http://local');
    const anonymousAllowed = ANONYMOUS_USER_ID_PREFIXES.some((p) => url.pathname.startsWith(p));
    if (url.searchParams.has('userId') && !anonymousAllowed) {
      if (uid) url.searchParams.set('userId', uid);
      else url.searchParams.delete('userId');
      req.url = `${url.pathname}${url.search}`;
    }
  }
  return uid;
}
