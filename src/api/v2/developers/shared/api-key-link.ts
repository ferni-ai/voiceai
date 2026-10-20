/**
 * Whether an API key may still act for its publisher.
 *
 * Firebase-token requests re-check the publisher link on every call
 * (resolvePublisher). An API key carries no token to re-check, so it is bound
 * to the account that minted it instead: `createdByUid`, or `firebaseUid` on
 * keys written before that field existed. The key works only while the
 * publisher record is still linked to that same account, so a key minted
 * through a link that was later cleared or replaced stops working. A key with
 * no recorded account works only while the publisher has a link at all.
 *
 * @module api/v2/developers/shared/api-key-link
 */

import type { Firestore } from '../../../v1/developers/shared/developer-auth.js';

export const KEY_REVOKED_MESSAGE = 'key revoked: re-link your account';

/** The account a key was minted by, or null for keys that never recorded one. */
export function keyMintingUid(keyData: Record<string, unknown>): string | null {
  for (const field of ['createdByUid', 'firebaseUid']) {
    const uid = keyData[field];
    if (typeof uid === 'string' && uid) return uid;
  }
  return null;
}

/** True when the key's publisher is still linked to the account that minted it. */
export async function apiKeyLinkHolds(
  db: Firestore,
  keyData: Record<string, unknown>
): Promise<boolean> {
  const { publisherId } = keyData;
  if (typeof publisherId !== 'string' || !publisherId) return false;
  const publisher = await db.collection('publishers').doc(publisherId).get();
  const linkedUid = publisher.exists ? publisher.data()?.firebaseUid : undefined;
  if (typeof linkedUid !== 'string' || !linkedUid) return false;
  const mintedBy = keyMintingUid(keyData);
  return mintedBy === null || mintedBy === linkedUid;
}
