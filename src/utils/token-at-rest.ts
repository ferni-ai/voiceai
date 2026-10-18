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
import { encryptData, decryptData } from './token-encryption.js';

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
  if (!stored || typeof stored !== 'object') return false;
  const record = stored as Record<string, unknown>;
  return PLAINTEXT_TOKEN_KEYS.some((k) => typeof record[k] === 'string' && record[k] !== '');
}

/**
 * Read a stored record in either form: sealed (decrypted here) or legacy
 * plaintext (returned as-is for one release). Null when absent or when the
 * envelope cannot be decrypted.
 */
export function openTokens<T>(stored: unknown): T | null {
  if (!stored || typeof stored !== 'object') return null;
  const sealed = (stored as Partial<SealedTokens>).encrypted;
  if (typeof sealed !== 'string') {
    return isPlaintextTokenRecord(stored) ? (stored as T) : null;
  }
  const opened = decryptData<T>(sealed);
  // decryptData falls back to JSON.parse on a bad key, which yields the
  // envelope itself rather than tokens.
  if (!opened || (opened as { encrypted?: unknown }).encrypted === true) return null;
  return opened;
}
