/**
 * Calendar Credential Encryption
 *
 * Provides encryption/decryption for sensitive calendar credentials
 * like Apple app-specific passwords and OAuth tokens.
 *
 * Uses AES-256-GCM for authenticated encryption.
 *
 * @module calendar/utils/encryption
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// CONFIGURATION
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment or generate deterministic fallback
 * In production, CALENDAR_ENCRYPTION_KEY should be set
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.CALENDAR_ENCRYPTION_KEY;

  if (envKey) {
    // Use provided key (should be 32 bytes hex encoded = 64 chars)
    if (envKey.length === 64) {
      return Buffer.from(envKey, 'hex');
    }
    // Hash it to get consistent 32 bytes
    return scryptSync(envKey, 'ferni-calendar-salt', KEY_LENGTH);
  }

  // Fallback for development - NOT SECURE FOR PRODUCTION
  if (process.env.NODE_ENV === 'development') {
    log.warn('Using development encryption key - set CALENDAR_ENCRYPTION_KEY in production');
    return scryptSync('dev-calendar-key', 'ferni-dev-salt', KEY_LENGTH);
  }

  // In production without key, use project-based derivation
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'ferni';
  return scryptSync(`calendar-${projectId}`, 'ferni-prod-salt', KEY_LENGTH);
}

// ============================================================================
// ENCRYPTION/DECRYPTION
// ============================================================================

export interface EncryptedData {
  /** Encrypted content (base64) */
  encrypted: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Authentication tag (base64) */
  tag: string;
  /** Version for future algorithm changes */
  version: number;
}

/**
 * Encrypt a string value
 */
export function encrypt(plaintext: string): EncryptedData {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      version: 1,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Encryption failed');
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt an encrypted value
 */
export function decrypt(data: EncryptedData): string {
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(data.iv, 'base64');
    const tag = Buffer.from(data.tag, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    log.error({ error: String(error) }, 'Decryption failed');
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Check if a value is encrypted
 */
export function isEncrypted(value: unknown): value is EncryptedData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.encrypted === 'string' &&
    typeof data.iv === 'string' &&
    typeof data.tag === 'string' &&
    typeof data.version === 'number'
  );
}

/**
 * Encrypt an object's sensitive fields
 */
export function encryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };

  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      result[field] = encrypt(value) as T[keyof T];
    }
  }

  return result;
}

/**
 * Decrypt an object's encrypted fields
 */
export function decryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };

  for (const field of fields) {
    const value = result[field];
    if (isEncrypted(value)) {
      result[field] = decrypt(value) as T[keyof T];
    }
  }

  return result;
}

// ============================================================================
// CREDENTIAL-SPECIFIC HELPERS
// ============================================================================

export interface EncryptedAppleCredentials {
  appleId: string; // Not encrypted (used as identifier)
  appSpecificPassword: EncryptedData;
  principalUrl?: string;
  calendars?: Array<{ url: string; displayName: string; ctag?: string }>;
  lastValidated?: string;
}

/**
 * Encrypt Apple credentials before storage
 */
export function encryptAppleCredentials(credentials: {
  appleId: string;
  appSpecificPassword: string;
  principalUrl?: string;
  calendars?: Array<{ url: string; displayName: string; ctag?: string }>;
  lastValidated?: string;
}): EncryptedAppleCredentials {
  return {
    ...credentials,
    appSpecificPassword: encrypt(credentials.appSpecificPassword),
  };
}

/**
 * Decrypt Apple credentials after retrieval
 */
export function decryptAppleCredentials(encrypted: EncryptedAppleCredentials): {
  appleId: string;
  appSpecificPassword: string;
  principalUrl?: string;
  calendars?: Array<{ url: string; displayName: string; ctag?: string }>;
  lastValidated?: string;
} {
  return {
    ...encrypted,
    appSpecificPassword: decrypt(encrypted.appSpecificPassword),
  };
}

export interface EncryptedOAuthTokens {
  accessToken: EncryptedData;
  refreshToken: EncryptedData;
  expiresAt: number;
  email?: string;
  displayName?: string;
}

/**
 * Encrypt OAuth tokens before storage
 */
export function encryptOAuthTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  displayName?: string;
}): EncryptedOAuthTokens {
  return {
    ...tokens,
    accessToken: encrypt(tokens.accessToken),
    refreshToken: encrypt(tokens.refreshToken),
  };
}

/**
 * Decrypt OAuth tokens after retrieval
 */
export function decryptOAuthTokens(encrypted: EncryptedOAuthTokens): {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  displayName?: string;
} {
  return {
    ...encrypted,
    accessToken: decrypt(encrypted.accessToken),
    refreshToken: decrypt(encrypted.refreshToken),
  };
}

export default {
  encrypt,
  decrypt,
  isEncrypted,
  encryptFields,
  decryptFields,
  encryptAppleCredentials,
  decryptAppleCredentials,
  encryptOAuthTokens,
  decryptOAuthTokens,
};

