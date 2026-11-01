/**
 * One-tap connect invites: the link a connect moment texts to the verified
 * owner's own phone or email.
 *
 * An invite is a 256-bit random token, stored only as its SHA-256, bound to one
 * uid and one integration, good for 30 minutes and for one redemption. It rides
 * the link's fragment (/connect#i=<token>), which browsers never send to a
 * server and link previews never fetch, so no log or preview sees it, and
 * opening the page spends nothing. The page signs the person in, and its
 * Connect button redeems the invite (POST /auth/oauth/start-from-invite) only
 * for the account it names, which starts the integration's normal OAuth flow
 * in that browser (oauth-link-state.ts binds it there).
 *
 * The voice agent writes invites and the API server redeems them, so they live
 * in Firestore whatever the runtime. Account deletion removes them
 * (account-routes.ts LINKED_RECORDS).
 *
 * @module services/connect-moments/connect-invites
 */
import crypto from 'node:crypto';
import { APP_URL } from '../../config/api-urls.js';
import { isErasedOrErasing } from '../../utils/erasing-mark.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  firestoreSingleUseStore,
  sha256Hex,
  type SingleUseRecord,
  type SingleUseStore,
} from '../stores/single-use-records.js';
import { connectableFor, type ConnectableId } from './connectables.js';
import { noteConnectMoment } from './connect-moment-log.js';

const log = createLogger({ module: 'ConnectInvites' });

export const CONNECT_INVITE_TTL_MS = 30 * 60 * 1000;
const CONNECT_INVITES_COLLECTION = 'connect_invites';
const CONNECT_PAGE_PATH = '/connect';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface ConnectInvite extends SingleUseRecord {
  integration: ConnectableId;
  /** The call that sent it, so a live call can learn its own link was used. */
  sessionId?: string;
  createdAt: number;
}

let store: SingleUseStore<ConnectInvite> | null = null;
const getStore = (): SingleUseStore<ConnectInvite> =>
  (store ??= firestoreSingleUseStore<ConnectInvite>(CONNECT_INVITES_COLLECTION));

/** Tests swap in a memory store; null resets to Firestore. */
export function setConnectInviteStore(next: SingleUseStore<ConnectInvite> | null): void {
  store = next;
}

/** A new invite for a verified owner, or null when it couldn't be stored. */
export async function createConnectInvite(params: {
  uid: string;
  integration: ConnectableId;
  sessionId?: string;
}): Promise<string | null> {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const invite: ConnectInvite = {
    uid: params.uid,
    integration: params.integration,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    createdAt: now,
    expiresAt: now + CONNECT_INVITE_TTL_MS,
  };
  try {
    return (await getStore().put(sha256Hex(token), invite)) ? token : null;
  } catch (error) {
    log.error({ error: String(error), integration: params.integration }, 'Could not store invite');
    return null;
  }
}

/**
 * Spend an invite for the signed-in account `uid`: the record, once, if the
 * token is well formed, the invite is theirs, unexpired, and its integration is
 * still on. Every refusal is the same null, so a caller can't tell an unknown
 * invite from someone else's. Someone else's is left unspent, so a forwarded
 * link opened in the wrong account still works for its owner; an expired or
 * switched-off one is deleted.
 */
export async function redeemConnectInvite(
  token: unknown,
  uid: string
): Promise<ConnectInvite | null> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
  const key = sha256Hex(token);
  try {
    const found = await getStore().get(key);
    if (!found) return null;
    if (found.uid !== uid) {
      noteConnectMoment(found.integration, 'tap_refused', { reason: 'other_account' });
      return null;
    }
    if (found.expiresAt <= Date.now() || !connectableFor(found.integration)?.enabled()) {
      await getStore().take(key);
      noteConnectMoment(found.integration, 'tap_refused', { reason: 'expired' });
      return null;
    }
    // take is the single-use step: of two taps racing past get, only one wins.
    const taken = await getStore().take(key);
    return taken?.uid === uid ? taken : null;
  } catch (error) {
    log.error({ error: String(error) }, 'Could not redeem invite');
    return null;
  }
}

/**
 * Put back an invite its owner just spent when the flow then couldn't start, so
 * tapping again works. It keeps its original expiry; best effort. Never for an
 * account that is gone or being erased: erasure marks and deletes the account
 * record before it sweeps invites, so a later put would outlive the sweep.
 */
export async function returnConnectInvite(token: unknown, invite: ConnectInvite): Promise<void> {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return;
  try {
    if (await accountErased(invite.uid)) return;
    await getStore().put(sha256Hex(token), invite);
  } catch (error) {
    log.error({ error: String(error), integration: invite.integration }, 'Could not return invite');
  }
}

/** Gone, being erased, or no Firestore to ask: all mean nothing is put back. */
async function accountErased(uid: string): Promise<boolean> {
  const account = getFirestoreDb()?.collection('bogle_users').doc(uid);
  return !account || isErasedOrErasing(await account.get());
}

/** Remove every invite of `uid` (account deletion). Throws when it can't. */
export async function deleteConnectInvitesFor(uid: string): Promise<number> {
  return getStore().deleteForUser(uid);
}

/** The link to text: the invite in the fragment, never in the path or query. */
export function connectInviteUrl(token: string): string {
  return `${APP_URL}${CONNECT_PAGE_PATH}#i=${token}`;
}
