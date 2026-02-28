/**
 * Privacy & Cryptographic Utilities
 *
 * Privacy-preserving functions for handling sensitive user data.
 * Designed to be "better than human" at protecting user information.
 *
 * Core Principles:
 * 1. Minimize data - Only store what's absolutely needed
 * 2. Hash identifiers - Phone numbers, emails are stored as hashes
 * 3. Encrypt at rest - Sensitive fields are encrypted
 * 4. Audit access - All sensitive data access is logged
 *
 * PERSISTENCE: Token vault is persisted to Firestore for durability.
 *
 * @module PrivacyCrypto
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'crypto';
import admin from 'firebase-admin';
import { promisify } from 'util';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();
const scryptAsync = promisify(scrypt);

// ============================================================================
// FIRESTORE SETUP FOR TOKEN VAULT
// ============================================================================

const TOKEN_VAULT_COLLECTION = 'token_vault';

function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Encryption algorithm */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/** Get encryption key from environment (with fallback for dev) */
function getEncryptionKey(): string {
  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!key && process.env.NODE_ENV === 'production') {
    throw new Error('DATA_ENCRYPTION_KEY must be set in production');
  }
  return key || 'ferni-dev-encryption-key-do-not-use-in-prod';
}

/** Get HMAC secret for hashing */
function getHashSecret(): string {
  const secret = process.env.IDENTIFIER_HASH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('IDENTIFIER_HASH_SECRET must be set in production');
  }
  return secret || 'ferni-dev-hash-secret-do-not-use-in-prod';
}

// ============================================================================
// PHONE NUMBER HASHING
// ============================================================================

/**
 * Hash a phone number for storage and lookup.
 *
 * Uses HMAC-SHA256 with a secret key to create a one-way hash
 * that can still be used for lookups (deterministic).
 *
 * @param phoneNumber - E.164 format phone number (+15551234567)
 * @returns Hashed phone number (hex string)
 *
 * @example
 * const hash = hashPhoneNumber('+15551234567');
 * // Returns: 'ph_a1b2c3d4e5f6...' (64 char hex)
 */
export function hashPhoneNumber(phoneNumber: string): string {
  // Normalize to E.164 format first
  const normalized = normalizePhoneNumber(phoneNumber);

  // Create HMAC-SHA256 hash
  const hash = createHmac('sha256', getHashSecret()).update(`phone:${normalized}`).digest('hex');

  // Prefix with 'ph_' to identify as phone hash
  return `ph_${hash}`;
}

/**
 * Normalize phone number to E.164 format
 * Handles common formats: +1 (555) 123-4567, 555-123-4567, etc.
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  const normalized = phone.replace(/[^\d+]/g, '');

  // If starts with +, it's already international
  if (normalized.startsWith('+')) {
    return normalized;
  }

  // Handle US numbers (default)
  if (normalized.length === 11 && normalized.startsWith('1')) {
    return `+${normalized}`;
  }

  if (normalized.length === 10) {
    return `+1${normalized}`;
  }

  // For other formats, just add + prefix if missing
  return `+${normalized}`;
}

/**
 * Verify a phone number matches a stored hash
 *
 * @param phoneNumber - Plain phone number to check
 * @param storedHash - Previously hashed phone number
 * @returns true if phone matches hash
 */
