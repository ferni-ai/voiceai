/**
 * Sign in with Apple grants: keep a refresh token so account deletion can
 * revoke it (App Store guideline 5.1.1(v): apps with Sign in with Apple
 * revoke the user's tokens through Apple's REST API when the account goes).
 *
 * After a Sign in with Apple, the app sends Apple's one-time authorization
 * code. exchangeAuthorizationCode trades it at appleid.apple.com/auth/token
 * for a refresh token, checks the Apple account is the one linked to the
 * caller's Firebase user, and stores the token encrypted in
 * apple_signin_tokens/<uid> (server-only: firestore.rules denies clients).
 * revokeAppleSignIn posts it to /auth/revoke and deletes the record.
 *
 * Both need SIWA_KEY_P8, SIWA_KEY_ID and SIWA_TEAM_ID (a Sign in with Apple
 * key). Without them they do nothing and say so. Revocation never throws:
 * an account deletion must not fail because Apple didn't answer.
 *
 * Never log a code, a token or the client secret.
 *
 * @module services/apple/siwa-tokens
 */
import type { Firestore } from '@google-cloud/firestore';
import { SignJWT, decodeJwt, importPKCS8 } from 'jose';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { decryptData, encryptData } from '../../utils/token-encryption.js';
import { erasureErrorCode } from '../platform/erasure-step.js';

const log = createLogger({ module: 'siwa-tokens' });

const APPLE = 'https://appleid.apple.com';
export const SIWA_TOKENS_COLLECTION = 'apple_signin_tokens';
const TIMEOUT_MS = 5_000;

/** Sign in with Apple client ids: the app's bundle id, or the website's Services ID. */
export const SIWA_CLIENT_IDS = {
  native: 'com.sethdford.ferni',
  web: 'com.sethdford.ferni.web',
} as const;
export type SiwaClient = keyof typeof SIWA_CLIENT_IDS;

interface StoredGrant {
  /** encryptData({ refreshToken }) */
  refreshToken: string;
  clientId: string;
  updatedAt: string;
}

export interface SiwaDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  db?: Firestore | null;
  /** The Apple user id (sub) linked to this Firebase user, or null. */
  appleSubFor?: (uid: string) => Promise<string | null>;
  now?: () => Date;
}

interface SiwaKey {
  p8: string;
  keyId: string;
  teamId: string;
}

function siwaKey(env: Record<string, string | undefined>): SiwaKey | null {
  const p8 = env.SIWA_KEY_P8?.trim();
  const keyId = env.SIWA_KEY_ID?.trim();
  const teamId = env.SIWA_TEAM_ID?.trim();
  return p8 && keyId && teamId ? { p8, keyId, teamId } : null;
}

export function siwaConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return siwaKey(env) !== null;
}

/** Apple's client secret: an ES256 JWT signed with the Sign in with Apple key. */
export async function siwaClientSecret(key: SiwaKey, clientId: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: key.keyId })
    .setIssuer(key.teamId)
    .setSubject(clientId)
    .setAudience(APPLE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .sign(await importPKCS8(key.p8.replace(/\\n/g, '\n'), 'ES256'));
}

function database(deps: SiwaDeps): Firestore {
  const db = deps.db === undefined ? getFirestoreDb() : deps.db;
  if (!db) throw new Error('Firestore unavailable');
  return db;
}

async function defaultAppleSubFor(uid: string): Promise<string | null> {
  const { getFirebaseUser } = await import('../identity/firebase-auth.js');
  const user = await getFirebaseUser(uid);
  return user?.providerData.find((p) => p.providerId === 'apple.com')?.uid ?? null;
}

