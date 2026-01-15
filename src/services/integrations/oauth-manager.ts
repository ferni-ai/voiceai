/**
 * OAuth Manager
 *
 * Handles OAuth2 authentication flows for all integrations.
 * Supports authorization code flow with PKCE.
 * Tokens are persisted to Firestore with encryption.
 *
 * @module services/integrations/oauth-manager
 */

import { createLogger } from '../../utils/safe-logger.js';
import { randomBytes } from 'crypto';
import type { OAuthConfig, OAuthTokens, OAuthState } from '../types.js';
import {
  saveOAuthTokens,
  getOAuthTokens,
  updateOAuthTokens,
  deleteOAuthTokens,
  getConnectionStatus,
  getConnectedIntegrations,
  markConnectionError,
  needsRefresh,
} from './oauth-token-store.js';

const log = createLogger({ module: 'oauth-manager' });

// ============================================================================
// OAUTH CONFIGURATIONS
// ============================================================================

/**
 * OAuth configurations for each provider
 * Credentials should be set via environment variables
 */
const OAUTH_CONFIGS: Record<string, Partial<OAuthConfig>> = {
  gmail: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
  },
  google_calendar: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  },
  spotify: {
    authorizationUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scopes: [
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'user-top-read',
    ],
  },
  uber: {
    authorizationUrl: 'https://login.uber.com/oauth/v2/authorize',
    tokenUrl: 'https://login.uber.com/oauth/v2/token',
    scopes: ['profile', 'request', 'request_receipt', 'places'],
  },
  lyft: {
    authorizationUrl: 'https://api.lyft.com/oauth/authorize',
    tokenUrl: 'https://api.lyft.com/oauth/token',
    scopes: ['public', 'rides.read', 'rides.request', 'profile'],
  },
  instacart: {
    authorizationUrl: 'https://connect.instacart.com/oauth/authorize',
    tokenUrl: 'https://connect.instacart.com/oauth/token',
    scopes: ['orders.create', 'orders.read', 'catalog.read'],
  },
  google_cloud_storage: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  },
  google_maps: {
    // Google Maps uses API key, not OAuth, but we include it for completeness
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [],
  },
};

// ============================================================================
// OAUTH MANAGER CLASS
// ============================================================================

export class OAuthManager {
  private pendingStates: Map<string, OAuthState> = new Map();
  private readonly stateExpiryMs = 10 * 60 * 1000; // 10 minutes
  private readonly tokenRefreshBufferMs = 5 * 60 * 1000; // 5 minutes before expiry

  constructor() {
    // Clean up expired states periodically
    setInterval(() => this.cleanupExpiredStates(), 60000);
  }

  // ==========================================================================
  // AUTHORIZATION URL
  // ==========================================================================

