/**
 * Secure token encryption utilities (AES-256-GCM)
 *
 * Lives in utils so both the token server (servers/) and the services that
 * read OAuth tokens can use one format. servers/shared/encryption.ts
 * re-exports it.
 */

import crypto from 'crypto';
import { createLogger } from './safe-logger.js';

/** Encrypted data payload */
interface EncryptedPayload {
  encrypted: true;
  iv: string;
  authTag: string;
  data: string;
  /** tokenKeyId() of the key that sealed it (absent on envelopes written before kids). */
  kid?: string;
}

const log = createLogger({ module: 'Encryption' });

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
/**
 * Full 128-bit GCM tag. Pinned on both cipher and decipher: without
 * authTagLength, Node's decipher accepts any tag from 4 to 16 bytes, so a
 * truncated prefix of the real tag still verifies and forgery gets cheaper.
 */
const AUTH_TAG_BYTES = 16;

export type TokenKeySource = 'OAUTH_ENCRYPTION_KEY' | 'LOG_HASH_SECRET' | 'none';

/** Which env var supplies the token key, and its raw value. The one resolution every caller shares. */
export function resolveTokenKey(): { source: TokenKeySource; key: string } {
  if (process.env.OAUTH_ENCRYPTION_KEY) {
    return { source: 'OAUTH_ENCRYPTION_KEY', key: process.env.OAUTH_ENCRYPTION_KEY };
  }
  if (process.env.LOG_HASH_SECRET) {
    return { source: 'LOG_HASH_SECRET', key: process.env.LOG_HASH_SECRET };
  }
  return { source: 'none', key: '' };
}

/** Key id of a raw key: the first 8 hex of HMAC-SHA256(key, "ferni-token-kid"). */
export function keyIdOf(key: string): string {
  return crypto.createHmac('sha256', key).update('ferni-token-kid').digest('hex').slice(0, 8);
}

/**
 * Key id of the effective token key, or "none". Non-reversible, so safe to log:
 * two processes with the same kid seal and open each other's tokens.
 */
export function tokenKeyId(): string {
  const { key } = resolveTokenKey();
  return key === '' ? 'none' : keyIdOf(key);
}

/**
 * The keys that may open an envelope: OAUTH_ENCRYPTION_KEY (the sealing key
 * when set), then LOG_HASH_SECRET as read-only legacy. Every envelope written
 * before the dedicated key exists was sealed with LOG_HASH_SECRET, so it must
 * stay on the ring until those are re-sealed, or they would all stop opening.
 */
export function decryptionKeys(): Array<{ key: string; kid: string }> {
  const keys = [process.env.OAUTH_ENCRYPTION_KEY, process.env.LOG_HASH_SECRET].filter(
    (k): k is string => typeof k === 'string' && k !== ''
  );
  return [...new Set(keys)].map((key) => ({ key, kid: keyIdOf(key) }));
}

/**
 * Open an envelope with the keyring: the key its kid names, or each key in
 * order for an envelope written before kids. Null if none opens it.
 */
export function openEnvelope<T>(encryptedStr: string): { value: T; kid: string } | null {
  let parsed: Partial<EncryptedPayload>;
  try {
    parsed = JSON.parse(encryptedStr) as Partial<EncryptedPayload>;
  } catch {
    return null;
  }
  const { iv, authTag, data, kid } = parsed;
  if (parsed.encrypted !== true || typeof iv !== 'string' || typeof authTag !== 'string')
    return null;
  if (typeof data !== 'string') return null;
  const tag = Buffer.from(authTag, 'base64');
  if (tag.length !== AUTH_TAG_BYTES) return null;
  const ring = decryptionKeys();
  for (const candidate of typeof kid === 'string' ? ring.filter((k) => k.kid === kid) : ring) {
    try {
      const derived = crypto.createHash('sha256').update(candidate.key).digest();
      const decipher = crypto.createDecipheriv(
        ENCRYPTION_ALGORITHM,
        derived,
        Buffer.from(iv, 'base64'),
        { authTagLength: AUTH_TAG_BYTES }
      );
      decipher.setAuthTag(tag);
      const plain = decipher.update(data, 'base64', 'utf8') + decipher.final('utf8');
      return { value: JSON.parse(plain) as T, kid: candidate.kid };
    } catch {
      // Not this key: try the next one.
    }
  }
  return null;
}

