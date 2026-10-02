/**
 * Identity link routes — carry anonymous memory into a signed-in account.
 *
 * POST /api/identity/link
 *   Authorization: Bearer <ID token of the signed-in account>   (required)
 *   Body: {
 *     anonymousIdToken?: string  // ID token of the Firebase anonymous user the
 *                                // client was signed in as before sign-in
 *     deviceId?: string          // the client's persistent device id
 *   }
 *
 * Proof that both identities belong to the caller:
 * - the account token must verify and must NOT be anonymous;
 * - an anonymous identity is only merged when the client presents a valid ID
 *   token for it (only the client that held that anonymous session has one);
 * - a device id is the same client-held bearer id the identity guard accepts
 *   for `device:` API access, so merging it into the caller's own verified
 *   account exposes nothing new. The first account to claim an identity keeps
 *   it; later claims by other accounts are refused.
 *
 * @module api/identity-link-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { isVerifiedToken, verifyFirebaseToken } from '../services/identity/firebase-auth.js';
import { mergeIdentityInto, type MergeReason } from '../services/identity/identity-merge.js';
import { recordIdentityEvent } from '../services/identity/identity-metrics.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import { parseBody, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'IdentityLinkRoutes' });

const DEVICE_ID = /^[\w.:-]{8,128}$/;

interface LinkBody {
  anonymousIdToken?: unknown;
  deviceId?: unknown;
}

export type LinkOutcome =
  | 'merged'
  | 'incomplete'
  | 'nothing_to_link'
  | 'linked_elsewhere'
  | 'failed';

export interface LinkResult {
  source: 'anonymous' | 'device';
  outcome: LinkOutcome;
}

export async function handleIdentityLinkRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (pathname !== '/api/identity/link') return false;
  if (req.method !== 'POST') {
    sendError(res, 'Method not allowed', 405);
    return true;
  }
  // Rate limit: 10 link attempts per hour per IP (sign-ins are rare).
  if (rateLimit(req, res, { maxRequests: 10, windowMs: 3600000 })) return true;
  await handleLink(req, res);
  return true;
}

function refuse(res: ServerResponse, message: string, status: number, reason: string): void {
  recordIdentityEvent('linksRefused');
  log.warn({ reason }, 'Identity link refused');
  sendError(res, message, status);
}

async function verifyAccount(
  req: IncomingMessage
): Promise<{ uid: string } | { status: number; reason: string }> {
  const header = req.headers['authorization'];
  if (typeof header !== 'string' || !header.startsWith('Bearer '))
    return { status: 401, reason: 'no_token' };
  const verified = await verifyFirebaseToken(header.slice(7));
  if (!isVerifiedToken(verified)) return { status: 401, reason: 'invalid_token' };
  if (verified.isAnonymous) return { status: 403, reason: 'account_is_anonymous' };
  return { uid: verified.uid };
}

async function merge(
  sourceId: string,
  targetId: string,
  reason: MergeReason
): Promise<LinkOutcome> {
  const db = getFirestoreDb();
  if (!db) return 'failed';
  const result = await mergeIdentityInto(db, { sourceId, targetId, reason });
  if (result.success) return result.data.status === 'complete' ? 'merged' : 'incomplete';
  switch (result.error.code) {
    case 'same_identity':
      return 'nothing_to_link';
    case 'claimed_by_other_account':
      return 'linked_elsewhere';
    default:
      return 'failed';
  }
}

async function handleLink(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const account = await verifyAccount(req);
    if (!('uid' in account)) {
      refuse(res, 'Sign in to keep your conversations.', account.status, account.reason);
      return;
    }

    const body = await parseBody<LinkBody>(req).catch(() => ({}) as LinkBody);
    const anonToken = typeof body.anonymousIdToken === 'string' ? body.anonymousIdToken : undefined;
    const rawDevice =
      typeof body.deviceId === 'string' ? body.deviceId.replace(/^device[:_]/, '') : undefined;
    if (!anonToken && !rawDevice) {
      sendError(res, 'Nothing to link', 400);
      return;
    }
    if (rawDevice && !DEVICE_ID.test(rawDevice)) {
      sendError(res, 'Invalid deviceId', 400);
      return;
    }

    // Verify every proof before merging anything.
    let anonUid: string | undefined;
    if (anonToken) {
      const anon = await verifyFirebaseToken(anonToken);
      if (!isVerifiedToken(anon)) {
        refuse(res, "We couldn't confirm your earlier session.", 401, 'invalid_anonymous_token');
        return;
      }
      if (!anon.isAnonymous) {
        refuse(res, 'Only an anonymous session can be linked.', 403, 'source_not_anonymous');
        return;
      }
      anonUid = anon.uid;
    }

    const results: LinkResult[] = [];
    if (anonUid) {
      results.push({
        source: 'anonymous',
        outcome: await merge(anonUid, account.uid, 'anonymous_upgrade'),
      });
    }
    if (rawDevice) {
      results.push({
        source: 'device',
        outcome: await merge(`device:${rawDevice}`, account.uid, 'device_claim'),
      });
    }

    const elsewhere = results.some((r) => r.outcome === 'linked_elsewhere');
    if (elsewhere) recordIdentityEvent('linksRefused');
    log.info({ account: account.uid.slice(0, 8), results }, 'Identity link handled');
    sendJSON(res, { results }, elsewhere ? 409 : 200);
  } catch (error) {
    log.error({ error: String(error) }, 'Identity link failed');
    sendError(res, "Couldn't link your earlier conversations.", 500);
  }
}

export default handleIdentityLinkRoutes;