export function verifyPhoneHash(phoneNumber: string, storedHash: string): boolean {
  const computed = hashPhoneNumber(phoneNumber);

  // Timing-safe comparison to prevent timing attacks
  const a = Buffer.from(computed);
  const b = Buffer.from(storedHash);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

// ============================================================================
// EMAIL HASHING
// ============================================================================

/**
 * Hash an email address for storage
 *
 * @param email - Email address
 * @returns Hashed email (hex string)
 */
export function hashEmail(email: string): string {
  // Normalize email (lowercase, trim)
  const normalized = email.toLowerCase().trim();

  const hash = createHmac('sha256', getHashSecret()).update(`email:${normalized}`).digest('hex');

  return `em_${hash}`;
}

/**
 * Verify an email matches a stored hash
 */
export function verifyEmailHash(email: string, storedHash: string): boolean {
  const computed = hashEmail(email);

  const a = Buffer.from(computed);
  const b = Buffer.from(storedHash);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

// ============================================================================
// SYMMETRIC ENCRYPTION (for voice sketches, sensitive fields)
// ============================================================================

/**
 * Derive an encryption key from the master key and a salt
 */
async function deriveKey(salt: Buffer): Promise<Buffer> {
  const masterKey = getEncryptionKey();
  return (await scryptAsync(masterKey, salt, KEY_LENGTH)) as Buffer;
}

/**
 * Encrypt sensitive data
 *
 * Uses AES-256-GCM with a random IV and derived key.
 * Output format: base64(salt + iv + authTag + ciphertext)
 *
 * @param plaintext - Data to encrypt (string or JSON-serializable object)
 * @returns Encrypted data as base64 string
 */
export async function encryptSensitive(
  plaintext: string | Record<string, unknown>
): Promise<string> {
  const data = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

  // Generate random salt and IV
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  // Derive key
  const key = await deriveKey(salt);

  // Encrypt
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Combine: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);

  return `enc_${combined.toString('base64')}`;
}

/**
 * Decrypt sensitive data
 *
 * @param encryptedData - Data encrypted with encryptSensitive()
 * @returns Decrypted string (or parsed JSON if it was an object)
 */
export async function decryptSensitive<T = string>(encryptedData: string): Promise<T> {
  // Remove prefix
  if (!encryptedData.startsWith('enc_')) {
    throw new Error('Invalid encrypted data format');
  }

  const combined = Buffer.from(encryptedData.slice(4), 'base64');

  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  // Derive key
  const key = await deriveKey(salt);

  // Decrypt
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

  // Try to parse as JSON
  try {
    return JSON.parse(decrypted) as T;
  } catch {
    return decrypted as T;
  }
}

// ============================================================================
// VOICE SKETCH ENCRYPTION
// ============================================================================

/**
 * Encrypt a voice sketch for storage
 * Voice sketches are biometric-adjacent data and should be encrypted
 */
export async function encryptVoiceSketch(voiceSketch: {
  pitchMean: number;
  pitchMin: number;
  pitchMax: number;
  pitchStdDev: number;
  speakingRateMean: number;
  pauseFrequency: number;
  avgPauseDuration: number;
  spectralCentroidMean: number;
  spectralCentroidStdDev: number;
  spectralRolloffMean: number;
  energyMean: number;
  energyStdDev: number;
  samplesAnalyzed: number;
  totalDurationMs: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}): Promise<string> {
  return encryptSensitive(voiceSketch);
}

/**
 * Decrypt a voice sketch for use
 */
export async function decryptVoiceSketch(encryptedSketch: string): Promise<{
  pitchMean: number;
  pitchMin: number;
  pitchMax: number;
  pitchStdDev: number;
  speakingRateMean: number;
  pauseFrequency: number;
  avgPauseDuration: number;
  spectralCentroidMean: number;
  spectralCentroidStdDev: number;
  spectralRolloffMean: number;
  energyMean: number;
  energyStdDev: number;
  samplesAnalyzed: number;
  totalDurationMs: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}> {
  const decrypted = await decryptSensitive<Record<string, unknown>>(encryptedSketch);

  // Restore Date objects
  return {
    ...decrypted,
    createdAt: new Date(decrypted.createdAt as string),
    updatedAt: new Date(decrypted.updatedAt as string),
  } as unknown as Awaited<ReturnType<typeof decryptVoiceSketch>>;
}

// ============================================================================
// TOKENIZATION (for reversible but protected storage)
// ============================================================================

/**
 * Token vault for mapping tokens to values
 * Uses Firestore for persistence with in-memory cache
 */
const tokenVaultCache = new Map<string, string>();
const reverseTokenCache = new Map<string, string>(); // value -> token for dedup

/**
 * Save token to Firestore
 */
async function saveTokenToFirestore(token: string, value: string, category: string): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    await db
      .collection(TOKEN_VAULT_COLLECTION)
      .doc(token)
      .set(
        removeUndefined({
          value,
          category,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      );
  } catch (error) {
    log.error({ error, token }, 'Failed to save token to Firestore');
  }
}

/**
 * Load token from Firestore
 */
async function loadTokenFromFirestore(token: string): Promise<string | null> {
  const db = getFirestore();
  if (!db) return null;

  try {
    const doc = await db.collection(TOKEN_VAULT_COLLECTION).doc(token).get();
    if (doc.exists) {
      const data = doc.data();
      return data?.value || null;
    }
  } catch (error) {
    log.error({ error, token }, 'Failed to load token from Firestore');
  }
  return null;
}

/**
 * Check if value already has a token in Firestore
 */
async function findExistingToken(value: string, category: string): Promise<string | null> {
  const db = getFirestore();
  if (!db) return null;

  try {
    const snapshot = await db
      .collection(TOKEN_VAULT_COLLECTION)
      .where('value', '==', value)
      .where('category', '==', category)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }
  } catch (error) {
    log.error({ error }, 'Failed to find existing token');
  }
  return null;
}

