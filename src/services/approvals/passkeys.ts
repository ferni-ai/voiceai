/**
 * WebAuthn passkeys for approvals (registration; assertion lands with the
 * approval wiring). Design: see the PR that added this file.
 *
 * - Credentials live under bogle_users/{uid}/passkeys/{credentialId}, so
 *   account erasure (eraseUserRecord) removes them with the user record.
 * - Each ceremony's challenge is stored server-side, one per user and
 *   purpose, for 5 minutes, and is taken (deleted) by the first verify that
 *   reads it, pass or fail: a challenge is never reused.
 * - User verification (biometric or PIN) is required; attestation is 'none'.
 *
 * Off unless APPROVALS_PAGE=on and APPROVALS_PASSKEYS=on.
 *
 * @module services/approvals/passkeys
 */

import { createHash } from 'node:crypto';
import type { DocumentReference, Firestore, Transaction } from '@google-cloud/firestore';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { APP_URL } from '../../config/api-urls.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { isApprovalsPageEnabled } from './flag.js';

export const CHALLENGES_COLLECTION = 'webauthn_challenges';
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RP_NAME = 'Ferni';
const MAX_PASSKEYS = 10;

export type ChallengePurpose = 'register' | 'manage' | 'approve';

export interface StoredPasskey {
  id: string; // credential id, base64url
  publicKey: string; // COSE public key, base64url
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

interface StoredChallenge {
  challenge: string;
  purpose: ChallengePurpose;
  binding: string; // what the ceremony is for (e.g. an action hash); '' when nothing
  expiresAt: number;
  deleteAt: Date;
}

export function isPasskeysEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return isApprovalsPageEnabled(env) && env.APPROVALS_PASSKEYS === 'on';
}

/** The relying party: the app's host, and the origins a ceremony may come from. */
export function relyingParty(env: Record<string, string | undefined> = process.env): {
  rpID: string;
  origins: string[];
} {
  const origins = (env.WEBAUTHN_ORIGINS || APP_URL)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return { rpID: env.WEBAUTHN_RP_ID || new URL(origins[0] ?? APP_URL).hostname, origins };
}

export const passkeysOf = (db: Firestore, uid: string) =>
  db.collection('bogle_users').doc(uid).collection('passkeys');

export const challengeRef = (db: Firestore, uid: string, purpose: ChallengePurpose) =>
  db.collection(CHALLENGES_COLLECTION).doc(`${uid}_${purpose}`);

export function requireDb(db: Firestore | null): Firestore {
  if (!db) throw new Error('passkeys need Firestore');
  return db;
}

export async function listPasskeys(
  uid: string,
  db: Firestore | null = getFirestoreDb()
): Promise<StoredPasskey[]> {
  const snap = await passkeysOf(requireDb(db), uid).get();
  return snap.docs.map((d) => d.data() as StoredPasskey);
}

/** Store a fresh challenge for uid's next ceremony of this purpose (replacing any earlier one). */
export async function issueChallenge(
  uid: string,
  purpose: ChallengePurpose,
  challenge: string,
  binding = '',
  now = Date.now(),
  db: Firestore | null = getFirestoreDb(),
  ttlMs = CHALLENGE_TTL_MS
): Promise<void> {
  const stored: StoredChallenge = {
    challenge,
    purpose,
    binding,
    expiresAt: now + ttlMs,
    deleteAt: new Date(now + ttlMs),
  };
  await challengeRef(requireDb(db), uid, purpose).set(stored);
}

/**
 * Take (read and delete, once) uid's challenge for this purpose: the
 * challenge string when it exists, is unexpired and was issued for binding.
 */
export async function takeChallenge(
  uid: string,
  purpose: ChallengePurpose,
  binding = '',
  now = Date.now(),
  db: Firestore | null = getFirestoreDb()
): Promise<string | null> {
  const store = requireDb(db);
  const ref = challengeRef(store, uid, purpose);
  return store.runTransaction(async (tx) => takeChallengeIn(tx, ref, purpose, binding, now));
}

/** takeChallenge inside the caller's transaction: read, delete, and judge it. */
export async function takeChallengeIn(
  tx: Transaction,
  ref: DocumentReference,
  purpose: ChallengePurpose,
  binding: string,
  now: number
): Promise<string | null> {
  const snap = await tx.get(ref);
  if (!snap.exists) return null;
  tx.delete(ref);
  const stored = snap.data() as StoredChallenge;
  const usable =
    stored.purpose === purpose && stored.binding === binding && now <= stored.expiresAt;
  return usable ? stored.challenge : null;
}

/** An opaque, stable WebAuthn user handle for uid (never the uid or email itself). */
function userHandle(uid: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash('sha256').update(`ferni-webauthn:${uid}`).digest());
}

/**
 * Options for registering uid's first passkey. Adding more, or removing one,
 * needs an assertion from an existing passkey and arrives with that flow; until
 * then this refuses when uid already has a passkey.
 */
export async function startRegistration(
  uid: string,
  userName: string,
  db: Firestore | null = getFirestoreDb()
): Promise<PublicKeyCredentialCreationOptionsJSON | 'has_passkey'> {
  if ((await listPasskeys(uid, db)).length > 0) return 'has_passkey';
  const { rpID } = relyingParty();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName,
    userID: userHandle(uid),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await issueChallenge(uid, 'register', options.challenge, '', Date.now(), db);
  return options;
}

/** Verify the browser's registration response and store the passkey; false when it doesn't verify. */
export async function finishRegistration(
  uid: string,
  response: RegistrationResponseJSON,
  now = Date.now(),
  db: Firestore | null = getFirestoreDb()
): Promise<boolean> {
  const challenge = await takeChallenge(uid, 'register', '', now, db);
  if (!challenge) return false;
  const existing = await listPasskeys(uid, db);
  if (existing.length >= MAX_PASSKEYS) return false;
  const { rpID, origins } = relyingParty();
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) return false;
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const passkey: StoredPasskey = {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    createdAt: now,
    lastUsedAt: null,
  };
  await passkeysOf(requireDb(db), uid).doc(credential.id).set(passkey);
  return true;
}
