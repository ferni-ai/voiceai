# Phase 3: Full Integration System

> **Timeline:** 4-6 weeks  
> **Risk Level:** High  
> **Dependencies:** Phase 2 complete

## Goals

1. Implement OAuth 2.0 flows for major providers
2. Build integration management UI
3. Create integration adapter framework
4. Support multiple providers per integration type
5. Enable community-contributed integrations

---

## Scope

**In Scope:**
- OAuth 2.0 authorization flows
- Token refresh and management
- Integration settings UI
- Provider selection (Schwab vs Alpaca vs Robinhood)
- Adapter framework for new integrations
- Integration health monitoring

**Out of Scope:**
- Integration marketplace (future)
- Custom integration SDK (future)
- Real-time data streaming (future)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Ferni Platform                                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Frontend (Integration UI)                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │ Settings     │  │ Connect New  │  │ Manage Connected         │ │ │
│  │  │ Dashboard    │  │ Integration  │  │ Integrations             │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     Integration Service                             │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │ │
│  │  │ OAuth      │  │ Token      │  │ Health     │  │ Adapter    │  │ │
│  │  │ Manager    │  │ Manager    │  │ Monitor    │  │ Registry   │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Integration Adapters                             │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │ │
│  │  │ Schwab     │  │ Alpaca     │  │ Google     │  │ Custom     │  │ │
│  │  │ Adapter    │  │ Adapter    │  │ Calendar   │  │ Webhook    │  │ │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     External Services                               │ │
│  │         Schwab API    Alpaca API    Google Calendar API             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. OAuth Manager

**File:** `src/services/integrations/oauth-manager.ts`