/**
 * Tokenize a sensitive value
 * Returns a random token that can be used to retrieve the original value
 *
 * @param value - Sensitive value to tokenize
 * @param category - Category for the token (e.g., 'phone', 'email')
 * @returns Token that maps to the value
 */
export function tokenize(value: string, category: string): string {
  // Check cache first
  const cacheKey = `${category}:${value}`;
  if (reverseTokenCache.has(cacheKey)) {
    return reverseTokenCache.get(cacheKey)!;
  }

  // Create new token
  const token = `tok_${category}_${randomBytes(16).toString('hex')}`;
  tokenVaultCache.set(token, value);
  reverseTokenCache.set(cacheKey, token);

  // Persist to Firestore (fire-and-forget, check for existing)
  void (async () => {
    const existingToken = await findExistingToken(value, category);
    if (existingToken) {
      // Use existing token instead
      tokenVaultCache.set(existingToken, value);
      reverseTokenCache.set(cacheKey, existingToken);
    } else {
      await saveTokenToFirestore(token, value, category);
    }
  })();

  return token;
}

/**
 * Tokenize a sensitive value (async version that checks Firestore first)
 */
export async function tokenizeAsync(value: string, category: string): Promise<string> {
  // Check cache first
  const cacheKey = `${category}:${value}`;
  if (reverseTokenCache.has(cacheKey)) {
    return reverseTokenCache.get(cacheKey)!;
  }

  // Check Firestore for existing token
  const existingToken = await findExistingToken(value, category);
  if (existingToken) {
    tokenVaultCache.set(existingToken, value);
    reverseTokenCache.set(cacheKey, existingToken);
    return existingToken;
  }

  // Create new token
  const token = `tok_${category}_${randomBytes(16).toString('hex')}`;
  tokenVaultCache.set(token, value);
  reverseTokenCache.set(cacheKey, token);

  // Persist to Firestore
  await saveTokenToFirestore(token, value, category);

  return token;
}

/**
 * Detokenize to get original value (sync - from cache)
 */
export function detokenize(token: string): string | null {
  return tokenVaultCache.get(token) || null;
}

/**
 * Detokenize to get original value (async - checks Firestore)
 */
export async function detokenizeAsync(token: string): Promise<string | null> {
  // Check cache first
  if (tokenVaultCache.has(token)) {
    return tokenVaultCache.get(token)!;
  }

  // Load from Firestore
  const value = await loadTokenFromFirestore(token);
  if (value) {
    tokenVaultCache.set(token, value);
    return value;
  }

  return null;
}

// ============================================================================
// DATA MINIMIZATION HELPERS
// ============================================================================

/**
 * Strip PII from an object for logging
 */
export function stripPII<T extends Record<string, unknown>>(
  obj: T,
  fieldsToStrip: string[] = [
    'phone',
    'email',
    'name',
    'address',
    'ssn',
    'password',
    'token',
    'voiceSketch',
  ]
): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (fieldsToStrip.includes(key)) {
      (result as Record<string, unknown>)[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = stripPII(
        value as Record<string, unknown>,
        fieldsToStrip
      );
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

/**
 * Mask a phone number for display
 * +15551234567 -> +1 (***) ***-4567
 */
export function maskPhoneNumber(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.length < 4) {
    return '***';
  }

  const lastFour = normalized.slice(-4);
  const countryCode = normalized.startsWith('+1') ? '+1' : normalized.substring(0, 3);

  return `${countryCode} (***) ***-${lastFour}`;
}

/**
 * Mask an email for display
 * user@example.com -> u***@e***.com
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) return '***@***';

  const maskedLocal = localPart.length > 1 ? `${localPart[0]}***` : '***';

  const domainParts = domain.split('.');
  const maskedDomain =
    domainParts.length > 1
      ? `${domainParts[0][0]}***.${domainParts[domainParts.length - 1]}`
      : '***';

  return `${maskedLocal}@${maskedDomain}`;
}

// ============================================================================
// SECURE RANDOM GENERATION
// ============================================================================

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a URL-safe random string
 */
export function generateUrlSafeToken(length = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Generate a short, human-readable code (e.g., for verification)
 */
export function generateVerificationCode(length = 6): string {
  const chars = '0123456789';
  const bytes = randomBytes(length);
  let code = '';

  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }

  return code;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Phone
  hashPhoneNumber,
  verifyPhoneHash,
  maskPhoneNumber,
  // Email
  hashEmail,
  verifyEmailHash,
  maskEmail,
  // Encryption
  encryptSensitive,
  decryptSensitive,
  encryptVoiceSketch,
  decryptVoiceSketch,
  // Tokenization
  tokenize,
  detokenize,
  // Utilities
  stripPII,
  generateSecureToken,
  generateUrlSafeToken,
  generateVerificationCode,
};