/** Why a sealed envelope did not open: for a warning, never containing the key or the data. */
export function envelopeFailure(encryptedStr: string): { reason: string; envelopeKid?: string } {
  let parsed: Partial<EncryptedPayload>;
  try {
    parsed = JSON.parse(encryptedStr) as Partial<EncryptedPayload>;
  } catch {
    return { reason: 'malformed' };
  }
  const envelopeKid = typeof parsed.kid === 'string' ? parsed.kid : undefined;
  const ring = decryptionKeys();
  if (ring.length === 0) return { reason: 'no-key', envelopeKid };
  if (envelopeKid !== undefined && !ring.some((k) => k.kid === envelopeKid)) {
    return { reason: 'kid-mismatch', envelopeKid };
  }
  return { reason: 'decrypt-failed', envelopeKid };
}

/**
 * Get encryption key from environment
 * Derives 32-byte key using SHA-256
 *
 * SECURITY: In production, OAUTH_ENCRYPTION_KEY is required.
 * OAuth tokens will not be stored without encryption in production.
 */
function getEncryptionKey(): Buffer | null {
  const { key } = resolveTokenKey();
  const isProduction = process.env.NODE_ENV === 'production';

  if (!key) {
    if (isProduction) {
      log.error('SECURITY CRITICAL: OAUTH_ENCRYPTION_KEY must be set in production!');
      log.error(
        'OAuth tokens cannot be stored without encryption. Generate with: openssl rand -hex 32'
      );
      // In production, throw to prevent insecure token storage
      throw new Error('OAUTH_ENCRYPTION_KEY is required in production');
    }
    log.warn(
      'SECURITY: OAUTH_ENCRYPTION_KEY not set - tokens stored without encryption (dev only)'
    );
    return null;
  }

  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt sensitive data before storing
 */
export function encryptData<T>(data: T): string {
  const key = getEncryptionKey();

  if (!key) {
    // Fallback to plain JSON if no key (development mode warning already logged)
    return JSON.stringify(data);
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  });

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    encrypted: true,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    data: encrypted,
    kid: tokenKeyId(),
  };

  return JSON.stringify(payload);
}

/** An envelope, or something dressed as one: never handed back as plaintext. */
function looksLikeEnvelope(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  return (
    Boolean(p.encrypted) ||
    typeof p.kid === 'string' ||
    (typeof p.iv === 'string' && typeof p.authTag === 'string')
  );
}

/**
 * Decrypt stored data. Fails closed: an envelope that does not open (tampered,
 * wrong key, no key) is null, never the envelope itself. The one plaintext
 * form returned as-is is JSON written by encryptData with no key configured
 * (dev), the same "no-key encrypted string" the #2026 migration seals.
 */
export function decryptData<T>(encryptedStr: string): T | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encryptedStr);
  } catch {
    log.error('Failed to decrypt or parse token data');
    return null;
  }
  if (!looksLikeEnvelope(parsed)) return parsed as T;

  try {
    if (!getEncryptionKey()) {
      log.warn('Cannot decrypt - no encryption key configured');
      return null;
    }
  } catch {
    // Production with no key: getEncryptionKey already logged it.
    return null;
  }
  const opened = openEnvelope<T>(encryptedStr);
  if (!opened) {
    log.error('Failed to decrypt token data: no key on the ring opens this envelope');
    return null;
  }
  return opened.value;
}

/**
 * Check if data appears to be encrypted
 */
export function isEncrypted(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return parsed.encrypted === true && parsed.iv && parsed.authTag && parsed.data;
  } catch {
    return false;
  }
}