```typescript
/**
 * OAuth Manager
 * 
 * Handles OAuth 2.0 flows for external integrations.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import { encrypt, decrypt } from '../credentials/encryption.js';
import { v4 as uuid } from 'uuid';

const db = getFirestore();

// Types
export interface OAuthConfig {
  provider_id: string;
  client_id: string;
  client_secret: string;
  authorization_url: string;
  token_url: string;
  scopes: string[];
  redirect_uri: string;
}

export interface OAuthState {
  id: string;
  user_id: string;
  provider_id: string;
  scopes: string[];
  redirect_after: string;
  created_at: Date;
  expires_at: Date;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_at?: Date;
  scope?: string;
}

// Provider configurations (loaded from environment)
const providers = new Map<string, OAuthConfig>();

/**
 * Register an OAuth provider configuration
 */
export function registerOAuthProvider(config: OAuthConfig): void {
  providers.set(config.provider_id, config);
  getLogger().info({ providerId: config.provider_id }, 'OAuth provider registered');
}

/**
 * Initialize OAuth providers from environment
 */
export function initializeOAuthProviders(): void {
  // Schwab
  if (process.env.SCHWAB_CLIENT_ID) {
    registerOAuthProvider({
      provider_id: 'schwab',
      client_id: process.env.SCHWAB_CLIENT_ID,
      client_secret: process.env.SCHWAB_CLIENT_SECRET!,
      authorization_url: 'https://api.schwab.com/oauth/authorize',
      token_url: 'https://api.schwab.com/oauth/token',
      scopes: ['trading', 'account-read'],
      redirect_uri: `${process.env.APP_URL}/api/oauth/callback/schwab`,
    });
  }
  
  // Alpaca
  if (process.env.ALPACA_CLIENT_ID) {
    registerOAuthProvider({
      provider_id: 'alpaca',
      client_id: process.env.ALPACA_CLIENT_ID,
      client_secret: process.env.ALPACA_CLIENT_SECRET!,
      authorization_url: 'https://app.alpaca.markets/oauth/authorize',
      token_url: 'https://api.alpaca.markets/oauth/token',
      scopes: ['account:write', 'trading'],
      redirect_uri: `${process.env.APP_URL}/api/oauth/callback/alpaca`,
    });
  }
  
  // Google Calendar
  if (process.env.GOOGLE_CLIENT_ID) {
    registerOAuthProvider({
      provider_id: 'google-calendar',
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/calendar'],
      redirect_uri: `${process.env.APP_URL}/api/oauth/callback/google`,
    });
  }
}

/**
 * Generate OAuth authorization URL
 */
export async function getAuthorizationUrl(
  userId: string,
  providerId: string,
  options: {
    scopes?: string[];
    redirectAfter?: string;
  } = {}
): Promise<string> {
  const provider = providers.get(providerId);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }
  
  // Create state for CSRF protection
  const state: OAuthState = {
    id: uuid(),
    user_id: userId,
    provider_id: providerId,
    scopes: options.scopes || provider.scopes,
    redirect_after: options.redirectAfter || '/',
    created_at: new Date(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 min
  };
  
  // Store state
  await db.collection('oauth_states').doc(state.id).set({
    ...state,
    created_at: Timestamp.fromDate(state.created_at),
    expires_at: Timestamp.fromDate(state.expires_at),
  });
  
  // Build URL
  const params = new URLSearchParams({
    client_id: provider.client_id,
    redirect_uri: provider.redirect_uri,
    response_type: 'code',
    scope: state.scopes.join(' '),
    state: state.id,
    access_type: 'offline', // For refresh tokens
    prompt: 'consent',
  });
  
  return `${provider.authorization_url}?${params}`;
}

/**
 * Handle OAuth callback
 */
export async function handleOAuthCallback(
  providerId: string,
  code: string,
  stateId: string
): Promise<{ userId: string; redirectAfter: string }> {
  const logger = getLogger();
  
  // Validate state
  const stateDoc = await db.collection('oauth_states').doc(stateId).get();
  if (!stateDoc.exists) {
    throw new Error('Invalid OAuth state');
  }
  
  const state = stateDoc.data() as OAuthState;
  if (state.provider_id !== providerId) {
    throw new Error('Provider mismatch');
  }
  
  if (new Date() > state.expires_at) {
    throw new Error('OAuth state expired');
  }
  
  // Delete state (one-time use)
  await db.collection('oauth_states').doc(stateId).delete();
  
  // Exchange code for tokens
  const provider = providers.get(providerId)!;
  const tokens = await exchangeCodeForTokens(provider, code);
  
  // Store tokens
  await storeOAuthTokens(state.user_id, providerId, tokens);
  
  logger.info({ userId: state.user_id, providerId }, 'OAuth tokens stored');
  
  return {
    userId: state.user_id,
    redirectAfter: state.redirect_after,
  };
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  provider: OAuthConfig,
  code: string
): Promise<OAuthTokens> {
  const response = await fetch(provider.token_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: provider.redirect_uri,
      client_id: provider.client_id,
      client_secret: provider.client_secret,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  const data = await response.json();
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type || 'Bearer',
    expires_at: data.expires_in 
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scope: data.scope,
  };
}

/**
 * Store OAuth tokens (encrypted)
 */
async function storeOAuthTokens(
  userId: string,
  providerId: string,
  tokens: OAuthTokens
): Promise<void> {
  const docId = `${userId}_${providerId}`;
  
  await db.collection('user_integrations').doc(docId).set({
    user_id: userId,
    integration_id: providerId,
    status: 'connected',
    connected_at: Timestamp.now(),
    last_used_at: null,
    expires_at: tokens.expires_at ? Timestamp.fromDate(tokens.expires_at) : null,
    credentials: {
      access_token_encrypted: await encrypt(tokens.access_token),
      refresh_token_encrypted: tokens.refresh_token 
        ? await encrypt(tokens.refresh_token)
        : null,
      token_type: tokens.token_type,
      scope: tokens.scope,
    },
  });
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getAccessToken(
  userId: string,
  providerId: string
): Promise<string | null> {
  const logger = getLogger();
  const docId = `${userId}_${providerId}`;
  
  const doc = await db.collection('user_integrations').doc(docId).get();
  if (!doc.exists) return null;
  
  const data = doc.data()!;
  if (data.status !== 'connected') return null;
  
  // Check if expired
  const expiresAt = data.expires_at?.toDate();
  if (expiresAt && expiresAt < new Date()) {
    // Try to refresh
    if (data.credentials.refresh_token_encrypted) {
      try {
        const newTokens = await refreshTokens(userId, providerId, data);
        return newTokens.access_token;
      } catch (err) {
        logger.error({ userId, providerId, error: err }, 'Token refresh failed');
        // Mark as expired
        await db.collection('user_integrations').doc(docId).update({
          status: 'expired',
        });
        return null;
      }
    } else {
      // No refresh token, mark as expired
      await db.collection('user_integrations').doc(docId).update({
        status: 'expired',
      });
      return null;
    }
  }
  
  // Return decrypted access token
  return decrypt(data.credentials.access_token_encrypted);
}

/**
 * Refresh OAuth tokens
 */
async function refreshTokens(
  userId: string,
  providerId: string,
  data: any
): Promise<OAuthTokens> {
  const provider = providers.get(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  
  const refreshToken = await decrypt(data.credentials.refresh_token_encrypted);
  
  const response = await fetch(provider.token_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: provider.client_id,
      client_secret: provider.client_secret,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Refresh failed: ${await response.text()}`);
  }
  
  const newData = await response.json();
  
  const tokens: OAuthTokens = {
    access_token: newData.access_token,
    refresh_token: newData.refresh_token || refreshToken,
    token_type: newData.token_type || 'Bearer',
    expires_at: newData.expires_in 
      ? new Date(Date.now() + newData.expires_in * 1000)
      : undefined,
  };
  
  // Store new tokens
  await storeOAuthTokens(userId, providerId, tokens);
  
  return tokens;
}

