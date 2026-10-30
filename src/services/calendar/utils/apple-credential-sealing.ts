/**
 * Apple Calendar app-specific passwords at rest, sealed through the shared
 * token sealing (utils/token-at-rest: TOKEN_SEALING_KEY, then
 * OAUTH_ENCRYPTION_KEY, then LOG_HASH_SECRET). With no token key nothing is
 * stored, in any environment: never plaintext, never a key from this repo.
 *
 * Records written before 2026-10-30 (derived-key ciphertext from the legacy,
 * read-only utils/encryption, or plaintext) still open, and are re-sealed on
 * read once a token key is configured.
 *
 * @module calendar/utils/apple-credential-sealing
 */

import type { DocumentReference, DocumentSnapshot } from '@google-cloud/firestore';
import { getLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { openTokens, resealStale, type SealedTokens } from '../../../utils/token-at-rest.js';
import { encryptData, resolveTokenKey } from '../../../utils/token-encryption.js';
import {
  isLegacyEncrypted,
  openLegacyCalendarSecret,
  type LegacyEncryptedData,
} from './encryption.js';

const log = getLogger();

const STORE = 'calendar_providers/apple';
const NOT_FOUND = 5;
const FAILED_PRECONDITION = 9;

/** Stored format: the password sealed, everything else as-is. */
export interface StoredAppleCredentials {
  appleId: string;
  /** Sealed { appSpecificPassword } (utils/token-at-rest). The only format written. */
  sealedPassword?: SealedTokens;
  /** Legacy, read-only: derived-key ciphertext (utils/encryption) or plaintext. */
  appSpecificPassword?: string | LegacyEncryptedData;
  principalUrl?: string;
  calendars?: Array<{ url: string; displayName: string; ctag?: string }>;
  lastValidated?: string;
}

/**
 * Why a connection was or was not saved. 'sealing_unavailable': no token key is
 * configured, so nothing was stored.
 */
export type AppleStoreResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_credentials' | 'sealing_unavailable' | 'storage_failed' };

/** True when a token key is configured. encryptData alone writes plain JSON without one outside prod. */
export function canSealApplePassword(): boolean {
  return resolveTokenKey().source !== 'none';
}

/** Call only after canSealApplePassword(). */
export function sealApplePassword(appSpecificPassword: string): SealedTokens {
  return { encrypted: encryptData({ appSpecificPassword }) };
}

/** The password from any stored format; `legacy` when it should be re-sealed. */
export function openStoredApplePassword(
  stored: StoredAppleCredentials
): { password: string; legacy: boolean } | null {
  if (stored.sealedPassword) {
    const opened = openTokens<{ appSpecificPassword?: unknown }>(stored.sealedPassword, STORE);
    const password = opened?.appSpecificPassword;
    return typeof password === 'string' && password ? { password, legacy: false } : null;
  }
  const legacy = stored.appSpecificPassword;
  if (isLegacyEncrypted(legacy)) {
    const password = openLegacyCalendarSecret(legacy);
    if (password === null) log.warn({ store: STORE }, 'Legacy Apple password did not open');
    return password ? { password, legacy: true } : null;
  }
  return typeof legacy === 'string' && legacy ? { password: legacy, legacy: true } : null;
}

/**
 * Re-seal on read, best effort, never throws: a legacy record is moved to the
 * token key when one is configured, and a sealed one to TOKEN_SEALING_KEY when
 * it was sealed under an older key. The update carries the read's updateTime,
 * so it cannot undo a disconnect or a newer save. `rest` is the credentials
 * map without the password; the whole map is replaced, dropping legacy fields.
 */
export async function resealApplePasswordOnRead(args: {
  ref: DocumentReference;
  doc: DocumentSnapshot;
  stored: StoredAppleCredentials;
  rest: Omit<StoredAppleCredentials, 'sealedPassword' | 'appSpecificPassword'>;
  password: string;
  legacy: boolean;
}): Promise<void> {
  const { ref, doc, stored, rest, password, legacy } = args;
  const readTime = doc.updateTime;
  if (!readTime) return;
  const swap = async (encrypted: string): Promise<'updated' | 'missing' | 'changed'> => {
    try {
      const credentials = { ...rest, sealedPassword: { encrypted } };
      await ref.update(cleanForFirestore({ credentials }), { lastUpdateTime: readTime });
      return 'updated';
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code === FAILED_PRECONDITION) return 'changed';
      if (code === NOT_FOUND) return 'missing';
      throw err;
    }
  };
  const value = { appSpecificPassword: password };
  if (!legacy) {
    const sealed = stored.sealedPassword?.encrypted;
    if (sealed) await resealStale({ store: STORE, stored: sealed, value, swap });
    return;
  }
  if (!canSealApplePassword()) return; // stays readable; re-sealed once a key is configured
  try {
    const result = await swap(sealApplePassword(password).encrypted);
    log.info({ store: STORE, result }, 'Legacy Apple password re-seal');
  } catch (err) {
    log.warn(
      { store: STORE, error: (err as Error).message },
      'Legacy Apple password re-seal failed'
    );
  }
}
