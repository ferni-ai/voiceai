/**
 * Approving one pending action with a passkey (WebAuthn assertion).
 *
 * The assertion is verified INSIDE the transaction that checks the pending
 * action and writes the decision (decidePendingAction's passkeyCheck), so
 * the check and the decision can't be split. Its challenge is bound to the
 * user, the action id and the action hash, lives 2 minutes, and is taken
 * (deleted) in that same transaction whatever the outcome.
 *
 * @module services/approvals/passkey-approval
 */

import type { Firestore, Transaction } from '@google-cloud/firestore';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  challengeRef,
  issueChallenge,
  listPasskeys,
  passkeysOf,
  relyingParty,
  requireDb,
  takeChallengeIn,
  type StoredPasskey,
} from './passkeys.js';

/** An approval's passkey challenge lives 2 minutes. */
export const APPROVAL_CHALLENGE_TTL_MS = 2 * 60 * 1000;

/** What an approval's passkey ceremony is bound to: this action, with this exact hash. */
const approvalBinding = (actionId: string, actionHash: string): string =>
  `${actionId}:${actionHash}`;

/**
 * Options to approve one pending action with a passkey; null when uid has
 * none. The challenge is bound to uid, the action id and its hash, for 2 minutes.
 */
export async function startApprovalAssertion(
  uid: string,
  actionId: string,
  actionHash: string,
  now = Date.now(),
  db: Firestore | null = getFirestoreDb()
): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const passkeys = await listPasskeys(uid, db);
  if (passkeys.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    allowCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    userVerification: 'required',
  });
  const binding = approvalBinding(actionId, actionHash);
  await issueChallenge(
    uid,
    'approve',
    options.challenge,
    binding,
    now,
    db,
    APPROVAL_CHALLENGE_TTL_MS
  );
  return options;
}

/**
 * Verify an approval's passkey assertion INSIDE the caller's transaction (the
 * one that checks the pending action and writes the decision), so the check
 * and the decision can't be split. All reads happen before any write:
 * - the challenge is taken (deleted) whatever the outcome, so it is single-use;
 * - it must be uid's, for this action id and hash, and under 2 minutes old;
 * - the credential is looked up only under uid's own passkeys;
 * - on success the credential's counter and lastUsedAt are updated.
 */
export async function verifyApprovalAssertion(
  tx: Transaction,
  input: {
    uid: string;
    actionId: string;
    actionHash: string;
    response: AuthenticationResponseJSON;
  },
  now = Date.now(),
  db: Firestore | null = getFirestoreDb()
): Promise<boolean> {
  const store = requireDb(db);
  const { uid, actionId, actionHash, response } = input;
  const credentialRef =
    typeof response?.id === 'string' && response.id
      ? passkeysOf(store, uid).doc(response.id)
      : null;
  const credentialSnap = credentialRef ? await tx.get(credentialRef) : null;
  const challenge = await takeChallengeIn(
    tx,
    challengeRef(store, uid, 'approve'),
    'approve',
    approvalBinding(actionId, actionHash),
    now
  );
  if (!challenge || !credentialRef || !credentialSnap?.exists) return false;
  const passkey = credentialSnap.data() as StoredPasskey;
  const { rpID, origins } = relyingParty();
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.id,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
      counter: passkey.counter,
      transports: passkey.transports,
    },
  }).catch(() => null);
  if (!result?.verified) return false;
  tx.update(credentialRef, { counter: result.authenticationInfo.newCounter, lastUsedAt: now });
  return true;
}