/**
 * Revoke OAuth access
 */
export async function revokeOAuthAccess(
  userId: string,
  providerId: string
): Promise<void> {
  const docId = `${userId}_${providerId}`;
  
  // Try to revoke at provider (best effort)
  try {
    const token = await getAccessToken(userId, providerId);
    if (token) {
      // Provider-specific revocation logic here
    }
  } catch {
    // Ignore revocation errors
  }
  
  // Delete local record
  await db.collection('user_integrations').doc(docId).delete();
  
  getLogger().info({ userId, providerId }, 'OAuth access revoked');
}
```

### 2. Integration Adapter Framework

**File:** `src/services/integrations/adapter-registry.ts`

```typescript
/**
 * Integration Adapter Registry
 * 
 * Manages integration adapters that translate between Ferni tools
 * and external service APIs.
 */

import { getLogger } from '../../utils/safe-logger.js';

// Types
export interface IntegrationAdapter {
  id: string;
  name: string;
  category: IntegrationCategory;
  
  // Authentication
  authType: 'oauth' | 'api_key' | 'both';
  oauthProviderId?: string;
  
  // Capabilities
  capabilities: string[];
  
  // Methods
  initialize(credentials: AdapterCredentials): Promise<void>;
  execute(method: string, params: Record<string, unknown>): Promise<unknown>;
  healthCheck(): Promise<boolean>;
}

export type IntegrationCategory = 'broker' | 'calendar' | 'email' | 'smart-home' | 'custom';

export interface AdapterCredentials {
  accessToken?: string;
  apiKey?: string;
  apiSecret?: string;
  [key: string]: string | undefined;
}

// Registry
const adapters = new Map<string, () => IntegrationAdapter>();

/**
 * Register an adapter factory
 */
export function registerAdapter(
  id: string,
  factory: () => IntegrationAdapter
): void {
  adapters.set(id, factory);
  getLogger().info({ adapterId: id }, 'Integration adapter registered');
}

/**
 * Get an adapter instance
 */
export function getAdapter(id: string): IntegrationAdapter | null {
  const factory = adapters.get(id);
  return factory ? factory() : null;
}

/**
 * List available adapters
 */
