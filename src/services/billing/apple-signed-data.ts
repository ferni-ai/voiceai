/**
 * App Store signed data: verified with Apple's own library, bound to one user.
 *
 * Everything Apple signs (transactions, renewal info, server notifications)
 * goes through @apple/app-store-server-library's SignedDataVerifier, pinned to
 * Apple's root CAs (apple-root-certs.ts), with online revocation checks, our
 * bundle id, and our environment (and app Apple ID in production). There's no
 * hand-rolled JWS/x5c code here.
 *
 * Purchases are bound to the verified caller:
 * - A transaction carrying appAccountToken belongs to the user that token was
 *   issued for (appAccountTokenFor, served by GET /api/apple/account-token for
 *   the app to pass to StoreKit). Any other caller gets 403, even on first claim.
 * - Without a token (today's iOS builds don't set one) ownership falls back to
 *   first claim on originalTransactionId, recorded with an atomic Firestore
 *   create, so a second user can never take it over (403). Known limitation:
 *   whoever obtains a tokenless signed transaction first (a forwarded receipt,
 *   a logged JWS) can claim it before the buyer, until the app sends the token.
 * - Deleting an account tombstones its records (no raw uid kept). A tombstoned
 *   purchase is never claimable by first claim, only by a matching token.
 * Every claim is logged with uid and originalTransactionId. Ownership never
 * comes from a client-supplied userId.
 *
 * When verification can't run (no root/bundle/app id config, no Firestore,
 * Apple unreachable) callers get `unavailable` and must fail closed.
 *
 * @module services/billing/apple-signed-data
 */
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import { createHash } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { APPLE_ROOT_CERTIFICATES } from './apple-root-certs.js';

const log = createLogger({ module: 'AppleSignedData' });

/** Firestore collection: originalTransactionId -> { userId, claimedAt }. */
export const APPLE_TRANSACTION_OWNERS = 'apple_transaction_owners';

/** gRPC ALREADY_EXISTS, what Firestore's create() throws when the doc is there. */
const ALREADY_EXISTS = 6;

type Env = Record<string, string | undefined>;

/** Fixed namespace for appAccountToken = UUIDv5(uid). Changing it orphans every issued token. */
const APP_ACCOUNT_TOKEN_NAMESPACE = 'dd86dd64-3f16-47aa-8f79-689103b9bfed';

/**
 * The appAccountToken the app should pass to StoreKit for this user: a stable
 * UUID derived from the uid, so nothing needs storing.
 */
export function appAccountTokenFor(userId: string): string {
  return uuidv5(userId, APP_ACCOUNT_TOKEN_NAMESPACE);
}

/**
 * The App Store environment this server accepts. Only Production or Sandbox:
 * the library skips signature checks entirely for LocalTesting and Xcode.
 */
export function appleEnvironment(env: Env = process.env): Environment {
  if (env.APPLE_ENVIRONMENT === 'Production') return Environment.PRODUCTION;
  if (env.APPLE_ENVIRONMENT === 'Sandbox') return Environment.SANDBOX;
  return env.NODE_ENV === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;
}

/**
 * Build the verifier from config, or null when it can't verify safely
 * (production needs APPLE_APP_APPLE_ID to check notifications are for our app).
 */
export function createAppleVerifier(
  env: Env = process.env,
  roots: readonly Buffer[] = APPLE_ROOT_CERTIFICATES
): SignedDataVerifier | null {
  const environment = appleEnvironment(env);
  const bundleId = env.APPLE_BUNDLE_ID || 'com.ferni.app';
  const appAppleId = env.APPLE_APP_APPLE_ID ? Number(env.APPLE_APP_APPLE_ID) : undefined;
  if (environment === Environment.PRODUCTION && !Number.isInteger(appAppleId)) {
    log.error('APPLE_APP_APPLE_ID is not set: App Store data cannot be verified in production');
    return null;
  }
  // Revocation (OCSP) checks stay on unless explicitly turned off, e.g. offline tests.
  const onlineChecks = env.APPLE_ONLINE_CHECKS !== 'false';
  return new SignedDataVerifier([...roots], onlineChecks, environment, bundleId, appAppleId);
}

let cachedVerifier: SignedDataVerifier | null | undefined;

/** The process-wide verifier (null when not configured: fail closed). */
export function getAppleVerifier(): SignedDataVerifier | null {
  if (cachedVerifier === undefined) cachedVerifier = createAppleVerifier();
  return cachedVerifier;
}

/** Like getAppleVerifier, but throws when verification isn't possible. */
export function requireAppleVerifier(): SignedDataVerifier {
  const verifier = getAppleVerifier();
  if (!verifier) throw new Error('App Store signed data cannot be verified (not configured)');
  return verifier;
}

function isJws(value: string): boolean {
  return value.split('.').length === 3;
}

/** Ask Apple for a transaction's signed info by id (StoreKit 2 sends the id). */
async function fetchSignedTransaction(transactionId: string, env: Env): Promise<string | null> {
  const { APPLE_PRIVATE_KEY: key, APPLE_KEY_ID: keyId, APPLE_ISSUER_ID: issuerId } = env;
  if (!key || !keyId || !issuerId) return null;
  const client = new AppStoreServerAPIClient(
    key,
    keyId,
    issuerId,
    env.APPLE_BUNDLE_ID || 'com.ferni.app',
    appleEnvironment(env)
  );
  const response = await client.getTransactionInfo(transactionId);
  return response.signedTransactionInfo ?? null;
}

