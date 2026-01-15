/**
 * Integration Hub
 *
 * Central module for managing all external API integrations.
 * Provides unified OAuth, rate limiting, and webhook handling.
 *
 * @module services/integrations
 */

// Types
export type {
  AuthType,
  RateLimitConfig,
  IntegrationConfig,
  OAuthConfig,
  OAuthTokens,
  OAuthState,
  ConnectionStatus,
  IntegrationConnection,
  RateLimitState,
  RateLimitResult,
  WebhookConfig,
  WebhookEvent,
  WebhookHandler,
  ApiRequestConfig,
  ApiResponse,
  IntegrationRegistry,
} from '../types.js';

// Integration Hub
export {
  IntegrationHub,
  getIntegrationHub,
  resetIntegrationHub,
  INTEGRATIONS,
} from './integration-hub.js';

// OAuth Manager
export { OAuthManager, getOAuthManager } from './oauth-manager.js';

// OAuth Token Store
export {
  saveOAuthTokens,
  getOAuthTokens,
  updateOAuthTokens,
  deleteOAuthTokens,
  getConnectionStatus,
  getConnectedIntegrations,
  markConnectionError,
  needsRefresh,
  type StoredOAuthToken,
  type TokenStoreResult,
} from './oauth-token-store.js';

// Rate Limiter
export {
  RateLimiter,
  hasGlobalRateLimit,
  getRateLimitConfig,
  formatRateLimit,
} from './rate-limiter.js';

// Webhook Router
export {
  WebhookRouter,
  getWebhookRouter,
  resetWebhookRouter,
} from './webhook-router.js';

// API Clients
export { InstacartClient, getInstacartClient, resetInstacartClient } from './instacart/instacart-client.js';
export { UberClient, getUberClient, resetUberClient } from './uber/uber-client.js';
export { LyftClient, getLyftClient, resetLyftClient } from './lyft/lyft-client.js';
export { GoogleMapsClient, getGoogleMapsClient, resetGoogleMapsClient } from './google-maps/maps-client.js';

// Webhooks
export { initializeUberWebhooks, handleUberWebhook } from './uber/uber-webhooks.js';
export { initializeLyftWebhooks, handleLyftWebhook } from './lyft/lyft-webhooks.js';