export function listAdapters(): Array<{ id: string; name: string; category: IntegrationCategory }> {
  const result: Array<{ id: string; name: string; category: IntegrationCategory }> = [];
  
  for (const [id, factory] of adapters) {
    const adapter = factory();
    result.push({
      id,
      name: adapter.name,
      category: adapter.category,
    });
  }
  
  return result;
}

/**
 * List adapters by category
 */
export function getAdaptersByCategory(category: IntegrationCategory): string[] {
  const result: string[] = [];
  
  for (const [id, factory] of adapters) {
    const adapter = factory();
    if (adapter.category === category) {
      result.push(id);
    }
  }
  
  return result;
}
```

### 3. Example Adapter: Alpaca Trading

**File:** `src/services/integrations/adapters/alpaca-adapter.ts`

```typescript
/**
 * Alpaca Trading Adapter
 * 
 * Integration adapter for Alpaca paper/live trading.
 */

import type { IntegrationAdapter, AdapterCredentials } from '../adapter-registry.js';
import { getLogger } from '../../../utils/safe-logger.js';

const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_URL = 'https://api.alpaca.markets';

export class AlpacaAdapter implements IntegrationAdapter {
  id = 'alpaca';
  name = 'Alpaca Trading';
  category = 'broker' as const;
  authType = 'both' as const;
  oauthProviderId = 'alpaca';
  
  capabilities = [
    'get-account',
    'get-positions',
    'get-orders',
    'place-order',
    'cancel-order',
    'get-quote',
  ];
  
  private baseUrl = ALPACA_PAPER_URL;
  private accessToken: string | null = null;
  private apiKey: string | null = null;
  private apiSecret: string | null = null;
  
  async initialize(credentials: AdapterCredentials): Promise<void> {
    if (credentials.accessToken) {
      this.accessToken = credentials.accessToken;
    } else if (credentials.apiKey && credentials.apiSecret) {
      this.apiKey = credentials.apiKey;
      this.apiSecret = credentials.apiSecret;
    } else {
      throw new Error('Alpaca requires OAuth token or API key/secret');
    }
    
    // Use live URL if configured
    if (process.env.ALPACA_USE_LIVE === 'true') {
      this.baseUrl = ALPACA_LIVE_URL;
    }
  }
  
  async execute(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'get-account':
        return this.getAccount();
      case 'get-positions':
        return this.getPositions();
      case 'get-orders':
        return this.getOrders(params);
      case 'place-order':
        return this.placeOrder(params);
      case 'cancel-order':
        return this.cancelOrder(params.order_id as string);
      case 'get-quote':
        return this.getQuote(params.symbol as string);
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      await this.getAccount();
      return true;
    } catch {
      return false;
    }
  }
  
  // Private methods
  
  private async request(
    path: string,
    options: RequestInit = {}
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    } else if (this.apiKey && this.apiSecret) {
      headers['APCA-API-KEY-ID'] = this.apiKey;
      headers['APCA-API-SECRET-KEY'] = this.apiSecret;
    }
    
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Alpaca API error: ${response.status} ${error}`);
    }
    
    return response.json();
  }
  
  private async getAccount(): Promise<unknown> {
    return this.request('/v2/account');
  }
  
  private async getPositions(): Promise<unknown> {
    return this.request('/v2/positions');
  }
  
  private async getOrders(params: Record<string, unknown>): Promise<unknown> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', String(params.status));
    if (params.limit) query.set('limit', String(params.limit));
    
    return this.request(`/v2/orders?${query}`);
  }
  
  private async placeOrder(params: Record<string, unknown>): Promise<unknown> {
    return this.request('/v2/orders', {
      method: 'POST',
      body: JSON.stringify({
        symbol: params.symbol,
        qty: params.quantity,
        side: params.action, // 'buy' or 'sell'
        type: params.order_type || 'market',
        time_in_force: params.time_in_force || 'day',
        limit_price: params.limit_price,
      }),
    });
  }
  
  private async cancelOrder(orderId: string): Promise<void> {
    await this.request(`/v2/orders/${orderId}`, { method: 'DELETE' });
  }
  
  private async getQuote(symbol: string): Promise<unknown> {
    // Use market data API
    return this.request(`/v2/stocks/${symbol}/quotes/latest`);
  }
}

// Factory function
export function createAlpacaAdapter(): IntegrationAdapter {
  return new AlpacaAdapter();
}
```

