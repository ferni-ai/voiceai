/**
 * Integration Hub
 *
 * Central registry and manager for all external API integrations.
 * Provides unified access to OAuth, rate limiting, and API clients.
 *
 * @module services/integrations/integration-hub
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  IntegrationConfig,
  IntegrationConnection,
  IntegrationRegistry,
  AuthType,
  ConnectionStatus,
  ApiRequestConfig,
  ApiResponse,
} from './types.js';
import { OAuthManager, getOAuthManager } from './oauth-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { getConnectionStatus } from './oauth-token-store.js';

const log = createLogger({ module: 'integration-hub' });

// ============================================================================
// INTEGRATION DEFINITIONS
// ============================================================================

/**
 * All supported integrations with their configurations
 */
export const INTEGRATIONS: Record<string, IntegrationConfig> = {
  // Already implemented
  gmail: {
    id: 'gmail',
    name: 'Gmail',
    authType: 'oauth2',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    baseUrl: 'https://gmail.googleapis.com/gmail/v1',
    rateLimits: { requests: 250, windowMs: 60000 },
    docsUrl: 'https://developers.google.com/gmail/api',
    enabled: true,
  },
  google_calendar: {
    id: 'google_calendar',
    name: 'Google Calendar',
    authType: 'oauth2',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    baseUrl: 'https://www.googleapis.com/calendar/v3',
    rateLimits: { requests: 500, windowMs: 60000 },
    docsUrl: 'https://developers.google.com/calendar',
    enabled: true,
  },
  plaid: {
    id: 'plaid',
    name: 'Plaid Banking',
    authType: 'api_key',
    baseUrl: 'https://production.plaid.com',
    rateLimits: { requests: 100, windowMs: 60000 },
    docsUrl: 'https://plaid.com/docs/',
    enabled: true,
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    authType: 'oauth2',
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
    baseUrl: 'https://api.spotify.com/v1',
    rateLimits: { requests: 180, windowMs: 60000 },
    docsUrl: 'https://developer.spotify.com/documentation/web-api',
    enabled: true,
  },
  twilio: {
    id: 'twilio',
    name: 'Twilio SMS/Voice',
    authType: 'basic',
    baseUrl: 'https://api.twilio.com/2010-04-01',
    rateLimits: { requests: 100, windowMs: 1000 },
    webhookPath: '/webhooks/twilio',
    docsUrl: 'https://www.twilio.com/docs',
    enabled: true,
  },

  // New integrations for Life Automation
  uber: {
    id: 'uber',
    name: 'Uber',
    authType: 'oauth2',
    scopes: ['profile', 'request', 'request_receipt', 'places'],
    baseUrl: 'https://api.uber.com/v1.2',
    rateLimits: { requests: 2000, windowMs: 3600000 }, // 2000/hour
    webhookPath: '/webhooks/uber',
    docsUrl: 'https://developer.uber.com/docs/riders/introduction',
    enabled: true,
  },
  lyft: {
    id: 'lyft',
    name: 'Lyft',
    authType: 'oauth2',
    scopes: ['public', 'rides.read', 'rides.request', 'profile'],
    baseUrl: 'https://api.lyft.com/v1',
    rateLimits: { requests: 1000, windowMs: 3600000 },
    webhookPath: '/webhooks/lyft',
    docsUrl: 'https://developer.lyft.com/docs',
    enabled: true,
  },
  instacart: {
    id: 'instacart',
    name: 'Instacart',
    authType: 'oauth2',
    scopes: ['orders.create', 'orders.read', 'catalog.read'],
    baseUrl: 'https://connect.instacart.com/v2',
    rateLimits: { requests: 100, windowMs: 60000 },
    webhookPath: '/webhooks/instacart',
    requiresPartnership: true,
    docsUrl: 'https://docs.instacart.com/',
    enabled: false, // Requires partnership
  },
  doordash: {
    id: 'doordash',
    name: 'DoorDash',
    authType: 'api_key',
    baseUrl: 'https://openapi.doordash.com',
    rateLimits: { requests: 100, windowMs: 60000 },
    webhookPath: '/webhooks/doordash',
    requiresPartnership: true,
    docsUrl: 'https://developer.doordash.com/',
    enabled: false, // Requires partnership
  },
  google_maps: {
    id: 'google_maps',
    name: 'Google Maps',
    authType: 'api_key',
    baseUrl: 'https://maps.googleapis.com/maps/api',
    rateLimits: { requests: 50, windowMs: 1000 }, // 50 QPS
    docsUrl: 'https://developers.google.com/maps/documentation',
    enabled: true,
  },
  google_cloud_storage: {
    id: 'google_cloud_storage',
    name: 'Google Cloud Storage',
    authType: 'oauth2',
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    baseUrl: 'https://storage.googleapis.com/storage/v1',
    rateLimits: { requests: 1000, windowMs: 60000 },
    docsUrl: 'https://cloud.google.com/storage/docs',
    enabled: true,
  },
  google_vision: {
    id: 'google_vision',
    name: 'Google Cloud Vision (OCR)',
    authType: 'api_key',
    baseUrl: 'https://vision.googleapis.com/v1',
    rateLimits: { requests: 1800, windowMs: 60000 },
    docsUrl: 'https://cloud.google.com/vision/docs',
    enabled: true,
  },
};

