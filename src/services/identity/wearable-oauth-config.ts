/**
 * Wearables OAuth provider configuration and authorization-URL building
 * (including PKCE for Garmin). Token storage/refresh lives in
 * wearable-linked-tokens.ts, which re-exports everything here.
 */

import crypto from 'crypto';
import { publicUrl } from '../../config/api-urls.js';
import type { WearableProvider } from '../wearable-integration/types.js';
import { createLogger } from '../../utils/safe-logger.js';

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

// PKCE verifiers awaiting their OAuth callback (state -> verifier + creation time).
// In-memory, so a multi-instance deployment needs sticky sessions or Redis.
const PKCE_VERIFIER_MAX_AGE_MS = 10 * 60 * 1000;
const pkceVerifiers = new Map<string, { verifier: string; createdAt: number }>();

/** Drop verifiers whose OAuth flow was abandoned (older than the max age). */
function pruneStalePKCEVerifiers(now: number): void {
  for (const [key, entry] of pkceVerifiers) {
    if (now - entry.createdAt > PKCE_VERIFIER_MAX_AGE_MS) {
      pkceVerifiers.delete(key);
    }
  }
}

// ============================================================================
// PROVIDER CONFIGURATIONS
// ============================================================================

export interface ProviderConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
  usesPKCE?: boolean;
}

export const PROVIDER_CONFIGS: Record<Exclude<WearableProvider, 'apple_health'>, ProviderConfig> = {
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
      publicUrl('/wearables/fitbit/callback'),
  },
  oura: {
    clientId: process.env.OURA_CLIENT_ID,
    clientSecret: process.env.OURA_CLIENT_SECRET,
    authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: ['daily', 'heartrate', 'session', 'sleep', 'workout', 'personal'],
    redirectUri:
      process.env.OURA_REDIRECT_URI ||
      publicUrl('/wearables/oura/callback'),
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
      publicUrl('/wearables/garmin/callback'),
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
      publicUrl('/wearables/whoop/callback'),
  },
  eight_sleep: {
    clientId: process.env.EIGHT_SLEEP_CLIENT_ID,
    clientSecret: process.env.EIGHT_SLEEP_CLIENT_SECRET,
    authorizeUrl: 'https://api.8slp.net/v1/oauth/authorize',
    tokenUrl: 'https://api.8slp.net/v1/oauth/token',
    scopes: ['user:read', 'sleep:read', 'bed:read'],
    redirectUri:
      process.env.EIGHT_SLEEP_REDIRECT_URI ||
      publicUrl('/wearables/eight_sleep/callback'),
  },
};

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
// AUTHORIZATION URL
// ============================================================================

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

    // Store verifier for use during token exchange; drop abandoned flows (> 10 minutes)
    const now = Date.now();
    pruneStalePKCEVerifiers(now);
    pkceVerifiers.set(state, { verifier: codeVerifier, createdAt: now });

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
  const entry = pkceVerifiers.get(state);
  if (!entry) return undefined;
  pkceVerifiers.delete(state); // One-time use
  if (Date.now() - entry.createdAt > PKCE_VERIFIER_MAX_AGE_MS) return undefined;
  return entry.verifier;
}