### 4. Integration Service

**File:** `src/services/integrations/integration-service.ts`

```typescript
/**
 * Integration Service
 * 
 * High-level service for managing user integrations.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import { getAdapter, listAdapters, type IntegrationCategory } from './adapter-registry.js';
import { getAuthorizationUrl, getAccessToken, revokeOAuthAccess } from './oauth-manager.js';
import { getCredentials, storeCredentials, deleteCredentials } from '../credentials/index.js';

const db = getFirestore();

// Types
export interface UserIntegration {
  user_id: string;
  integration_id: string;
  provider_id?: string;
  status: 'connected' | 'expired' | 'error' | 'disconnected';
  connected_at: Date;
  last_used_at?: Date;
  account_info?: {
    display_name?: string;
    account_id?: string;
  };
}

export interface IntegrationInfo {
  id: string;
  name: string;
  category: IntegrationCategory;
  connected: boolean;
  status?: string;
  account_info?: Record<string, unknown>;
}

/**
 * Get integration status for a user
 */
export async function getUserIntegrations(userId: string): Promise<IntegrationInfo[]> {
  const availableAdapters = listAdapters();
  const result: IntegrationInfo[] = [];
  
  for (const adapter of availableAdapters) {
    const docId = `${userId}_${adapter.id}`;
    const doc = await db.collection('user_integrations').doc(docId).get();
    
    result.push({
      id: adapter.id,
      name: adapter.name,
      category: adapter.category,
      connected: doc.exists && doc.data()?.status === 'connected',
      status: doc.exists ? doc.data()?.status : undefined,
      account_info: doc.exists ? doc.data()?.account_info : undefined,
    });
  }
  
  return result;
}

/**
 * Connect an OAuth integration
 */
export async function connectOAuthIntegration(
  userId: string,
  integrationId: string,
  redirectAfter?: string
): Promise<string> {
  const adapter = getAdapter(integrationId);
  if (!adapter) {
    throw new Error(`Unknown integration: ${integrationId}`);
  }
  
  if (adapter.authType !== 'oauth' && adapter.authType !== 'both') {
    throw new Error(`Integration ${integrationId} does not support OAuth`);
  }
  
  return getAuthorizationUrl(userId, adapter.oauthProviderId!, { redirectAfter });
}

/**
 * Connect an API key integration
 */
export async function connectApiKeyIntegration(
  userId: string,
  integrationId: string,
  credentials: Record<string, string>
): Promise<void> {
  const adapter = getAdapter(integrationId);
  if (!adapter) {
    throw new Error(`Unknown integration: ${integrationId}`);
  }
  
  if (adapter.authType !== 'api_key' && adapter.authType !== 'both') {
    throw new Error(`Integration ${integrationId} does not support API keys`);
  }
  
  // Validate credentials by doing a health check
  try {
    await adapter.initialize(credentials);
    const healthy = await adapter.healthCheck();
    if (!healthy) {
      throw new Error('Health check failed');
    }
  } catch (err) {
    throw new Error(`Invalid credentials: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  // Store credentials
  await storeCredentials(userId, integrationId, credentials);
  
  // Update integration status
  const docId = `${userId}_${integrationId}`;
  await db.collection('user_integrations').doc(docId).set({
    user_id: userId,
    integration_id: integrationId,
    status: 'connected',
    connected_at: Timestamp.now(),
  });
  
  getLogger().info({ userId, integrationId }, 'API key integration connected');
}

/**
 * Disconnect an integration
 */
