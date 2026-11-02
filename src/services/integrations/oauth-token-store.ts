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
import { openTokens, resealStale, sealTokensForMerge } from '../../utils/token-at-rest.js';
import {
  assertTokenSealingAvailable,
  TokenSealingUnavailableError,
} from '../../utils/token-encryption.js';
import type { OAuthTokens, ConnectionStatus } from './types.js';

const log = createLogger({ module: 'oauth-token-store' });

// ============================================================================
// TYPES
// ============================================================================

export interface StoredOAuthToken {
  provider: string;
  /** Sealed envelope of { accessToken, refreshToken } (utils/token-at-rest). */
  encrypted: string;
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
  /** Set when the write was refused because tokens could not be sealed. */
  code?: 'sealing_unavailable';
}

// ============================================================================
// SEALING
// ============================================================================

/**
 * The two secrets, sealed together as one `encrypted` envelope through the
 * repo's token sealing (utils/token-at-rest: TOKEN_SEALING_KEY, then
 * OAUTH_ENCRYPTION_KEY, then LOG_HASH_SECRET). With no key, in any
 * environment, a save is refused (TokenSealingUnavailableError) and nothing
 * is written: never plaintext, never a key from the repo.
 *
 * Records in the old per-field format (accessToken/refreshToken as
 * iv:tag:hex, under a store-local key that is gone) are not opened: prod held
 * no docs in this store when the format changed (2026-10-30 audit), so there
 * is nothing to migrate and no old key is kept. Such a record reads as not
 * connected, and the person reconnects.
 */
interface SealedSecrets {
  accessToken: string;
  refreshToken?: string;
}

/** True when the failure is "no key to seal with" rather than a Firestore error. */
function isSealingUnavailable(error: unknown): error is TokenSealingUnavailableError {
  return error instanceof TokenSealingUnavailableError;
}

const SEALING_REFUSED = 'Token sealing is not configured; tokens were not stored';

const FAILED_PRECONDITION = 9;
const NOT_FOUND = 5;

/** With TOKEN_SEALING_KEY set, move an envelope sealed under an older key to it (best effort). */
function resealOnRead(
  docRef: FirebaseFirestore.DocumentReference,
  doc: FirebaseFirestore.DocumentSnapshot,
  stored: string,
  secrets: SealedSecrets
): void {
  void resealStale({
    store: COLLECTION_PATH,
    stored,
    value: secrets,
    swap: async (encrypted) => {
      try {
        await docRef.update({ encrypted }, { lastUpdateTime: doc.updateTime });
        return 'updated';
      } catch (err) {
        const code = (err as { code?: unknown }).code;
        if (code === FAILED_PRECONDITION) return 'changed';
        if (code === NOT_FOUND) return 'missing';
        throw err;
      }
    },
  });
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
  let sealed: Record<string, unknown>;
  try {
    assertTokenSealingAvailable();
    sealed = sealTokensForMerge<SealedSecrets>({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    if (!isSealingUnavailable(error)) throw error;
    log.error({ userId, provider }, 'OAuth tokens not saved: token sealing unavailable');
    return { success: false, error: SEALING_REFUSED, code: 'sealing_unavailable' };
  }

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('oauth-token-store', 'saveOAuthTokens');
    log.warn({ userId, provider }, 'Firestore unavailable, tokens not persisted');
    return { success: false, error: 'Firestore unavailable' };
  }

  try {
    const docRef = getDocRef(db, userId, provider);
    const now = new Date().toISOString();
    const record = {
      provider,
      expiresAt: tokens.expiresAt.toISOString(),
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
      status: 'connected' as ConnectionStatus,
      connectedAt: now,
      lastRefreshedAt: now,
      metadata,
    };

    // The sealed fields go on after cleaning: they carry FieldValue deletes.
    await docRef.set({ ...cleanForFirestore(record), ...sealed }, { merge: true });
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

    const secrets = openTokens<SealedSecrets>({ encrypted: data.encrypted }, COLLECTION_PATH);
    if (!secrets?.accessToken) {
      log.warn(
        { userId, provider },
        'OAuth record has no sealed tokens that open; reconnect needed'
      );
      return null;
    }
    resealOnRead(docRef, doc, data.encrypted, secrets);

    const tokens: OAuthTokens = {
      accessToken: secrets.accessToken,
      refreshToken: secrets.refreshToken,
      expiresAt: new Date(data.expiresAt),
      tokenType: data.tokenType,
      scope: data.scope,
    };

    // Update last used time in background
    docRef.update({ lastUsedAt: new Date().toISOString() }).catch((err) => {
      log.debug(
        { error: String(err), userId, provider },
        'Failed to update token lastUsedAt (non-critical)'
      );
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
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, error: 'No stored tokens to update' };

    // A refresh often omits the refresh token: keep the stored one.
    const stored = doc.data() as Partial<StoredOAuthToken>;
    const previous = stored.encrypted
      ? openTokens<SealedSecrets>({ encrypted: stored.encrypted }, COLLECTION_PATH)
      : null;
    assertTokenSealingAvailable();
    const sealed = sealTokensForMerge<SealedSecrets>({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? previous?.refreshToken,
    });

    // Precondition: a disconnect or another refresh since the read wins.
    await docRef.update(
      {
        ...cleanForFirestore({
          expiresAt: tokens.expiresAt.toISOString(),
          lastRefreshedAt: new Date().toISOString(),
          status: 'connected' as ConnectionStatus,
        }),
        ...sealed,
      },
      { lastUpdateTime: doc.updateTime }
    );
    log.debug({ userId, provider }, 'OAuth tokens updated after refresh');

    return { success: true };
  } catch (error) {
    if (isSealingUnavailable(error)) {
      log.error(
        { userId, provider },
        'Refreshed OAuth tokens not saved: token sealing unavailable'
      );
      return { success: false, error: SEALING_REFUSED, code: 'sealing_unavailable' };
    }
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
export async function getConnectedIntegrations(userId: string): Promise<
  Array<{
    provider: string;
    status: ConnectionStatus;
    connectedAt: string;
    scopes: string[];
  }>
> {
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
  bufferMinutes = 5
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
