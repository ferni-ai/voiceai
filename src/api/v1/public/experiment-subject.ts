/**
 * Whose experiment events a public experiments request may record.
 *
 * The public experiments routes took `userId` from the body (or query) as
 * given, so anyone could enroll any user, or record exposures and conversions
 * for them. Now a request may name:
 * - an anonymous visitor id (`anon_…` from the site's experiments.js, `fv_…`
 *   from landing visitor ids): these belong to no account, so they need no token;
 * - any other id only when it is the verified caller (an admin may name anyone).
 * With a token and no id, the subject is the caller. Each subject is
 * rate-limited on its own.
 *
 * @module api/v1/public/experiment-subject
 */
import type { IncomingMessage, ServerResponse } from 'http';

import { rateLimit, requireAuth } from '../../auth-middleware.js';

/** Ids browsers mint before sign-in. A Firebase uid has no underscore, so it never matches. */
const ANONYMOUS_VISITOR_ID = /^(anon|fv)_[A-Za-z0-9_]{1,64}$/;
/** Experiment events one subject may send per minute. */
export const EVENTS_PER_SUBJECT_PER_MINUTE = 60;

export function isAnonymousVisitorId(id: string): boolean {
  return ANONYMOUS_VISITOR_ID.test(id);
}

function refuse(res: ServerResponse, status: 400 | 401 | 403, error: string): null {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error }));
  return null;
}

async function resolveSubject(
  req: IncomingMessage,
  res: ServerResponse,
  claimed: string | undefined
): Promise<string | null> {
  if (claimed !== undefined && claimed !== '' && isAnonymousVisitorId(claimed)) return claimed;
  const hasToken = typeof req.headers.authorization === 'string';
  if (!hasToken) {
    if (claimed === undefined || claimed === '') return refuse(res, 400, 'userId is required');
    return refuse(res, 401, 'Sign in, or use an anonymous visitor id');
  }
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (claimed === undefined || claimed === '' || claimed === auth.userId) return auth.userId;
  if (auth.isAdmin) return claimed;
  return refuse(res, 403, 'You can only record your own experiment events');
}

/**
 * The subject for this request, or null when it already answered (400, 401,
 * 403, or 429 when the subject is over its rate limit).
 */
export async function experimentSubject(
  req: IncomingMessage,
  res: ServerResponse,
  claimed: string | undefined
): Promise<string | null> {
  const subject = await resolveSubject(req, res, claimed);
  if (subject === null) return null;
  const limited = rateLimit(req, res, {
    maxRequests: EVENTS_PER_SUBJECT_PER_MINUTE,
    windowMs: 60_000,
    keyGenerator: () => `experiments:${subject}`,
  });
  return limited ? null : subject;
}