export async function disconnectIntegration(
  userId: string,
  integrationId: string
): Promise<void> {
  const adapter = getAdapter(integrationId);
  if (!adapter) {
    throw new Error(`Unknown integration: ${integrationId}`);
  }
  
  // Revoke OAuth if applicable
  if (adapter.authType === 'oauth' || adapter.authType === 'both') {
    try {
      await revokeOAuthAccess(userId, adapter.oauthProviderId!);
    } catch {
      // Ignore revocation errors
    }
  }
  
  // Delete credentials
  await deleteCredentials(userId, integrationId);
  
  // Update status
  const docId = `${userId}_${integrationId}`;
  await db.collection('user_integrations').doc(docId).update({
    status: 'disconnected',
  });
  
  getLogger().info({ userId, integrationId }, 'Integration disconnected');
}

/**
 * Execute a method on an integration
 */
export async function executeIntegrationMethod(
  userId: string,
  integrationId: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const adapter = getAdapter(integrationId);
  if (!adapter) {
    throw new Error(`Unknown integration: ${integrationId}`);
  }
  
  // Get credentials
  let credentials: Record<string, string> = {};
  
  if (adapter.authType === 'oauth' || adapter.authType === 'both') {
    const accessToken = await getAccessToken(userId, adapter.oauthProviderId!);
    if (accessToken) {
      credentials.accessToken = accessToken;
    }
  }
  
  if (!credentials.accessToken && (adapter.authType === 'api_key' || adapter.authType === 'both')) {
    const apiCreds = await getCredentials(userId, integrationId);
    if (apiCreds) {
      credentials = { ...credentials, ...apiCreds };
    }
  }
  
  if (Object.keys(credentials).length === 0) {
    throw new Error(`No credentials for integration: ${integrationId}`);
  }
  
  // Initialize and execute
  await adapter.initialize(credentials);
  const result = await adapter.execute(method, params);
  
  // Update last used
  const docId = `${userId}_${integrationId}`;
  await db.collection('user_integrations').doc(docId).update({
    last_used_at: Timestamp.now(),
  });
  
  return result;
}
```

### 5. Frontend: Integration Settings UI

**File:** `frontend-typescript/src/ui/settings/integrations.ts`

```typescript
/**
 * Integration Settings UI
 * 
 * Allows users to manage their connected integrations.
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

interface Integration {
  id: string;
  name: string;
  category: string;
  connected: boolean;
  status?: string;
  account_info?: {
    display_name?: string;
  };
}

export class IntegrationsSettingsUI {
  private container: HTMLElement;
  private integrations: Integration[] = [];
  
  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }
  
  async loadIntegrations(): Promise<void> {
    try {
      const response = await fetch('/api/user/integrations');
      this.integrations = await response.json();
      this.render();
    } catch (err) {
      console.error('Failed to load integrations:', err);
    }
  }
  
  private render(): void {
    this.container.innerHTML = `
      <div class="integrations-settings">
        <h2>Connected Services</h2>
        <p class="subtitle">Connect your accounts to enable powerful agent capabilities</p>
        
        <div class="integrations-grid">
          ${this.renderCategory('broker', 'Trading & Investments', '📈')}
          ${this.renderCategory('calendar', 'Calendar & Scheduling', '📅')}
          ${this.renderCategory('smart-home', 'Smart Home', '🏠')}
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }
  
  private renderCategory(category: string, title: string, icon: string): string {
    const categoryIntegrations = this.integrations.filter(i => i.category === category);
    
    if (categoryIntegrations.length === 0) {
      return '';
    }
    
    return `
      <div class="integration-category">
        <h3>${icon} ${title}</h3>
        <div class="integration-list">
          ${categoryIntegrations.map(i => this.renderIntegration(i)).join('')}
        </div>
      </div>
    `;
  }
  
  private renderIntegration(integration: Integration): string {
    const statusClass = integration.connected ? 'connected' : 'disconnected';
    const statusText = integration.connected 
      ? (integration.account_info?.display_name || 'Connected')
      : 'Not connected';
    
    return `
      <div class="integration-card ${statusClass}" data-id="${integration.id}">
        <div class="integration-info">
          <span class="integration-name">${integration.name}</span>
          <span class="integration-status">${statusText}</span>
        </div>
        <button class="integration-action" data-action="${integration.connected ? 'disconnect' : 'connect'}">
          ${integration.connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    `;
  }
  
  private attachEventListeners(): void {
    this.container.querySelectorAll('.integration-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('.integration-card');
        const id = card?.getAttribute('data-id');
        const action = (e.target as HTMLElement).getAttribute('data-action');
        
        if (id && action) {
          this.handleAction(id, action as 'connect' | 'disconnect');
        }
      });
    });
  }
  
  private async handleAction(integrationId: string, action: 'connect' | 'disconnect'): Promise<void> {
    if (action === 'connect') {
      // Check if OAuth or API key
      const integration = this.integrations.find(i => i.id === integrationId);
      
      // For OAuth, redirect to authorization
      const response = await fetch(`/api/integrations/${integrationId}/connect`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.redirect_url) {
        // OAuth flow
        window.location.href = data.redirect_url;
      } else if (data.requires_api_key) {
        // Show API key modal
        this.showApiKeyModal(integrationId, data.fields);
      }
    } else {
      // Disconnect
      if (confirm('Are you sure you want to disconnect this integration?')) {
        await fetch(`/api/integrations/${integrationId}/disconnect`, {
          method: 'POST',
        });
        await this.loadIntegrations();
      }
    }
  }
  
  private showApiKeyModal(integrationId: string, fields: Array<{ key: string; label: string; type: string }>): void {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Connect ${integrationId}</h3>
        <form id="api-key-form">
          ${fields.map(f => `
            <div class="form-field">
              <label for="${f.key}">${f.label}</label>
              <input type="${f.type === 'secret' ? 'password' : 'text'}" 
                     id="${f.key}" 
                     name="${f.key}" 
                     required />
            </div>
          `).join('')}
          <div class="modal-actions">
            <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="btn-primary">Connect</button>
          </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Animate in
    modal.animate([
      { opacity: 0 },
      { opacity: 1 },
    ], { duration: DURATION.NORMAL, easing: EASING.STANDARD });
    
    // Event listeners
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      modal.remove();
    });
    
    modal.querySelector('form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const credentials: Record<string, string> = {};
      formData.forEach((value, key) => {
        credentials[key] = value as string;
      });
      
      try {
        await fetch(`/api/integrations/${integrationId}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentials }),
        });
        modal.remove();
        await this.loadIntegrations();
      } catch (err) {
        alert('Failed to connect. Please check your credentials.');
      }
    });
  }
}
```

### 6. API Routes

**File:** `src/api/routes/integrations.ts`

```typescript
/**
 * Integration API Routes
 */

