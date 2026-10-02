/**
 * Merge redirects — after an anonymous identity is merged into an account,
 * its `bogle_users/{anonId}` doc carries `mergedInto: <accountUid>`, so any
 * later session that still presents the anonymous identity lands on the
 * account's memory instead of a fresh, empty one.
 *
 * Only follow redirects for identities the server has verified (a Firebase
 * token, or a server-side dispatch). The redirect itself is only written after
 * the caller proved it holds both identities (see identity-link routes).
 *
 * @module services/identity/identity-redirect
 */

import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { recordIdentityEvent } from './identity-metrics.js';

const log = createLogger({ module: 'identity-redirect' });

export const USERS_COLLECTION = 'bogle_users';
const MAX_HOPS = 3;

/** Fields written on the anonymous user's doc by a merge. */
export interface RedirectMarker {
  mergedInto: string;
  mergedAt: string;
  mergeStatus: 'in_progress' | 'complete';
}

export interface RedirectResolution {
  /** The identity to use for memory. */
  userId: string;
  /** The identity the caller presented, when it was redirected. */
  redirectedFrom?: string;
  /** False while the merge into `userId` is still running or was interrupted. */
  mergeComplete: boolean;
}

/** Redirects are permanent, so resolved hops can be cached for the process. */
const hopCache = new Map<string, { to: string; complete: boolean }>();

export function clearRedirectCache(): void {
  hopCache.clear();
}

export function readRedirectMarker(
  data: Record<string, unknown> | undefined
): RedirectMarker | null {
  const to = data?.mergedInto;
  if (typeof to !== 'string' || to.length === 0) return null;
  return {
    mergedInto: to,
    mergedAt: typeof data?.mergedAt === 'string' ? data.mergedAt : '',
    mergeStatus: data?.mergeStatus === 'complete' ? 'complete' : 'in_progress',
  };
}

async function nextHop(
  db: Firestore,
  id: string
): Promise<{ to: string; complete: boolean } | null> {
  const cached = hopCache.get(id);
  if (cached?.complete) return cached;
  const snap = await db.collection(USERS_COLLECTION).doc(id).get();
  const marker = snap.exists ? readRedirectMarker(snap.data()) : null;
  if (!marker) return null;
  const hop = { to: marker.mergedInto, complete: marker.mergeStatus === 'complete' };
  hopCache.set(id, hop);
  return hop;
}

/**
 * Follow `mergedInto` markers from a verified identity to the account that now
 * owns its memory. Returns the identity unchanged when it was never merged or
 * when Firestore is unreachable (callers then behave as before).
 */
export async function resolveIdentityRedirect(
  db: Firestore | null,
  userId: string
): Promise<RedirectResolution> {
  if (!db) return { userId, mergeComplete: true };
  let current = userId;
  let complete = true;
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const next = await nextHop(db, current);
      if (!next || next.to === current) break;
      complete = complete && next.complete;
      current = next.to;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Redirect lookup failed; using presented identity');
    return { userId, mergeComplete: true };
  }
  if (current === userId) return { userId, mergeComplete: true };
  recordIdentityEvent('redirectsFollowed');
  log.info(
    { from: userId.slice(0, 12), to: current.slice(0, 8), complete },
    'Identity resolved through merge redirect'
  );
  return { userId: current, redirectedFrom: userId, mergeComplete: complete };
}
