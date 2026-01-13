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
import type { OAuthTokens, ConnectionStatus } from './types.js';
export interface StoredOAuthToken {
    provider: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
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
}
/**
 * Save OAuth tokens for a user and provider
 */
export declare function saveOAuthTokens(userId: string, provider: string, tokens: OAuthTokens, metadata?: Record<string, unknown>): Promise<TokenStoreResult>;
/**
 * Get OAuth tokens for a user and provider
 */
export declare function getOAuthTokens(userId: string, provider: string): Promise<OAuthTokens | null>;
/**
 * Update OAuth tokens after refresh
 */
export declare function updateOAuthTokens(userId: string, provider: string, tokens: OAuthTokens): Promise<TokenStoreResult>;
/**
 * Delete OAuth tokens (disconnect integration)
 */
export declare function deleteOAuthTokens(userId: string, provider: string): Promise<TokenStoreResult>;
/**
 * Get connection status for a provider
 */
export declare function getConnectionStatus(userId: string, provider: string): Promise<{
    connected: boolean;
    status: ConnectionStatus;
    connectedAt?: string;
    expiresAt?: string;
    scopes?: string[];
}>;
/**
 * Get all connected integrations for a user
 */
export declare function getConnectedIntegrations(userId: string): Promise<Array<{
    provider: string;
    status: ConnectionStatus;
    connectedAt: string;
    scopes: string[];
}>>;
/**
 * Mark a connection as having an error
 */
export declare function markConnectionError(userId: string, provider: string, error: string): Promise<void>;
/**
 * Check if tokens need refresh (expires within buffer period)
 */
export declare function needsRefresh(userId: string, provider: string, bufferMinutes?: number): Promise<boolean>;
//# sourceMappingURL=oauth-token-store.d.ts.map