  /**
   * Generate OAuth authorization URL for a user to connect an integration
   */
  getAuthorizationUrl(userId: string, integrationId: string, redirectPath?: string): string {
    const config = this.getConfig(integrationId);
    if (!config) {
      throw new Error(`No OAuth config for integration: ${integrationId}`);
    }

    // Generate state token for CSRF protection
    const nonce = randomBytes(16).toString('hex');
    const state: OAuthState = {
      integrationId,
      userId,
      redirectPath,
      nonce,
      createdAt: new Date(),
    };

    // Store state for validation on callback
    const stateToken = this.encodeState(state);
    this.pendingStates.set(nonce, state);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      state: stateToken,
      access_type: 'offline', // Request refresh token
      prompt: 'consent', // Force consent to get refresh token
    });

    const authUrl = `${config.authorizationUrl}?${params.toString()}`;
    log.debug({ userId, integrationId }, 'Generated OAuth authorization URL');

    return authUrl;
  }

  // ==========================================================================
  // CALLBACK HANDLING
  // ==========================================================================

  /**
   * Handle OAuth callback with authorization code
   * Saves tokens to Firestore on success
   */
  async handleCallback(
    code: string,
    stateToken: string
  ): Promise<{
    userId: string;
    integrationId: string;
    success: boolean;
    tokens?: OAuthTokens;
    error?: string;
    redirectPath?: string;
  }> {
    // Decode and validate state
    const state = this.decodeAndValidateState(stateToken);
    if (!state) {
      return {
        userId: '',
        integrationId: '',
        success: false,
        error: 'Invalid or expired state token',
      };
    }

    const { userId, integrationId, redirectPath } = state;

    // Exchange code for tokens
    const config = this.getConfig(integrationId);
    if (!config) {
      return {
        userId,
        integrationId,
        success: false,
        error: `No OAuth config for integration: ${integrationId}`,
      };
    }

    try {
      const tokens = await this.exchangeCodeForTokens(config, code);

      // Persist tokens to Firestore
      const saveResult = await saveOAuthTokens(userId, integrationId, tokens);
      if (!saveResult.success) {
        log.warn({ userId, integrationId }, 'Tokens obtained but failed to persist');
      }

      log.info({ userId, integrationId }, 'OAuth tokens obtained and saved');

      return {
        userId,
        integrationId,
        success: true,
        tokens,
        redirectPath,
      };
    } catch (error) {
      log.error({ error: String(error), userId, integrationId }, 'Failed to exchange OAuth code');
      return {
        userId,
        integrationId,
        success: false,
        error: String(error),
      };
    }
  }

  // ==========================================================================
  // TOKEN MANAGEMENT (with persistence)
  // ==========================================================================

  /**
   * Get valid OAuth tokens for a user and integration
   * Automatically refreshes if expired or about to expire
   */
  async getValidTokens(userId: string, integrationId: string): Promise<OAuthTokens | null> {
    // Get tokens from Firestore
    const tokens = await getOAuthTokens(userId, integrationId);
    if (!tokens) {
      log.debug({ userId, integrationId }, 'No tokens found');
      return null;
    }

    // Check if tokens need refresh
    const needsTokenRefresh = await needsRefresh(userId, integrationId, 5);
    if (needsTokenRefresh && tokens.refreshToken) {
      const refreshed = await this.refreshAndSaveTokens(userId, integrationId, tokens.refreshToken);
      if (refreshed) {
        return refreshed;
      }
      // If refresh failed, return existing tokens if still valid
      if (tokens.expiresAt > new Date()) {
        return tokens;
      }
      return null;
    }

    // Check if current tokens are valid
    if (tokens.expiresAt <= new Date()) {
      // Tokens expired and no refresh token
      if (!tokens.refreshToken) {
        log.warn({ userId, integrationId }, 'Tokens expired with no refresh token');
        await markConnectionError(userId, integrationId, 'Tokens expired');
        return null;
      }

      // Try refresh
      const refreshed = await this.refreshAndSaveTokens(userId, integrationId, tokens.refreshToken);
      if (!refreshed) {
        await markConnectionError(userId, integrationId, 'Token refresh failed');
      }
      return refreshed;
    }

    return tokens;
  }

  /**
   * Refresh tokens and save to Firestore
   */
  private async refreshAndSaveTokens(
    userId: string,
    integrationId: string,
    refreshToken: string
  ): Promise<OAuthTokens | null> {
    const newTokens = await this.refreshTokens(integrationId, refreshToken);
    if (!newTokens) {
      return null;
    }

    // Save refreshed tokens
    const updateResult = await updateOAuthTokens(userId, integrationId, newTokens);
    if (!updateResult.success) {
      log.warn({ userId, integrationId }, 'Failed to save refreshed tokens');
    }

    return newTokens;
  }

  /**
   * Disconnect an integration (revoke and delete tokens)
   */
  async disconnect(userId: string, integrationId: string): Promise<boolean> {
    // Delete tokens from Firestore
    const result = await deleteOAuthTokens(userId, integrationId);
    if (result.success) {
      log.info({ userId, integrationId }, 'Integration disconnected');
    }
    return result.success;
  }

  /**
   * Check if a user has connected an integration
   */
  async isConnected(userId: string, integrationId: string): Promise<boolean> {
    const status = await getConnectionStatus(userId, integrationId);
    return status.connected;
  }

  /**
   * Get connection status for an integration
   */
  async getStatus(
    userId: string,
    integrationId: string
  ): Promise<{
    connected: boolean;
    status: string;
    connectedAt?: string;
    expiresAt?: string;
    scopes?: string[];
  }> {
    return getConnectionStatus(userId, integrationId);
  }

  /**
   * Get all connected integrations for a user
   */
  async getConnections(userId: string): Promise<
    Array<{
      provider: string;
      status: string;
      connectedAt: string;
      scopes: string[];
    }>
  > {
    return getConnectedIntegrations(userId);
  }

  // ==========================================================================
  // TOKEN REFRESH
  // ==========================================================================

  /**
   * Refresh OAuth tokens using refresh token
   */
  async refreshTokens(integrationId: string, refreshToken: string): Promise<OAuthTokens | null> {
    const config = this.getConfig(integrationId);
    if (!config) {
      log.error({ integrationId }, 'No OAuth config for token refresh');
      return null;
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.warn({ integrationId, error: errorText }, 'Token refresh failed');
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        token_type: string;
        scope?: string;
      };

      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Keep old refresh token if not returned
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        tokenType: data.token_type,
        scope: data.scope,
      };

      log.debug({ integrationId }, 'OAuth tokens refreshed');
      return tokens;
    } catch (error) {
      log.error({ error: String(error), integrationId }, 'Token refresh error');
      return null;
    }
  }

  // ==========================================================================
  // AVAILABLE INTEGRATIONS
  // ==========================================================================

  /**
   * Get list of available OAuth integrations
   */
  getAvailableIntegrations(): Array<{
    id: string;
    name: string;
    scopes: string[];
    configured: boolean;
  }> {
    return Object.entries(OAUTH_CONFIGS).map(([id, config]) => {
      const fullConfig = this.getConfig(id);
      return {
        id,
        name: this.getIntegrationDisplayName(id),
        scopes: config.scopes || [],
        configured: fullConfig !== null,
      };
    });
  }

  /**
   * Get display name for an integration
   */
  private getIntegrationDisplayName(id: string): string {
    const displayNames: Record<string, string> = {
      gmail: 'Gmail',
      google_calendar: 'Google Calendar',
      spotify: 'Spotify',
      uber: 'Uber',
      lyft: 'Lyft',
      instacart: 'Instacart',
      google_cloud_storage: 'Google Cloud Storage',
      google_maps: 'Google Maps',
    };
    return displayNames[id] || id;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Get full OAuth config for an integration
   */
  private getConfig(integrationId: string): OAuthConfig | null {
    const baseConfig = OAUTH_CONFIGS[integrationId];
    if (!baseConfig) {
      return null;
    }

    // Get credentials from environment
    const envPrefix = integrationId.toUpperCase().replace(/-/g, '_');
    const clientId = process.env[`${envPrefix}_CLIENT_ID`];
    const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
    const redirectUri =
      process.env[`${envPrefix}_REDIRECT_URI`] ||
      (process.env.OAUTH_REDIRECT_BASE_URI
        ? `${process.env.OAUTH_REDIRECT_BASE_URI}/api/oauth/callback/${integrationId}`
        : null);

    if (!clientId || !clientSecret) {
      log.warn({ integrationId }, 'Missing OAuth credentials in environment');
      return null;
    }

    return {
      clientId,
      clientSecret,
      authorizationUrl: baseConfig.authorizationUrl!,
      tokenUrl: baseConfig.tokenUrl!,
      scopes: baseConfig.scopes || [],
      redirectUri: redirectUri || '',
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(config: OAuthConfig, code: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope?: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  /**
   * Encode state object to string
   */
  private encodeState(state: OAuthState): string {
    const json = JSON.stringify(state);
    return Buffer.from(json).toString('base64url');
  }

  /**
   * Decode and validate state token
   */
  private decodeAndValidateState(stateToken: string): OAuthState | null {
    try {
      const json = Buffer.from(stateToken, 'base64url').toString('utf8');
      const state = JSON.parse(json) as OAuthState;

      // Validate nonce exists in pending states
      const pendingState = this.pendingStates.get(state.nonce);
      if (!pendingState) {
        log.warn({ nonce: state.nonce }, 'State nonce not found');
        return null;
      }

      // Remove used state
      this.pendingStates.delete(state.nonce);

      // Check expiry
      const createdAt = new Date(pendingState.createdAt);
      if (Date.now() - createdAt.getTime() > this.stateExpiryMs) {
        log.warn({ nonce: state.nonce }, 'State token expired');
        return null;
      }

      return pendingState;
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to decode state token');
      return null;
    }
  }

  /**
   * Clean up expired pending states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [nonce, state] of this.pendingStates) {
      const createdAt = new Date(state.createdAt);
      if (now - createdAt.getTime() > this.stateExpiryMs) {
        this.pendingStates.delete(nonce);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned }, 'Cleaned up expired OAuth states');
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let oauthManagerInstance: OAuthManager | null = null;

export function getOAuthManager(): OAuthManager {
  if (!oauthManagerInstance) {
    oauthManagerInstance = new OAuthManager();
  }
  return oauthManagerInstance;
}
