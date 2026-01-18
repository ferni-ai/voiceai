/**
 * OAuth Token Store
 *
 * Firestore persistence for OAuth tokens with encryption.
 * Tokens are stored encrypted at rest.
 *
 * Document: /users/{userId}/oauth_tokens/{provider}
 *
 * @module services/integrations/oauth-token-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
} from '../../utils/firestore-utils.js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import type { OAuthTokens, ConnectionStatus } from './types.js';

const log = createLogger({ module: 'oauth-token-store' });

// ============================================================================
// TYPES
// ============================================================================

export interface StoredOAuthToken {
  provider: string;
  accessToken: string; // encrypted
  refreshToken?: string; // encrypted
  expiresAt: string; // ISO date
  tokenType: string;
  scope?: string;
  scopes: string[];
  status: ConnectionStatus;
  connectedAt: string;
  lastRefreshedAt?: string;
  lastUsedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface TokenStoreResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// ENCRYPTION
// ============================================================================

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Get encryption key from environment or generate one
 * In production, this should be a proper secret management solution
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.OAUTH_TOKEN_ENCRYPTION_KEY || 'default-development-key-do-not-use-in-production';
  const salt = process.env.OAUTH_TOKEN_ENCRYPTION_SALT || 'ferni-oauth-salt';
  return scryptSync(secret, salt, 32);
}

/**
 * Encrypt a string value
 */
function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string value
 */
function decrypt(encryptedText: string): string {
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted format');
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to decrypt token');
    throw new Error('Token decryption failed');
  }
}

// ============================================================================
// STORE OPERATIONS
// ============================================================================

const COLLECTION_PATH = 'oauth_tokens';

/**
 * Get document reference for a user's OAuth token
 */
function getDocRef(db: FirebaseFirestore.Firestore, userId: string, provider: string) {
  return db.collection('users').doc(userId).collection(COLLECTION_PATH).doc(provider);
}

/**
 * Save OAuth tokens for a user and provider
 */
export async function saveOAuthTokens(
  userId: string,
  provider: string,
  tokens: OAuthTokens,
  metadata?: Record<string, unknown>
): Promise<TokenStoreResult> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('oauth-token-store', 'saveOAuthTokens');
    log.warn({ userId, provider }, 'Firestore unavailable, tokens not persisted');
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    const docRef = getDocRef(db, userId, provider);

    // Encrypt sensitive tokens
    const storedToken: StoredOAuthToken = {
      provider,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : undefined,
      expiresAt: tokens.expiresAt.toISOString(),
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
      status: 'connected',
      connectedAt: new Date().toISOString(),
      lastRefreshedAt: new Date().toISOString(),
      metadata,
    };

    await docRef.set(cleanForFirestore(storedToken), { merge: true });
    log.info({ userId, provider }, 'OAuth tokens saved');

    return { success: true };
  } catch (error) {
    const errorMsg = String(error);
    log.error({ error: errorMsg, userId, provider }, 'Failed to save OAuth tokens');
    return { success: false, error: errorMsg };
  }
}

/**
 * Get OAuth tokens for a user and provider
 */
export async function getOAuthTokens(
  userId: string,
  provider: string
): Promise<OAuthTokens | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('oauth-token-store', 'getOAuthTokens');
    return null;
  }

  try {
    const docRef = getDocRef(db, userId, provider);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as StoredOAuthToken;
    if (!data || data.status !== 'connected') {
      return null;
    }

    // Decrypt tokens
    const tokens: OAuthTokens = {
      accessToken: decrypt(data.accessToken),
      refreshToken: data.refreshToken ? decrypt(data.refreshToken) : undefined,
      expiresAt: new Date(data.expiresAt),
      tokenType: data.tokenType,
      scope: data.scope,
    };

    // Update last used time in background
    docRef.update({ lastUsedAt: new Date().toISOString() }).catch((err) => {
      log.debug({ error: String(err), userId, provider }, 'Failed to update token lastUsedAt (non-critical)');
    });

    return tokens;
  } catch (error) {
    log.error({ error: String(error), userId, provider }, 'Failed to get OAuth tokens');
    return null;
  }
}

/**
 * Update OAuth tokens after refresh
 */
