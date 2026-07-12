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
 * Tokens are encrypted before storage for security.
 */

import crypto from 'crypto';
import type { OAuthTokens } from '../../shared/types.js';
import type { WearableProvider } from '../../../services/wearable-integration/types.js';
import { encryptData, decryptData } from '../../shared/encryption.js';
import { createPersistenceStore } from '../../../services/persistence/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'WearablesOAuth' });

// ============================================================================
// PKCE HELPERS (for Garmin and other PKCE-enabled providers)
// ============================================================================

/**
 * Generate a cryptographically random code verifier for PKCE
 */
function generateCodeVerifier(): string {
  // 43-128 characters from unreserved URI characters
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate code challenge from code verifier using S256 method
 */
function generateCodeChallenge(codeVerifier: string): string {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return hash.toString('base64url');
}

// Store PKCE verifiers temporarily (in production, use Redis with TTL)
const pkceVerifiers = new Map<string, string>(); // state -> codeVerifier

// ============================================================================
// PROVIDER CONFIGURATIONS
// ============================================================================

interface ProviderConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
  usesPKCE?: boolean;
}

const PROVIDER_CONFIGS: Record<Exclude<WearableProvider, 'apple_health'>, ProviderConfig> = {
  fitbit: {
    clientId: process.env.FITBIT_CLIENT_ID,
    clientSecret: process.env.FITBIT_CLIENT_SECRET,
    authorizeUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    scopes: [
      'activity',
      'heartrate',
      'sleep',
      'profile',
      'oxygen_saturation',
      'respiratory_rate',
      'temperature',
    ],
    redirectUri:
      process.env.FITBIT_REDIRECT_URI ||
      `http://localhost:${process.env.PORT || 3002}/wearables/fitbit/callback`,
  },
  oura: {
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET,
    authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: ['daily', 'heartrate', 'session', 'sleep', 'workout', 'personal'],
    redirectUri:
      process.env.OURA_REDIRECT_URI ||
      `http://localhost:${process.env.PORT || 3002}/wearables/oura/callback`,
  },
  garmin: {
    clientId: process.env.GARMIN_CLIENT_ID,
    clientSecret: process.env.GARMIN_CLIENT_SECRET,
    // Garmin Health API OAuth 2.0 with PKCE
    // Docs: https://developerportal.garmin.com/health-api/
    authorizeUrl: 'https://connect.garmin.com/oauthConfirm',
    tokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
    scopes: ['health_export', 'activity_export', 'sleep_export', 'heart_rate_export'],
    redirectUri:
      process.env.GARMIN_REDIRECT_URI ||
      `http://localhost:${process.env.PORT || 3002}/wearables/garmin/callback`,
    // Note: Garmin Health API requires PKCE. The buildAuthUrl function handles this.
    usesPKCE: true,
  },
  whoop: {
    clientId: process.env.WHOOP_CLIENT_ID,
    clientSecret: process.env.WHOOP_CLIENT_SECRET,
    authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scopes: ['read:profile', 'read:cycles', 'read:recovery', 'read:sleep', 'read:workout'],
    redirectUri:
      process.env.WHOOP_REDIRECT_URI ||
      `http://localhost:${process.env.PORT || 3002}/wearables/whoop/callback`,
  },
  eight_sleep: {
    clientId: process.env.EIGHT_SLEEP_CLIENT_ID,
    clientSecret: process.env.EIGHT_SLEEP_CLIENT_SECRET,
    authorizeUrl: 'https://api.8slp.net/v1/oauth/authorize',
    tokenUrl: 'https://api.8slp.net/v1/oauth/token',
    scopes: ['user:read', 'sleep:read', 'bed:read'],
    redirectUri:
      process.env.EIGHT_SLEEP_REDIRECT_URI ||
      `http://localhost:${process.env.PORT || 3002}/wearables/eight_sleep/callback`,
  },
};

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
// CONFIGURATION CHECKS
// ============================================================================

/**
 * Check if a specific provider is configured
 */
export function isProviderConfigured(provider: WearableProvider): boolean {
  if (provider === 'apple_health') {
    // Apple HealthKit doesn't use OAuth, it's native iOS
    return true;
  }

  const config = PROVIDER_CONFIGS[provider];
  return !!(config?.clientId && config?.clientSecret);
}

/**
 * Get configuration for a provider
 */
export function getProviderConfig(
  provider: Exclude<WearableProvider, 'apple_health'>
): ProviderConfig | null {
  if (!isProviderConfigured(provider)) {
    return null;
  }
  return PROVIDER_CONFIGS[provider];
}

/**
 * Get all configured providers
 */
export function getConfiguredProviders(): WearableProvider[] {
  const configured: WearableProvider[] = [];

  for (const provider of Object.keys(PROVIDER_CONFIGS) as Array<
    Exclude<WearableProvider, 'apple_health'>
  >) {
    if (isProviderConfigured(provider)) {
      configured.push(provider);
    }
  }

  return configured;
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

/**
 * Build authorization URL for a provider
 * For PKCE-enabled providers (Garmin), also generates and stores code_verifier
 */
export function buildAuthUrl(
  provider: Exclude<WearableProvider, 'apple_health'>,
  state: string
): string | null {
  const config = PROVIDER_CONFIGS[provider];
  if (!config?.clientId) {
    return null;
  }

  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.redirectUri);

  if (config.scopes.length > 0) {
    url.searchParams.set('scope', config.scopes.join(' '));
  }

  url.searchParams.set('state', state);

  // Add PKCE parameters for providers that require it (e.g., Garmin)
  if (config.usesPKCE) {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store verifier for use during token exchange
    pkceVerifiers.set(state, codeVerifier);

    // Cleanup old verifiers (> 10 minutes)
    const maxAge = 10 * 60 * 1000;
    for (const [key, _] of pkceVerifiers) {
      // We don't store timestamps, so we rely on the caller to cleanup
      // In production, use Redis with TTL
    }

    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    log.debug({ provider, state: state.substring(0, 8) }, 'PKCE enabled for OAuth flow');
  }

  return url.toString();
}

/**
 * Get stored PKCE code_verifier for a state
 * Used during token exchange for PKCE-enabled providers
 */
export function getPKCEVerifier(state: string): string | undefined {
  const verifier = pkceVerifiers.get(state);
  if (verifier) {
    pkceVerifiers.delete(state); // One-time use
  }
  return verifier;
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
