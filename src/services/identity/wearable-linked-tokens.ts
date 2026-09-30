/**
 * Wearables OAuth Management
 *
 * Handles OAuth flows for wearable device integrations:
 * - Fitbit (Web OAuth 2.0)
 * - Oura (Web OAuth 2.0)
 * - Garmin (Web OAuth 2.0)
 * - Whoop (Web OAuth 2.0)
 *
 * Note: Apple HealthKit requires native iOS integration via deep links,
 * handled separately in the iOS app.
 *
 * STORAGE: Uses Firestore for persistence (Cloud Run compatible).
 * Tokens are encrypted before storage for security, per user under
 * bogle_users/{userId}/wearable_{provider}_tokens/data.
 *
 * This is the authoritative wearable token store (the settings UI links
 * through /wearables/{provider}/login). The older Oura-only flow
 * (/api/oura/auth, root `oura_tokens`) is read as a fallback by oura-auth.
 */

import type { WearableProvider } from '../wearable-integration/types.js';
import { encryptData, decryptData, type OAuthTokens } from '../../utils/token-encryption.js';
import { createPersistenceStore } from '../persistence/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { PROVIDER_CONFIGS, getPKCEVerifier, isProviderConfigured } from './wearable-oauth-config.js';

export {
  isProviderConfigured,
  getProviderConfig,
  getConfiguredProviders,
  buildAuthUrl,
  getPKCEVerifier,
  type ProviderConfig,
} from './wearable-oauth-config.js';

const log = createLogger({ module: 'WearablesOAuth' });

// ============================================================================
// TOKEN RESPONSE TYPES
// ============================================================================

interface WearableTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

interface EncryptedTokenData {
  encrypted: string;
  provider: WearableProvider;
  updated_at: number;
}

// ============================================================================
// PERSISTENCE STORES (per provider)
// ============================================================================

const tokenStores = new Map<
  WearableProvider,
  ReturnType<typeof createPersistenceStore<EncryptedTokenData>>
>();

function getTokenStore(provider: WearableProvider) {
  if (!tokenStores.has(provider)) {
    tokenStores.set(
      provider,
      createPersistenceStore<EncryptedTokenData>({
        collection: `wearable_${provider}_tokens`,
        documentId: 'data',
        useRootCollection: false, // Per-user storage
        syncIntervalMs: 2000,
      })
    );
  }
  return tokenStores.get(provider)!;
}

// In-memory cache for decrypted tokens (fast access)
const tokenCache = new Map<string, OAuthTokens>(); // key: `${provider}:${userId}`

function cacheKey(provider: WearableProvider, userId: string): string {
  return `${provider}:${userId}`;
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Get tokens for a user from a specific provider
 */
export async function getTokens(
  provider: WearableProvider,
  userId: string
): Promise<OAuthTokens | null> {
  if (provider === 'apple_health') {
    // Apple HealthKit tokens are managed natively on iOS
    return null;
  }

  const key = cacheKey(provider, userId);

  // Check cache first
  const cached = tokenCache.get(key);
  if (cached) {
    return cached;
  }

  try {
    const store = getTokenStore(provider);
    const data = await store.get(userId);

    if (data?.encrypted) {
      const decrypted = decryptData<OAuthTokens>(data.encrypted);
      if (decrypted) {
        tokenCache.set(key, decrypted);
        return decrypted;
      }
    }
  } catch (err) {
    log.error(
      { error: (err as Error).message, provider, userId: userId.substring(0, 8) },
      'Error loading wearable tokens'
    );
  }

  return null;
}

/**
 * Save tokens for a user
 */
export async function saveTokens(
  provider: WearableProvider,
  userId: string,
  tokens: OAuthTokens
): Promise<void> {
  if (provider === 'apple_health') {
    return; // Apple HealthKit tokens managed natively
  }

  const key = cacheKey(provider, userId);
  const tokensWithTimestamp = {
    ...tokens,
    updated_at: Date.now(),
  };

  // Update cache
  tokenCache.set(key, tokensWithTimestamp);

  // Encrypt and persist
  try {
    const store = getTokenStore(provider);
    const encrypted = encryptData(tokensWithTimestamp);
    await store.setImmediate(userId, {
      encrypted,
      provider,
      updated_at: Date.now(),
    });
    log.info({ provider, userId: userId.substring(0, 8) }, 'Saved wearable OAuth tokens');
  } catch (err) {
    log.error(
      { error: (err as Error).message, provider, userId: userId.substring(0, 8) },
      'Error saving wearable tokens'
    );
  }
}

/**
 * Remove tokens for a user
 */
export async function removeTokens(provider: WearableProvider, userId: string): Promise<void> {
  if (provider === 'apple_health') {
    return;
  }

  const key = cacheKey(provider, userId);
  tokenCache.delete(key);

  try {
    const store = getTokenStore(provider);
    await store.delete(userId);
    log.info({ provider, userId: userId.substring(0, 8) }, 'Removed wearable OAuth tokens');
  } catch (err) {
    log.error(
      { error: (err as Error).message, provider, userId: userId.substring(0, 8) },
      'Error removing wearable tokens'
    );
  }
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(
  provider: Exclude<WearableProvider, 'apple_health'>,
  userId: string
): Promise<OAuthTokens | null> {
  const userTokens = await getTokens(provider, userId);
  if (!userTokens?.refresh_token) {
    return null;
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config?.clientId || !config?.clientSecret) {
    return null;
  }

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: userTokens.refresh_token,
      }),
    });

    if (!response.ok) {
      log.error(
        { status: response.status, provider, userId: userId.substring(0, 8) },
        'Wearable token refresh failed'
      );
      return null;
    }

    const data = (await response.json()) as WearableTokenResponse;
    const newTokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || userTokens.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope || userTokens.scope,
    };

    await saveTokens(provider, userId, newTokens);
    log.info({ provider, userId: userId.substring(0, 8) }, 'Wearable token refreshed');
    return newTokens;
  } catch (err) {
    log.error(
      { error: (err as Error).message, provider, userId: userId.substring(0, 8) },
      'Error refreshing wearable token'
    );
    return null;
  }
}

