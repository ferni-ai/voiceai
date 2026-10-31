/**
 * LEGACY, READ-ONLY: opens Apple Calendar app-specific passwords sealed by the
 * old calendar encryption (before 2026-10-30). Nothing writes this format now:
 * new and re-saved passwords are sealed through utils/token-at-rest (see
 * providers/apple-provider), and a record read in this format is re-sealed there.
 *
 * Why it exists: with CALENDAR_ENCRYPTION_KEY unset (it never was in the prod
 * web server's secrets), the old code derived the AES key from the project id
 * plus a salt committed to this public repo, so anyone could rebuild it. The
 * derivation is kept only so existing users are not silently disconnected.
 *
 * Delete this file (and the legacy branch in apple-provider) once prod holds no
 * users/{uid}/calendar_providers/apple doc whose credentials.appSpecificPassword
 * is an object with iv/tag. Each read re-seals one, so the count only falls.
 *
 * @module calendar/utils/encryption
 */

import { createDecipheriv, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/** The old stored shape of an encrypted password. */
export interface LegacyEncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  version: number;
}

export function isLegacyEncrypted(value: unknown): value is LegacyEncryptedData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.encrypted === 'string' &&
    typeof data.iv === 'string' &&
    typeof data.tag === 'string' &&
    typeof data.version === 'number'
  );
}

const derivedKeys = new Map<string, Buffer>();

function scryptOnce(secret: string, salt: string): Buffer {
  const id = `${salt}\u0000${secret}`;
  let key = derivedKeys.get(id);
  if (!key) {
    key = scryptSync(secret, salt, KEY_LENGTH);
    derivedKeys.set(id, key);
  }
  return key;
}

/**
 * Every key the old code could have sealed with, most specific first. The
 * old code picked one by environment; trying each lets a record survive an
 * env change, and GCM's tag rejects the wrong ones.
 */
function legacyKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const envKey = process.env.CALENDAR_ENCRYPTION_KEY;
  if (envKey) {
    keys.push(
      envKey.length === 64 ? Buffer.from(envKey, 'hex') : scryptOnce(envKey, 'ferni-calendar-salt')
    );
  }
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'ferni';
  for (const project of new Set([projectId, 'ferni'])) {
    keys.push(scryptOnce(`calendar-${project}`, 'ferni-prod-salt'));
  }
  if (process.env.NODE_ENV !== 'production') {
    keys.push(scryptOnce('dev-calendar-key', 'ferni-dev-salt'));
  }
  return keys;
}

/** The plaintext of a legacy record, or null when no legacy key opens it. Never throws. */
export function openLegacyCalendarSecret(data: LegacyEncryptedData): string | null {
  const iv = Buffer.from(data.iv, 'base64');
  const tag = Buffer.from(data.tag, 'base64');
  if (tag.length !== TAG_LENGTH) return null;
  for (const key of legacyKeys()) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
      decipher.setAuthTag(tag);
      return decipher.update(data.encrypted, 'base64', 'utf8') + decipher.final('utf8');
    } catch {
      // Not this key: try the next one.
    }
  }
  return null;
}
