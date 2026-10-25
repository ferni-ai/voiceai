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
  encryptData,
  envelopeFailure,
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
 * For stores whose docs are not always token-shaped (smart_home also holds
 * HomeKit config): a sealed doc is opened, anything else is returned as stored.
 */
export function openSealedOrRaw<T>(stored: unknown, store: string): T | null {
  if (stored === null || typeof stored !== 'object') return null;
  if (typeof (stored as Partial<SealedTokens>).encrypted !== 'string') return stored as T;
  return openTokens<T>(stored, store);
}

/** The boot line the web server and the agent log, for comparing their keys. */
export function tokenKeyIdLine(): string {
  return `token_at_rest_kid=${tokenKeyId()} source=${resolveTokenKey().source}`;
}