async function postForm(
  deps: SiwaDeps,
  path: string,
  form: Record<string, string>
): Promise<Response> {
  return (deps.fetch ?? fetch)(`${APPLE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export type ExchangeResult =
  | { stored: true }
  | { stored: false; reason: 'not_configured' | 'rejected' | 'not_linked' | 'no_refresh_token' };

/**
 * Trade the app's authorization code for a refresh token and keep it for
 * `uid`. Only when the Apple account that signed in is the one linked to the
 * caller's Firebase user ('not_linked' otherwise). Throws only when storage fails.
 */
export async function exchangeAuthorizationCode(
  uid: string,
  code: string,
  client: SiwaClient,
  deps: SiwaDeps = {}
): Promise<ExchangeResult> {
  const key = siwaKey(deps.env ?? process.env);
  if (!key) {
    log.info('Sign in with Apple key not configured; authorization code not exchanged');
    return { stored: false, reason: 'not_configured' };
  }
  const now = (deps.now ?? (() => new Date()))();
  const clientId = SIWA_CLIENT_IDS[client];
  const res = await postForm(deps, '/auth/token', {
    client_id: clientId,
    client_secret: await siwaClientSecret(key, clientId, now),
    code,
    grant_type: 'authorization_code',
  });
  if (!res.ok) {
    log.warn({ status: res.status, client }, 'Apple refused the authorization code');
    return { stored: false, reason: 'rejected' };
  }
  const body = (await res.json()) as { refresh_token?: unknown; id_token?: unknown };
  if (typeof body.refresh_token !== 'string' || typeof body.id_token !== 'string') {
    return { stored: false, reason: 'no_refresh_token' };
  }
  // The id_token came straight from Apple over TLS; its sub names the Apple account.
  const appleSub = decodeJwt(body.id_token).sub;
  const linked = await (deps.appleSubFor ?? defaultAppleSubFor)(uid);
  if (!appleSub || appleSub !== linked) {
    log.warn({ client }, 'Apple account is not the one linked to this user; token not kept');
    return { stored: false, reason: 'not_linked' };
  }
  const grant: StoredGrant = {
    refreshToken: encryptData({ refreshToken: body.refresh_token }),
    clientId,
    updatedAt: now.toISOString(),
  };
  await database(deps).collection(SIWA_TOKENS_COLLECTION).doc(uid).set(grant);
  return { stored: true };
}

export type RevokeResult = 'revoked' | 'none' | 'not_configured' | 'failed';

/**
 * Account deletion: revoke the user's Sign in with Apple grant and forget it.
 * Never throws. The stored record is deleted even when Apple can't be reached
 * (the account is going), and a failure is logged for follow-up.
 */
export async function revokeAppleSignIn(uid: string, deps: SiwaDeps = {}): Promise<RevokeResult> {
  let result: RevokeResult = 'failed';
  try {
    const ref = database(deps).collection(SIWA_TOKENS_COLLECTION).doc(uid);
    const snap = await ref.get();
    const grant = snap.exists ? (snap.data() as StoredGrant | undefined) : undefined;
    if (!grant) return 'none';
    try {
      result = await revokeGrant(grant, deps);
    } finally {
      await ref.delete();
    }
  } catch (error) {
    log.error({ error: erasureErrorCode(error) }, 'Sign in with Apple revocation failed');
  }
  if (result !== 'revoked') log.warn({ result }, 'Sign in with Apple grant not revoked');
  return result;
}

async function revokeGrant(grant: StoredGrant, deps: SiwaDeps): Promise<RevokeResult> {
  const key = siwaKey(deps.env ?? process.env);
  if (!key) return 'not_configured';
  const token = decryptData<{ refreshToken?: string }>(grant.refreshToken)?.refreshToken;
  if (!token) return 'failed';
  const now = (deps.now ?? (() => new Date()))();
  const res = await postForm(deps, '/auth/revoke', {
    client_id: grant.clientId,
    client_secret: await siwaClientSecret(key, grant.clientId, now),
    token,
    token_type_hint: 'refresh_token',
  });
  if (!res.ok) log.warn({ status: res.status }, 'Apple refused the revocation');
  return res.ok ? 'revoked' : 'failed';
}
