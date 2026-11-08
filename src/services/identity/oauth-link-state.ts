/**
 * The pieces of a user OAuth link the shared store (user-oauth-store.ts) keeps beside the
 * tokens: how long a miss or a failed refresh is remembered, and the needs_reauth mark on the
 * link doc.
 *
 * @module services/identity/oauth-link-state
 */

import { decryptData } from '../../utils/token-encryption.js';
import type { createPersistenceStore } from '../persistence/index.js';

const MAX_MISS_ENTRIES = 10_000;

/** Recorded on the link doc when the provider says the grant is gone. No token material. */
interface NeedsReauth {
  /** Epoch ms of the refresh that failed */
  at: number;
  /** The provider's error class: invalid_grant, revoked, unauthorized_client */
  errorClass: string;
}

/** What markNeedsReauth did: 'stale' is a failure on a grant that has since been replaced or rewritten. */
export type ReauthOutcome = 'recorded' | 'already' | 'gone' | 'stale';

export interface LinkStatus {
  state: 'connected' | 'needs_reauth' | 'not_connected';
  needsReauth?: NeedsReauth;
}

export interface LinkDoc {
  encrypted: string;
  updated_at: number;
  /** null clears it: the persistence layer merges, so a reconnect must say so */
  needs_reauth?: NeedsReauth | null;
}

/** Ids remembered for a while: a miss, or a refresh that failed for good. */
export function createExpiringSet(ttlMs: number, max = MAX_MISS_ENTRIES) {
  const until = new Map<string, number>();
  return {
    add(id: string): void {
      if (until.size >= max) {
        const now = Date.now();
        for (const [key, at] of until) if (at <= now) until.delete(key);
        if (until.size >= max) until.clear();
      }
      until.set(id, Date.now() + ttlMs);
    },
    has(id: string): boolean {
      const at = until.get(id);
      if (at === undefined) return false;
      if (at > Date.now()) return true;
      until.delete(id);
      return false;
    },
    delete: (id: string): void => void until.delete(id),
    clear: (): void => until.clear(),
  };
}

export type DocStore = ReturnType<typeof createPersistenceStore<LinkDoc>>;

/** A link doc's state, from the doc alone (pure): no doc or no grant is not_connected. */
function linkStatusFromDoc(doc: LinkDoc | null | undefined): LinkStatus {
  if (!doc?.encrypted) return { state: 'not_connected' };
  if (doc.needs_reauth) return { state: 'needs_reauth', needsReauth: doc.needs_reauth };
  return { state: 'connected' };
}

/** The needs_reauth side of a link doc: read it, record it, and what this process has seen of it. */
export function createReauthState<T extends { refresh_token?: string }>(docStore: DocStore) {
  const seen = new Map<string, NeedsReauth>();
  return {
    forget: (userId: string): void => void seen.delete(userId),
    forgetAll: (): void => seen.clear(),

    /**
     * `fromDoc`: skip this process's memory of a needs_reauth mark (a reconnect through another
     * process leaves it stale), read the doc strictly (a failed read throws, never "not
     * connected"), and correct the memory from what the doc says.
     */
    async linkStatus(userId: string, opts?: { fromDoc?: boolean }): Promise<LinkStatus> {
      const known = opts?.fromDoc ? undefined : seen.get(userId);
      if (known) return { state: 'needs_reauth', needsReauth: known };
      const doc = await docStore.load(userId, { fresh: true, strict: opts?.fromDoc });
      const status = linkStatusFromDoc(doc);
      if (status.needsReauth) seen.set(userId, status.needsReauth);
      else seen.delete(userId);
      return status;
    },

    async markNeedsReauth(
      userId: string,
      errorClass: string,
      failedRefreshToken: string
    ): Promise<ReauthOutcome> {
      if (seen.has(userId)) return 'already';
      const doc = await docStore.load(userId, { fresh: true, strict: true });
      if (!doc?.encrypted) return 'gone'; // disconnected meanwhile: nothing to flag
      if (doc.needs_reauth) {
        seen.set(userId, doc.needs_reauth);
        return 'already';
      }
      // A different refresh token means a reconnect (or a rotation) since the failed refresh
      if (decryptData<T>(doc.encrypted)?.refresh_token !== failedRefreshToken) return 'stale';
      const mark: NeedsReauth = { at: Date.now(), errorClass };
      // Only this field, and only if the link is still the one we read: a reconnect (or a
      // disconnect) landing since must not be overwritten by the revoked grant, nor revived.
      const result = await docStore.updateIfUnchanged(
        userId,
        (cur) => cur.encrypted === doc.encrypted && !cur.needs_reauth,
        { needs_reauth: mark }
      );
      if (result !== 'updated') return 'stale';
      seen.set(userId, mark);
      return 'recorded';
    },
  };
}