export async function updateOAuthTokens(
  userId: string,
  provider: string,
  tokens: OAuthTokens
): Promise<TokenStoreResult> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('oauth-token-store', 'updateOAuthTokens');
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    const docRef = getDocRef(db, userId, provider);

    const updates: Partial<StoredOAuthToken> = {
      accessToken: encrypt(tokens.accessToken),
      expiresAt: tokens.expiresAt.toISOString(),
      lastRefreshedAt: new Date().toISOString(),
      status: 'connected',
    };

    // Only update refresh token if a new one was provided
    if (tokens.refreshToken) {
      updates.refreshToken = encrypt(tokens.refreshToken);
    }

    await docRef.update(cleanForFirestore(updates));
    log.debug({ userId, provider }, 'OAuth tokens updated after refresh');

    return { success: true };
  } catch (error) {
    const errorMsg = String(error);
    log.error({ error: errorMsg, userId, provider }, 'Failed to update OAuth tokens');
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete OAuth tokens (disconnect integration)
 */
export async function deleteOAuthTokens(
  userId: string,
  provider: string
): Promise<TokenStoreResult> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('oauth-token-store', 'deleteOAuthTokens');
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    const docRef = getDocRef(db, userId, provider);
    await docRef.delete();

    log.info({ userId, provider }, 'OAuth tokens deleted');
    return { success: true };
  } catch (error) {
    const errorMsg = String(error);
    log.error({ error: errorMsg, userId, provider }, 'Failed to delete OAuth tokens');
    return { success: false, error: errorMsg };
  }
}

/**
 * Get connection status for a provider
 */
export async function getConnectionStatus(
  userId: string,
  provider: string
): Promise<{
  connected: boolean;
  status: ConnectionStatus;
  connectedAt?: string;
  expiresAt?: string;
  scopes?: string[];
}> {
  const db = getFirestoreDb();
  if (!db) {
    return { connected: false, status: 'disconnected' };
  }

  try {
    const docRef = getDocRef(db, userId, provider);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { connected: false, status: 'disconnected' };
    }

    const data = doc.data() as StoredOAuthToken;

    // Check if token is expired
    const expiresAt = new Date(data.expiresAt);
    const isExpired = expiresAt <= new Date();

    if (isExpired && data.status === 'connected') {
      // Token expired, but refresh might work
      return {
        connected: true,
        status: 'expired',
        connectedAt: data.connectedAt,
        expiresAt: data.expiresAt,
        scopes: data.scopes,
      };
    }

    return {
      connected: data.status === 'connected',
      status: data.status,
      connectedAt: data.connectedAt,
      expiresAt: data.expiresAt,
      scopes: data.scopes,
    };
  } catch (error) {
    log.error({ error: String(error), userId, provider }, 'Failed to get connection status');
    return { connected: false, status: 'error' };
  }
}

/**
 * Get all connected integrations for a user
 */
export async function getConnectedIntegrations(
  userId: string
): Promise<Array<{
  provider: string;
  status: ConnectionStatus;
  connectedAt: string;
  scopes: string[];
}>> {
  const db = getFirestoreDb();
  if (!db) {
    return [];
  }

  try {
    const collectionRef = db.collection('users').doc(userId).collection(COLLECTION_PATH);
    const snapshot = await collectionRef.where('status', '==', 'connected').get();

    const connections: Array<{
      provider: string;
      status: ConnectionStatus;
      connectedAt: string;
      scopes: string[];
    }> = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as StoredOAuthToken;
      connections.push({
        provider: data.provider,
        status: data.status,
        connectedAt: data.connectedAt,
        scopes: data.scopes || [],
      });
    }

    return connections;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get connected integrations');
    return [];
  }
}

/**
 * Mark a connection as having an error
 */
export async function markConnectionError(
  userId: string,
  provider: string,
  error: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const docRef = getDocRef(db, userId, provider);
    await docRef.update({
      status: 'error' as ConnectionStatus,
      error,
    });
  } catch (err) {
    log.error({ error: String(err), userId, provider }, 'Failed to mark connection error');
  }
}

/**
 * Check if tokens need refresh (expires within buffer period)
 */
export async function needsRefresh(
  userId: string,
  provider: string,
  bufferMinutes: number = 5
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const docRef = getDocRef(db, userId, provider);
    const doc = await docRef.get();

    if (!doc.exists) return false;

    const data = doc.data() as StoredOAuthToken;
    const expiresAt = new Date(data.expiresAt);
    const bufferMs = bufferMinutes * 60 * 1000;

    return expiresAt.getTime() - Date.now() < bufferMs;
  } catch (error) {
    return false;
  }
}
