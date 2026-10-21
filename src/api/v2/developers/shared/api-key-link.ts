/**
 * Whether an API key may still act for its publisher.
 *
 * Firebase-token requests re-check the publisher link on every call
 * (resolvePublisher). An API key carries no token to re-check, so it is bound
 * to the account that minted it instead: `createdByUid`, or `firebaseUid` on
 * keys written before that field existed. The key works only while the
 * publisher record is still linked to that same account AND that account is
 * sound under the same rules as resolvePublisher (publisher-link-rules). A key
 * with no recorded account works only while the publisher has a sound link.
 *
 * Sound results are cached per account for five minutes, because checking
 * costs an Auth lookup per request. Unsound results and errors never are.
 *
 * @module api/v2/developers/shared/api-key-link
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { getFirebaseAuth, type Firestore } from '../../../v1/developers/shared/developer-auth.js';
import {
  accountFromUser,
  linkProblem,
} from '../../../v1/developers/shared/publisher-link-rules.js';

const log = getLogger().child({ module: 'api-key-link' });

export const KEY_REVOKED_MESSAGE = 'key revoked: re-link your account';

const SOUND_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED = 1000;
/** Expiry time of each recent sound result, keyed by account uid + publisher email. */
const soundUntil = new Map<string, number>();

/** Forget every cached sound result (tests). */
export function resetApiKeyLinkCache(): void {
  soundUntil.clear();
}

/** The account a key was minted by, or null for keys that never recorded one. */
export function keyMintingUid(keyData: Record<string, unknown>): string | null {
  for (const field of ['createdByUid', 'firebaseUid']) {
    const uid = keyData[field];
    if (typeof uid === 'string' && uid) return uid;
  }
  return null;
}

/**
 * True when the linked account may act for a publisher with this email. A
 * deleted account is not sound; any other Auth failure is logged and thrown,
 * so the caller refuses the request (fails closed).
 */
async function linkedAccountIsSound(
  uid: string,
  publisherEmail: unknown,
  publisherId: string
): Promise<boolean> {
  const cacheKey = `${uid}\n${String(publisherEmail).toLowerCase()}`;
  if ((soundUntil.get(cacheKey) ?? 0) > Date.now()) return true;

  let user;
  try {
    user = await (await getFirebaseAuth()).getUser(uid);
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'auth/user-not-found') return false;
    log.error(
      { publisherId, error: String(error) },
      'API key refused: linked account lookup failed'
    );
    throw error;
  }
  if (linkProblem(publisherEmail, accountFromUser(user))) return false;

  if (soundUntil.size >= MAX_CACHED) soundUntil.clear();
  soundUntil.set(cacheKey, Date.now() + SOUND_TTL_MS);
  return true;
}

/** True when the key's publisher is still soundly linked to the account that minted it. */
export async function apiKeyLinkHolds(
  db: Firestore,
  keyData: Record<string, unknown>
): Promise<boolean> {
  const { publisherId } = keyData;
  if (typeof publisherId !== 'string' || !publisherId) return false;
  const publisher = await db.collection('publishers').doc(publisherId).get();
  const record = publisher.exists ? publisher.data() : undefined;
  const linkedUid = record?.firebaseUid;
  if (typeof linkedUid !== 'string' || !linkedUid) return false;
  const mintedBy = keyMintingUid(keyData);
  if (mintedBy !== null && mintedBy !== linkedUid) return false;
  return linkedAccountIsSound(linkedUid, record?.email, publisherId);
}