/**
 * An owner record. When its account is deleted the record becomes a tombstone
 * ({ userId: null, deletedAt, previousOwnerHash }) rather than being removed:
 * removing it would let the next account to present the signed transaction
 * take the subscription by first claim.
 */
interface OwnerRecord {
  userId?: string | null;
  claimedAt?: string;
  deletedAt?: string;
  previousOwnerHash?: string;
}

/**
 * Record `userId` as the owner unless someone else already is. A deleted
 * account's purchase (tombstone) is never claimable by first claim; only a
 * claim whose appAccountToken was issued for `userId` (`tokenBound`) proves it.
 */
export async function claimTransactionOwner(
  originalTransactionId: string,
  userId: string,
  tokenBound = false
): Promise<'mine' | 'theirs' | 'unavailable'> {
  const db = getFirestoreDb();
  if (!db) return 'unavailable';
  const ref = db.collection(APPLE_TRANSACTION_OWNERS).doc(originalTransactionId);
  try {
    await ref.create({ userId, claimedAt: new Date().toISOString() });
    return 'mine';
  } catch (error) {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) {
      log.error({ error: String(error) }, 'Could not record Apple transaction owner');
      return 'unavailable';
    }
  }
  try {
    const owner = (await ref.get()).data() as OwnerRecord | undefined;
    if (owner?.userId === userId) return 'mine';
    if (owner?.deletedAt === undefined || !tokenBound) return 'theirs';
    await ref.set({ userId, claimedAt: new Date().toISOString() });
    return 'mine';
  } catch (error) {
    log.error({ error: String(error) }, 'Could not read or update Apple transaction owner');
    return 'unavailable';
  }
}

/**
 * Who owns a transaction: the user id, null when nobody has claimed it, or
 * 'unavailable' when the record can't be read (callers fail closed).
 */
export async function getTransactionOwner(
  originalTransactionId: string
): Promise<{ owner: string | null } | 'unavailable'> {
  const db = getFirestoreDb();
  if (!db) return 'unavailable';
  try {
    const snap = await db.collection(APPLE_TRANSACTION_OWNERS).doc(originalTransactionId).get();
    const owner = (snap.data() as { userId?: string } | undefined)?.userId;
    return { owner: typeof owner === 'string' ? owner : null };
  } catch (error) {
    log.error({ error: String(error) }, 'Could not read Apple transaction owner');
    return 'unavailable';
  }
}

/**
 * Account deletion: replace every ownership record held by `userId` with a
 * tombstone that keeps no raw uid (only its SHA-256), so the deleted account
 * no longer holds its purchases, and nobody else can take them by first claim
 * (see claimTransactionOwner). Throws when it can't.
 */
export async function tombstoneTransactionOwnersFor(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const snap = await db.collection(APPLE_TRANSACTION_OWNERS).where('userId', '==', userId).get();
  const tombstone: OwnerRecord = {
    userId: null,
    deletedAt: new Date().toISOString(),
    previousOwnerHash: createHash('sha256').update(userId).digest('hex'),
  };
  await Promise.all(snap.docs.map(async (doc) => doc.ref.set(tombstone)));
  return snap.docs.length;
}

export type AppleClaimResult =
  | { ok: true; transaction: JWSTransactionDecodedPayload }
  | { ok: false; status: 400 | 403 | 503; error: string };

const UNAVAILABLE: AppleClaimResult = {
  ok: false,
  status: 503,
  error: "Purchases can't be verified right now",
};

const OWNED_ELSEWHERE: AppleClaimResult = {
  ok: false,
  status: 403,
  error: 'That purchase belongs to another account',
};

/**
 * Verify a purchase with Apple and bind it to `userId` (the verified caller).
 * `receipt` is a StoreKit 2 transaction id or its signed JWS representation.
 */
export async function claimAppleTransaction(
  userId: string,
  receipt: string,
  verifier: SignedDataVerifier | null = getAppleVerifier(),
  env: Env = process.env
): Promise<AppleClaimResult> {
  if (!verifier) return UNAVAILABLE;

  let signed: string | null;
  try {
    signed = isJws(receipt) ? receipt : await fetchSignedTransaction(receipt, env);
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not fetch the transaction from Apple');
    return UNAVAILABLE;
  }
  if (!signed) return UNAVAILABLE;

  let transaction: JWSTransactionDecodedPayload;
  try {
    // Checks Apple's signature chain, our bundle id and our environment.
    transaction = await verifier.verifyAndDecodeTransaction(signed);
  } catch (error) {
    log.warn(
      { error: String(error) },
      'Rejected an App Store transaction that failed verification'
    );
    return { ok: false, status: 400, error: "That purchase couldn't be verified" };
  }

  const originalTransactionId = transaction.originalTransactionId;
  if (!originalTransactionId) {
    return { ok: false, status: 400, error: "That purchase couldn't be verified" };
  }

  // A token issued for one user decides ownership outright: no first-claim race.
  const token = transaction.appAccountToken?.toLowerCase();
  if (token && token !== appAccountTokenFor(userId)) {
    log.warn({ userId, originalTransactionId }, 'Refused a purchase bought for another account');
    return OWNED_ELSEWHERE;
  }

  const owner = await claimTransactionOwner(originalTransactionId, userId, Boolean(token));
  log.info(
    { userId, originalTransactionId, bound: token ? 'appAccountToken' : 'first-claim', owner },
    'Apple purchase claim'
  );
  if (owner === 'unavailable') return UNAVAILABLE;
  if (owner === 'theirs') return OWNED_ELSEWHERE;
  return { ok: true, transaction };
}
