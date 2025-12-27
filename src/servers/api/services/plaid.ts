/**
 * Plaid Token Management
 *
 * Stores and retrieves Plaid access tokens for users.
 *
 * STORAGE: Uses Firestore for persistence (Cloud Run compatible).
 * Falls back to in-memory storage if Firestore is unavailable.
 */

import { createPersistenceStore } from '../../../services/persistence/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'Plaid' });

/**
 * Plaid token data
 */
export interface PlaidTokenData {
  access_token: string;
  item_id: string;
  institution: {
    name?: string;
    institution_id?: string;
  };
  linked_at: string;
}

// Configuration
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';
const PLAID_BASE_URL =
  {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
  }[PLAID_ENV] || 'https://sandbox.plaid.com';

// Firestore-backed persistence store for Plaid tokens
// Stores under bogle_users/{userId}/plaid_tokens/data
const tokenStore = createPersistenceStore<PlaidTokenData>({
  collection: 'plaid_tokens',
  documentId: 'data',
  useRootCollection: false, // Per-user storage
  syncIntervalMs: 2000,
});

// In-memory cache for fast access
const plaidAccessTokens = new Map<string, PlaidTokenData>();

/**
 * Check if Plaid is configured
 */
export function isConfigured(): boolean {
  return !!(PLAID_CLIENT_ID && PLAID_SECRET);
}

/**
 * Get Plaid configuration
 */
export function getConfig(): { clientId: string; secret: string; baseUrl: string; env: string } {
  return {
    clientId: PLAID_CLIENT_ID,
    secret: PLAID_SECRET,
    baseUrl: PLAID_BASE_URL,
    env: PLAID_ENV,
  };
}

/**
 * Load tokens for a user from Firestore
 */
export async function loadTokensForUser(userId: string): Promise<PlaidTokenData | null> {
  // Check in-memory cache first
  const cached = plaidAccessTokens.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const data = await tokenStore.get(userId);
    if (data) {
      plaidAccessTokens.set(userId, data);
      log.info({ userId: userId.substring(0, 8) }, 'Loaded Plaid token from Firestore');
      return data;
    }
  } catch (err) {
    log.warn(
      { error: (err as Error).message, userId: userId.substring(0, 8) },
      'Could not load Plaid token'
    );
  }
  return null;
}

/**
 * Store a Plaid access token for a user
 */
export async function storeToken(
  userId: string,
  accessToken: string,
  itemId: string,
  institution?: { name?: string; institution_id?: string }
): Promise<void> {
  const data: PlaidTokenData = {
    access_token: accessToken,
    item_id: itemId,
    institution: institution || {},
    linked_at: new Date().toISOString(),
  };

  // Update in-memory cache
  plaidAccessTokens.set(userId, data);

  // Persist to Firestore
  try {
    await tokenStore.setImmediate(userId, data);
    log.info(
      { userId: userId.substring(0, 8), institution: institution?.name || 'Unknown' },
      'Stored Plaid token'
    );
  } catch (err) {
    log.error(
      { error: (err as Error).message, userId: userId.substring(0, 8) },
      'Failed to store Plaid token'
    );
  }
}

/**
 * Get Plaid access token for a user
 */
export async function getToken(userId: string): Promise<PlaidTokenData | null> {
  // Check in-memory cache first
  const cached = plaidAccessTokens.get(userId);
  if (cached) {
    return cached;
  }

  // Load from Firestore
  return loadTokensForUser(userId);
}

/**
 * Remove Plaid token for a user
 */
export async function removeToken(userId: string): Promise<void> {
  // Remove from in-memory cache
  plaidAccessTokens.delete(userId);

  // Remove from Firestore
  try {
    await tokenStore.delete(userId);
    log.info({ userId: userId.substring(0, 8) }, 'Removed Plaid token');
  } catch (err) {
    log.error(
      { error: (err as Error).message, userId: userId.substring(0, 8) },
      'Failed to remove Plaid token'
    );
  }
}

/**
 * Exchange public token for access token
 */
export async function exchangePublicToken(
  publicToken: string
): Promise<{ accessToken: string; itemId: string } | null> {
  if (!isConfigured()) {
    return null;
  }

  try {
    const response = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token: publicToken,
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error_message?: string };
      log.error({ error: error.error_message }, 'Plaid exchange error');
      return null;
    }

    const data = (await response.json()) as { access_token: string; item_id: string };
    return {
      accessToken: data.access_token,
      itemId: data.item_id,
    };
  } catch (err) {
    log.error({ error: (err as Error).message }, 'Plaid exchange error');
    return null;
  }
}

/**
 * Shutdown Plaid service (flush tokens and cleanup)
 */
export async function shutdown(): Promise<void> {
  await tokenStore.shutdown();
  plaidAccessTokens.clear();
  log.info('Plaid service shutdown complete');
}
