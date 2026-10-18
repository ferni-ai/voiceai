/**
 * A person's own place in the waitlist, for the waiting screens:
 *
 *   GET  /api/waitlist/me     your place, waves away, invite link
 *   POST /api/waitlist/join   { ref? }: puts you in line, then answers like /me
 *
 * Both need a sign-in with a verified email, and the address comes from the
 * token, so neither can tell anyone whether some other address is listed.
 * Sign-ups without a sign-in use POST /api/waitlist (a generic reply). No totals, ever.
 *
 * @module api/waitlist-queue-routes
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseBody } from './helpers.js';
import { joinWaitlist } from '../services/waitlist/join.js';
import { meFor } from '../services/waitlist/me.js';
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

/** The signed-in caller with a verified email, or null (no token, a bad one, or an unproven email). */
async function verifiedCaller(
  req: IncomingMessage
): Promise<{ email: string; uid: string } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const { verifyFirebaseToken, isVerifiedToken } =
    await import('../services/identity/firebase-auth.js');
  const verified = await verifyFirebaseToken(header.slice(7));
  if (!isVerifiedToken(verified) || !verified.emailVerified || !verified.email) return null;
  return { email: verified.email.toLowerCase().trim(), uid: verified.uid };
}

export async function handleWaitlistQueueRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const isMe = pathname === '/api/waitlist/me' && req.method === 'GET';
  const isJoin = pathname === '/api/waitlist/join' && req.method === 'POST';
  if (!isMe && !isJoin) return false;
  // Both need a verified sign-in: the address comes from the token, never the body
  const caller = await verifiedCaller(req);
  if (!caller) {
    sendJson(res, 401, { error: 'sign_in_required' });
    return true;
  }
  const db = getFirestoreDb();
  if (!db) {
    sendJson(res, 503, { error: 'unavailable', message: 'Give me a moment and try again.' });
    return true;
  }
  const store = firestoreWaitlistStore(db);
  const now = new Date();
  if (isJoin) {
    const body = await parseBody<{ ref?: unknown }>(req).catch(() => null);
    const ref = typeof body?.ref === 'string' ? body.ref : undefined;
    const outcome = await joinWaitlist(store, { ...caller, ref, verified: true, source: 'app_join', now }); // prettier-ignore
    if ('refused' in outcome) {
      sendJson(res, 400, { error: outcome.refused, message: REFUSED[outcome.refused] });
      return true;
    }
    log.info({ status: outcome.entry.status }, 'Waitlist join');
  }
  sendJson(res, 200, await meFor(store, caller.email, now, caller.uid));
  return true;
}
