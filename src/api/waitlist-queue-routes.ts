/**
 * A person's own place in the waitlist, for the waiting screens:
 *
 *   GET  /api/waitlist/me     signed in with a verified email; their place, waves away, invite link
 *   POST /api/waitlist/join   { email?, ref? }; signed in = verified join, else an unverified one
 *
 * Positions only ever go back to the person who proved the address: a join
 * without a sign-in gets the empty "waiting" shape, so it can't be used to
 * learn whether someone is on the list. No totals, ever.
 *
 * @module api/waitlist-queue-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseBody } from './helpers.js';
import { joinWaitlist } from '../services/waitlist/join.js';
import { meFor, meView } from '../services/waitlist/me.js';
import { firestoreWaitlistStore } from '../services/waitlist/store.js';

const log = createLogger({ module: 'waitlist-queue-routes' });

const REFUSED: Record<string, string> = {
  invalid_email: 'That email address doesn’t look quite right. Mind checking it?',
  disposable_email: 'Use an inbox you’ll keep, so I can tell you when your spot opens.',
};

export const QUEUE_ROUTE_PATHS: ReadonlySet<string> = new Set([
  '/api/waitlist/me',
  '/api/waitlist/join',
]);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** The caller's verified email; null with no token; 'invalid' for a bad token or an unproven email. */
async function verifiedEmail(req: IncomingMessage): Promise<string | null | 'invalid'> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const { verifyFirebaseToken, isVerifiedToken } =
    await import('../services/identity/firebase-auth.js');
  const verified = await verifyFirebaseToken(header.slice(7));
  if (!isVerifiedToken(verified) || !verified.emailVerified || !verified.email) return 'invalid';
  return verified.email.toLowerCase().trim();
}

export async function handleWaitlistQueueRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const isMe = pathname === '/api/waitlist/me' && req.method === 'GET';
  const isJoin = pathname === '/api/waitlist/join' && req.method === 'POST';
  if (!isMe && !isJoin) return false;

  const db = getFirestoreDb();
  if (!db) {
    sendJson(res, 503, { error: 'unavailable', message: 'Give me a moment and try again.' });
    return true;
  }
  const store = firestoreWaitlistStore(db);
  const email = await verifiedEmail(req);
  const now = new Date();
  if (email === 'invalid' || (isMe && email === null)) {
    sendJson(res, 401, { error: 'sign_in_required' });
    return true;
  }
  if (isMe) {
    sendJson(res, 200, await meFor(store, email as string, now));
    return true;
  }

  const body = await parseBody<{ email?: unknown; ref?: unknown }>(req).catch(() => null);
  const outcome = await joinWaitlist(store, {
    email: email ?? (typeof body?.email === 'string' ? body.email : ''),
    verified: email !== null,
    ref: typeof body?.ref === 'string' ? body.ref : undefined,
    source: email ? 'app_join' : 'join',
    now,
  });
  if ('refused' in outcome) {
    sendJson(res, 400, { error: outcome.refused, message: REFUSED[outcome.refused] });
    return true;
  }
  log.info({ verified: email !== null, status: outcome.entry.status }, 'Waitlist join');
  sendJson(
    res,
    200,
    email
      ? await meFor(store, email, now)
      : { ...meView(null, null, await store.settings(), now), status: 'waiting' }
  );
  return true;
}