/**
 * Get valid access token for a user (refresh if needed)
 */
export async function getValidToken(
  provider: Exclude<WearableProvider, 'apple_health'>,
  userId: string
): Promise<string | null> {
  const userTokens = await getTokens(provider, userId);
  if (!userTokens) {
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  const bufferMs = 5 * 60 * 1000;
  if (Date.now() >= userTokens.expires_at - bufferMs) {
    const refreshed = await refreshToken(provider, userId);
    return refreshed?.access_token || null;
  }

  return userTokens.access_token;
}

// ============================================================================
// OAUTH FLOW
// ============================================================================

/**
 * Exchange authorization code for tokens
 * Supports PKCE for providers that require it (e.g., Garmin)
 *
 * @param provider - The wearable provider
 * @param code - The authorization code from callback
 * @param state - Optional state to retrieve PKCE code_verifier
 */
export async function exchangeCode(
  provider: Exclude<WearableProvider, 'apple_health'>,
  code: string,
  state?: string
): Promise<OAuthTokens | null> {
  const config = PROVIDER_CONFIGS[provider];
  if (!config?.clientId || !config?.clientSecret) {
    return null;
  }

  try {
    // Build token request body
    const bodyParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    };

    // Add PKCE code_verifier for providers that require it
    if (config.usesPKCE && state) {
      const codeVerifier = getPKCEVerifier(state);
      if (codeVerifier) {
        bodyParams.code_verifier = codeVerifier;
        log.debug({ provider }, 'Including PKCE code_verifier in token exchange');
      } else {
        log.warn({ provider }, 'PKCE enabled but no code_verifier found for state');
      }
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams(bodyParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(
        { status: response.status, provider, error: errorText.substring(0, 200) },
        'Wearable token exchange failed'
      );
      return null;
    }

    const data = (await response.json()) as WearableTokenResponse;
    log.info({ provider }, 'Token exchange successful');

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      expires_at: Date.now() + data.expires_in * 1000,
      scope: data.scope,
    };
  } catch (err) {
    log.error({ error: (err as Error).message, provider }, 'Error exchanging wearable code');
    return null;
  }
}

// ============================================================================
// CONNECTION STATUS
// ============================================================================

export interface WearableConnectionStatus {
  provider: WearableProvider;
  configured: boolean;
  linked: boolean;
  expires_at: number | null;
  login_url: string | null;
}

/**
 * Get connection status for all providers for a user
 */
export async function getAllConnectionStatuses(
  userId: string
): Promise<WearableConnectionStatus[]> {
  const statuses: WearableConnectionStatus[] = [];

  // Apple HealthKit (native only)
  statuses.push({
    provider: 'apple_health',
    configured: true, // Always "configured" as it's native
    linked: false, // Can't check from server - native app manages this
    expires_at: null,
    login_url: 'ferniapp://healthkit/authorize', // Deep link for native app
  });

  // Web OAuth providers
  const providers: Array<Exclude<WearableProvider, 'apple_health'>> = [
    'fitbit',
    'oura',
    'garmin',
    'whoop',
  ];

  for (const provider of providers) {
    const configured = isProviderConfigured(provider);
    const tokens = configured ? await getTokens(provider, userId) : null;

    statuses.push({
      provider,
      configured,
      linked: !!tokens,
      expires_at: tokens?.expires_at || null,
      login_url: configured
        ? `/wearables/${provider}/login?user_id=${encodeURIComponent(userId)}`
        : null,
    });
  }

  return statuses;
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Shutdown wearables OAuth service
 */
export async function shutdown(): Promise<void> {
  for (const store of tokenStores.values()) {
    await store.shutdown();
  }
  tokenStores.clear();
  tokenCache.clear();
  log.info('Wearables OAuth service shutdown complete');
}