// ============================================================================
// INTEGRATION HUB CLASS
// ============================================================================

/**
 * Central hub for managing all external integrations
 */
export class IntegrationHub implements IntegrationRegistry {
  private connections: Map<string, IntegrationConnection> = new Map();
  private oauthManager: OAuthManager;
  private rateLimiter: RateLimiter;

  constructor() {
    this.oauthManager = new OAuthManager();
    this.rateLimiter = new RateLimiter();
    log.info({ integrationCount: Object.keys(INTEGRATIONS).length }, 'Integration hub initialized');
  }

  // ==========================================================================
  // REGISTRY METHODS
  // ==========================================================================

  get(id: string): IntegrationConfig | undefined {
    return INTEGRATIONS[id];
  }

  getAll(): IntegrationConfig[] {
    return Object.values(INTEGRATIONS);
  }

  getEnabled(): IntegrationConfig[] {
    return Object.values(INTEGRATIONS).filter((i) => i.enabled);
  }

  getByAuthType(authType: AuthType): IntegrationConfig[] {
    return Object.values(INTEGRATIONS).filter((i) => i.authType === authType);
  }

  // ==========================================================================
  // CONNECTION MANAGEMENT
  // ==========================================================================

  /**
   * Get a user's connection to an integration
   */
  getConnection(userId: string, integrationId: string): IntegrationConnection | undefined {
    const key = `${userId}:${integrationId}`;
    return this.connections.get(key);
  }

  /**
   * Get all connections for a user
   */
  getUserConnections(userId: string): IntegrationConnection[] {
    const connections: IntegrationConnection[] = [];
    for (const [key, connection] of this.connections) {
      if (key.startsWith(`${userId}:`)) {
        connections.push(connection);
      }
    }
    return connections;
  }

  /**
   * Check if a user is connected to an integration
   * Now checks Firestore first, then falls back to in-memory
   */
  isConnected(userId: string, integrationId: string): boolean {
    // First check in-memory for quick access
    const connection = this.getConnection(userId, integrationId);
    if (connection?.status === 'connected') {
      return true;
    }
    // For async check, use isConnectedAsync
    return false;
  }

  /**
   * Async version of isConnected that checks Firestore
   */
  async isConnectedAsync(userId: string, integrationId: string): Promise<boolean> {
    // First check in-memory cache
    const connection = this.getConnection(userId, integrationId);
    if (connection?.status === 'connected') {
      return true;
    }
    
    // Check Firestore
    const status = await getConnectionStatus(userId, integrationId);
    return status.connected;
  }

  /**
   * Store a connection
   */
  setConnection(connection: IntegrationConnection): void {
    const key = `${connection.userId}:${connection.integrationId}`;
    this.connections.set(key, connection);
    log.debug(
      { userId: connection.userId, integrationId: connection.integrationId, status: connection.status },
      'Connection updated'
    );
  }

  /**
   * Remove a connection
   */
  removeConnection(userId: string, integrationId: string): boolean {
    const key = `${userId}:${integrationId}`;
    const deleted = this.connections.delete(key);
    if (deleted) {
      log.info({ userId, integrationId }, 'Connection removed');
    }
    return deleted;
  }

  // ==========================================================================
  // OAUTH METHODS (delegated to OAuthManager)
  // ==========================================================================