import { Router } from 'express';
import { 
  getUserIntegrations,
  connectOAuthIntegration,
  connectApiKeyIntegration,
  disconnectIntegration,
} from '../../services/integrations/integration-service.js';
import { handleOAuthCallback } from '../../services/integrations/oauth-manager.js';
import { getAdapter } from '../../services/integrations/adapter-registry.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

// Get user's integrations
router.get('/user/integrations', authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const integrations = await getUserIntegrations(userId);
  res.json(integrations);
});

// Start connection flow
router.post('/integrations/:id/connect', authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const integrationId = req.params.id;
  const { credentials } = req.body;
  
  const adapter = getAdapter(integrationId);
  if (!adapter) {
    return res.status(404).json({ error: 'Unknown integration' });
  }
  
  if (credentials) {
    // API key flow
    try {
      await connectApiKeyIntegration(userId, integrationId, credentials);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  } else if (adapter.authType === 'oauth' || adapter.authType === 'both') {
    // OAuth flow
    const redirectUrl = await connectOAuthIntegration(
      userId, 
      integrationId,
      req.headers.referer
    );
    res.json({ redirect_url: redirectUrl });
  } else {
    // Need API keys
    res.json({ 
      requires_api_key: true,
      fields: [
        { key: 'api_key', label: 'API Key', type: 'secret' },
        { key: 'api_secret', label: 'API Secret', type: 'secret' },
      ],
    });
  }
});

