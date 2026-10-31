/**
 * Token records at rest: one AES-256-GCM envelope (utils/token-encryption) in
 * place of plaintext OAuth/API tokens.
 *
 * Why: daily backups export the whole Firestore database to a bucket, so a
 * plaintext token is readable there even though security rules deny clients.
 * Every integration token store writes `{ encrypted }` through sealTokens and
 * reads through openTokens, which still accepts the legacy plaintext shape
 * until scripts/migrations/encrypt-integration-tokens.ts has run.
 */

import { FieldValue } from '@google-cloud/firestore';
import { createLogger } from './safe-logger.js';
import {
  decryptData,
  decryptionKeys,
  encryptData,
  envelopeFailure,
  envelopeIsStale,
  resolveTokenKey,
  tokenKeyId,
} from './token-encryption.js';

export { tokenKeyId } from './token-encryption.js';

const log = createLogger({ module: 'TokenAtRest' });

/**
 * Token maps kept on the profile doc. Only services/identity/profile-token-field
 * writes them; a whole-profile save must not, or a stale cached profile puts a
 * disconnected token back.
 */
export const PROFILE_TOKEN_FIELDS = ['linkedInTokens', 'biometricTokens'] as const;

/** A copy of the profile without the token fields, for whole-profile writes. */
export function withoutProfileTokenFields<T extends object>(profile: T): T {
  const copy = { ...profile } as Record<string, unknown>;
  for (const field of PROFILE_TOKEN_FIELDS) delete copy[field];
  return copy as T;
}

/** The stored shape: the whole token record, encrypted. */
export interface SealedTokens {
  encrypted: string;
}

/** Keys that mark a record as legacy plaintext (any one holding a non-empty string). */
export const PLAINTEXT_TOKEN_KEYS = [
  'access_token',
  'refresh_token',
  'accessToken',
  'refreshToken',
] as const;

export function sealTokens<T>(tokens: T): SealedTokens {
  return { encrypted: encryptData(tokens) };
}

/**
 * For a `set(..., { merge: true })` write: the sealed record plus a delete for
 * each legacy plaintext key, so the merge cannot leave the old token beside
 * the new ciphertext.
 */
export function sealTokensForMerge<T>(tokens: T): Record<string, unknown> {
  const deletes = Object.fromEntries(PLAINTEXT_TOKEN_KEYS.map((k) => [k, FieldValue.delete()]));
  return { ...deletes, ...sealTokens(tokens) };
}

/** True when a stored record still holds a plaintext token. */
export function isPlaintextTokenRecord(stored: unknown): boolean {
  if (stored === null || typeof stored !== 'object') return false;
  const record = stored as Record<string, unknown>;
  return PLAINTEXT_TOKEN_KEYS.some((k) => typeof record[k] === 'string' && record[k] !== '');
}

/**
 * Read a stored record in either form: sealed (decrypted here) or legacy
 * plaintext (returned as-is for one release). Null when absent or when the
 * envelope cannot be decrypted.
 */
export function openTokens<T>(stored: unknown, store: string): T | null {
  if (stored === null || typeof stored !== 'object') return null;
  const sealed = (stored as Partial<SealedTokens>).encrypted;
  if (typeof sealed !== 'string') {
    return isPlaintextTokenRecord(stored) ? (stored as T) : null;
  }
  const opened = decryptData<T>(sealed);
  if (opened === null) {
    // A key mismatch must not look like "not connected": say which store and why.
    log.warn(
      { store, ...envelopeFailure(sealed), kid: tokenKeyId() },
      'Sealed tokens did not open'
    );
    return null;
  }
  return opened;
}

/**
 * The boot line the web server and the agent log, for comparing their keys. With
 * TOKEN_SEALING_KEY set it also lists the key ids on the ring (ids only), so
 * prod, dev and the UI can be compared; unset, the line is what it always was.
 */
export function tokenKeyIdLine(): string {
  const { source } = resolveTokenKey();
  const line = `token_at_rest_kid=${tokenKeyId()} source=${source}`;
  if (source !== 'TOKEN_SEALING_KEY') return line;
  return `${line} ring=${decryptionKeys()
    .map((k) => k.kid)
    .join(',')}`;
}

export type ResealOutcome = 'resealed' | 'current' | 'changed' | 'failed';

/** Re-seal counts for this process, logged with each outcome (never a uid or a token). */
const resealCounts = { resealed: 0, changed: 0, failed: 0 };

export function resealCountsSnapshot(): Readonly<typeof resealCounts> {
  return { ...resealCounts };
}

function envelopeKidOf(sealed: string): string {
  try {
    const kid = (JSON.parse(sealed) as { kid?: unknown }).kid;
    return typeof kid === 'string' ? kid : 'none';
  } catch {
    return 'none';
  }
}

/**
 * Re-seal on read: after `stored` (an envelope string) opened to `value`, ask `swap`
 * to replace it with the same value sealed under TOKEN_SEALING_KEY. Best effort and
 * never throws: a failed swap leaves the old envelope, which still opens, and the
 * next read retries.
 *
 * `swap` must be atomic against the stored record (PersistenceStore.updateIfUnchanged:
 * an update() carrying the read's lastUpdateTime) and answer 'missing' or 'changed'
 * instead of writing when the record was deleted or rewritten since the read. A plain
 * set() would bring a disconnected account back or undo a refresh.
 * Unset TOKEN_SEALING_KEY: always 'current', and `swap` is never called.
 */
export async function resealStale(args: {
  store: string;
  stored: string;
  value: unknown;
  swap: (sealed: string) => Promise<'updated' | 'missing' | 'changed'>;
}): Promise<ResealOutcome> {
  const { store, stored, value, swap } = args;
  if (!envelopeIsStale(stored)) return 'current';
  const ids = { store, fromKid: envelopeKidOf(stored), toKid: tokenKeyId() };
  try {
    const result = await swap(encryptData(value));
    if (result !== 'updated') {
      resealCounts.changed += 1;
      log.info(
        { ...ids, result, ...resealCounts },
        'Token re-seal skipped: record gone or changed'
      );
      return 'changed';
    }
    resealCounts.resealed += 1;
    log.info({ ...ids, ...resealCounts }, 'Token envelope re-sealed');
    return 'resealed';
  } catch (err) {
    resealCounts.failed += 1;
    log.warn({ ...ids, ...resealCounts, error: (err as Error).message }, 'Token re-seal failed');
    return 'failed';
  }
}