  /**
   * Generate OAuth authorization URL for a user
   */
  async getAuthorizationUrl(
    userId: string,
    integrationId: string,
    redirectPath?: string
  ): Promise<string> {
    const config = this.get(integrationId);
    if (!config) {
      throw new Error(`Unknown integration: ${integrationId}`);
    }
    if (config.authType !== 'oauth2') {
      throw new Error(`Integration ${integrationId} does not use OAuth2`);
    }
    return this.oauthManager.getAuthorizationUrl(userId, integrationId, redirectPath);
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleOAuthCallback(
    code: string,
    state: string
  ): Promise<{ userId: string; integrationId: string; success: boolean }> {
    const result = await this.oauthManager.handleCallback(code, state);

    if (result.success && result.tokens) {
      const connection: IntegrationConnection = {
        userId: result.userId,
        integrationId: result.integrationId,
        status: 'connected',
        tokens: result.tokens,
        connectedAt: new Date(),
      };
      this.setConnection(connection);
    }

    return result;
  }

  /**
   * Refresh OAuth tokens for a connection
   */
  async refreshTokens(userId: string, integrationId: string): Promise<boolean> {
    const connection = this.getConnection(userId, integrationId);
    if (!connection?.tokens?.refreshToken) {
      return false;
    }

    const newTokens = await this.oauthManager.refreshTokens(
      integrationId,
      connection.tokens.refreshToken
    );

    if (newTokens) {
      connection.tokens = newTokens;
      connection.status = 'connected';
      this.setConnection(connection);
      return true;
    }

    connection.status = 'expired';
    this.setConnection(connection);
    return false;
  }

  // ==========================================================================
  // API REQUEST METHODS
  // ==========================================================================

  /**
   * Make an authenticated API request to an integration
   * Uses Firestore-persisted tokens with automatic refresh
   */
  async request<T>(
    userId: string,
    integrationId: string,
    config: ApiRequestConfig
  ): Promise<ApiResponse<T>> {
    const integration = this.get(integrationId);
    if (!integration) {
      return {
        success: false,
        error: `Unknown integration: ${integrationId}`,
        statusCode: 400,
        headers: {},
      };
    }

    // Check rate limits
    const rateLimitResult = await this.rateLimiter.checkLimit(userId, integrationId);
    if (!rateLimitResult.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter}ms`,
        statusCode: 429,
        headers: {},
        rateLimitRemaining: 0,
      };
    }

    // Get authentication
    const headers: Record<string, string> = { ...config.headers };

    if (integration.authType === 'oauth2') {
      // Use OAuth manager to get valid tokens (auto-refreshes from Firestore)
      const oauthManager = getOAuthManager();
      const tokens = await oauthManager.getValidTokens(userId, integrationId);
      
      if (!tokens) {
        return {
          success: false,
          error: `Not connected to ${integration.name}. Please connect your account.`,
          statusCode: 401,
          headers: {},
        };
      }

      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
      
      // Update in-memory cache for quick access
      const connection = this.getConnection(userId, integrationId);
      if (connection) {
        connection.tokens = tokens;
        connection.status = 'connected';
        this.setConnection(connection);
      }
    } else if (integration.authType === 'api_key') {
      // API key should be set in environment
      const envPrefix = integrationId.toUpperCase().replace(/-/g, '_');
      const apiKey = process.env[`${envPrefix}_API_KEY`];
      if (apiKey) {
        // Different APIs expect different header formats
        if (integrationId === 'google_maps') {
          // Google Maps uses query parameter, not header
        } else {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
      }
    } else if (integration.authType === 'basic') {
      // Basic auth (e.g., Twilio)
      const envPrefix = integrationId.toUpperCase().replace(/-/g, '_');
      const accountSid = process.env[`${envPrefix}_ACCOUNT_SID`];
      const authToken = process.env[`${envPrefix}_AUTH_TOKEN`];
      if (accountSid && authToken) {
        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
    }

    // Make the request
    try {
      const url = new URL(config.path, integration.baseUrl);
      if (config.params) {
        for (const [key, value] of Object.entries(config.params)) {
          url.searchParams.set(key, String(value));
        }
      }
      
      // Add API key as query param for Google Maps
      if (integrationId === 'google_maps') {
        const apiKey = process.env['GOOGLE_MAPS_API_KEY'];
        if (apiKey) {
          url.searchParams.set('key', apiKey);
        }
      }

      const response = await fetch(url.toString(), {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Record the request for rate limiting
      await this.rateLimiter.recordRequest(userId, integrationId);

      if (!response.ok) {
        const errorText = await response.text();
        log.warn(
          { userId, integrationId, statusCode: response.status, error: errorText },
          'API request failed'
        );
        return {
          success: false,
          error: errorText,
          statusCode: response.status,
          headers: responseHeaders,
          rateLimitRemaining: rateLimitResult.remaining - 1,
        };
      }

      const data = (await response.json()) as T;
      return {
        success: true,
        data,
        statusCode: response.status,
        headers: responseHeaders,
        rateLimitRemaining: rateLimitResult.remaining - 1,
      };
    } catch (error) {
      log.error({ error: String(error), userId, integrationId }, 'API request error');
      return {
        success: false,
        error: String(error),
        statusCode: 500,
        headers: {},
      };
    }
  }

  // ==========================================================================
  // INTEGRATION STATUS
  // ==========================================================================

  /**
   * Get status of all integrations for a user
   */
  getIntegrationStatus(userId: string): Array<{
    integration: IntegrationConfig;
    status: ConnectionStatus;
    connectedAt?: Date;
  }> {
    return this.getEnabled().map((integration) => {
      const connection = this.getConnection(userId, integration.id);
      return {
        integration,
        status: connection?.status || 'disconnected',
        connectedAt: connection?.connectedAt,
      };
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let integrationHubInstance: IntegrationHub | null = null;

export function getIntegrationHub(): IntegrationHub {
  if (!integrationHubInstance) {
    integrationHubInstance = new IntegrationHub();
  }
  return integrationHubInstance;
}

export function resetIntegrationHub(): void {
  integrationHubInstance = null;
}