// OAuth callback
router.get('/oauth/callback/:provider', async (req, res) => {
  const { provider } = req.params;
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect(`/settings/integrations?error=${error}`);
  }
  
  try {
    const result = await handleOAuthCallback(
      provider,
      code as string,
      state as string
    );
    res.redirect(result.redirectAfter || '/settings/integrations?success=true');
  } catch (err) {
    res.redirect(`/settings/integrations?error=${encodeURIComponent((err as Error).message)}`);
  }
});

// Disconnect
router.post('/integrations/:id/disconnect', authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const integrationId = req.params.id;
  
  try {
    await disconnectIntegration(userId, integrationId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
```

---

## Testing Plan

### OAuth Flow Tests

```typescript
describe('OAuth Flow', () => {
  it('generates correct authorization URL', async () => {
    const url = await getAuthorizationUrl('user123', 'alpaca');
    expect(url).toContain('client_id=');
    expect(url).toContain('scope=');
    expect(url).toContain('state=');
  });
  
  it('handles callback and stores tokens', async () => {
    // Mock token exchange
    const result = await handleOAuthCallback('alpaca', 'test-code', 'test-state');
    expect(result.userId).toBe('user123');
  });
  
  it('refreshes expired tokens', async () => {
    // Set up expired token
    // Request access token
    // Verify refresh was called
  });
});
```

### Integration Tests

```typescript
describe('Integration Service', () => {
  it('lists available integrations', async () => {
    const integrations = await getUserIntegrations('user123');
    expect(integrations).toContainEqual(
      expect.objectContaining({ id: 'alpaca', category: 'broker' })
    );
  });
  
  it('executes integration method', async () => {
    await connectApiKeyIntegration('user123', 'alpaca', {
      api_key: 'test-key',
      api_secret: 'test-secret',
    });
    
    const result = await executeIntegrationMethod('user123', 'alpaca', 'get-account', {});
    expect(result).toHaveProperty('account_number');
  });
});
```

---

## Acceptance Criteria

- [ ] OAuth flow works for Schwab, Alpaca, Google Calendar
- [ ] Tokens refresh automatically before expiration
- [ ] API key integrations work (Alpaca paper trading)
- [ ] UI shows integration status correctly
- [ ] Connect/disconnect works from UI
- [ ] Adapters correctly translate tool calls to API calls
- [ ] Health checks identify broken integrations
- [ ] Token revocation works
- [ ] Error messages are user-friendly

---

## File Structure After Phase 3

```
src/services/integrations/
├── index.ts
├── oauth-manager.ts
├── integration-service.ts
├── adapter-registry.ts
├── adapters/
│   ├── alpaca-adapter.ts
│   ├── schwab-adapter.ts
│   ├── google-calendar-adapter.ts
│   └── index.ts
└── __tests__/
    ├── oauth-manager.test.ts
    └── integration-service.test.ts

frontend-typescript/src/ui/settings/
├── integrations.ts
└── integrations.css

src/api/routes/
└── integrations.ts
```

---

## Estimated Effort

| Task | Hours |
|------|-------|
| OAuth manager | 24 |
| Token refresh logic | 12 |
| Adapter framework | 16 |
| Alpaca adapter | 12 |
| Schwab adapter | 16 |
| Google Calendar adapter | 12 |
| Integration service | 16 |
| Frontend UI | 24 |
| API routes | 8 |
| Testing | 32 |
| Documentation | 8 |
| **Total** | **180 hours (~4-5 weeks)** |

---

## Security Checklist

- [ ] OAuth state is cryptographically random and short-lived
- [ ] Tokens are encrypted at rest with Cloud KMS
- [ ] Refresh tokens are stored separately from access tokens
- [ ] All OAuth redirects use HTTPS
- [ ] CSRF protection on all endpoints
- [ ] Rate limiting on OAuth endpoints
- [ ] Audit logging for all token operations
- [ ] Automatic revocation on suspicious activity

