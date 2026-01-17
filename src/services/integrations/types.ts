/**
 * Integration Hub Types
 *
 * Shared types for the unified integration system that manages
 * all external API connections, OAuth flows, and rate limiting.
 */

// ============================================================================
// INTEGRATION CONFIGURATION
// ============================================================================

export type AuthType = 'oauth2' | 'api_key' | 'basic' | 'none';

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  requests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional: max concurrent requests */
  maxConcurrent?: number;
}

export interface IntegrationConfig {
  /** Unique identifier for the integration */
  id: string;
  /** Human-readable name */
  name: string;
  /** Authentication type required */
  authType: AuthType;
  /** OAuth scopes (for oauth2 auth type) */
  scopes?: string[];
  /** Base URL for API requests */
  baseUrl: string;
  /** Rate limiting configuration */
  rateLimits: RateLimitConfig;
  /** Webhook endpoint path (if integration supports webhooks) */
  webhookPath?: string;
  /** Whether the integration requires a business partnership */
  requiresPartnership?: boolean;
  /** Documentation URL */
  docsUrl?: string;
  /** Whether this integration is currently enabled */
  enabled: boolean;
}

// ============================================================================
// OAUTH TYPES
// ============================================================================

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: string;
  scope?: string;
}

export interface OAuthState {
  integrationId: string;
  userId: string;
  redirectPath?: string;
  nonce: string;
  createdAt: Date;
}

// ============================================================================
// CONNECTION STATUS
// ============================================================================

export type ConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'error';

export interface IntegrationConnection {
  userId: string;
  integrationId: string;
  status: ConnectionStatus;
  tokens?: OAuthTokens;
  apiKey?: string;
  connectedAt: Date;
  lastUsedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

export interface RateLimitState {
  integrationId: string;
  userId: string;
  requestCount: number;
  windowStart: Date;
  blocked: boolean;
  retryAfter?: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

// ============================================================================
// WEBHOOK TYPES
// ============================================================================

export interface WebhookConfig {
  integrationId: string;
  path: string;
  secret?: string;
  verifySignature: boolean;
  signatureHeader?: string;
  signatureAlgorithm?: 'sha256' | 'sha1' | 'hmac-sha256';
}

export interface WebhookEvent {
  id: string;
  integrationId: string;
  eventType: string;
  payload: unknown;
  receivedAt: Date;
  headers: Record<string, string>;
  verified: boolean;
}

export interface WebhookHandler {
  integrationId: string;
  eventType: string | '*';
  handler: (event: WebhookEvent) => Promise<void>;
}

// ============================================================================
// API CLIENT TYPES
// ============================================================================

export interface ApiRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  params?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
  headers: Record<string, string>;
  rateLimitRemaining?: number;
}

// ============================================================================
// INTEGRATION REGISTRY
// ============================================================================

export interface IntegrationRegistry {
  get(id: string): IntegrationConfig | undefined;
  getAll(): IntegrationConfig[];
  getEnabled(): IntegrationConfig[];
  getByAuthType(authType: AuthType): IntegrationConfig[];
}
