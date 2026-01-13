/**
 * OAuth Manager
 *
 * Handles OAuth2 authentication flows for all integrations.
 * Supports authorization code flow with PKCE.
 * Tokens are persisted to Firestore with encryption.
 *
 * @module services/integrations/oauth-manager
 */
import type { OAuthTokens } from './types.js';
export declare class OAuthManager {
    private pendingStates;
    private readonly stateExpiryMs;
    private readonly tokenRefreshBufferMs;
    constructor();
    /**
     * Generate OAuth authorization URL for a user to connect an integration
     */
    getAuthorizationUrl(userId: string, integrationId: string, redirectPath?: string): string;
    /**
     * Handle OAuth callback with authorization code
     * Saves tokens to Firestore on success
     */
    handleCallback(code: string, stateToken: string): Promise<{
        userId: string;
        integrationId: string;
        success: boolean;
        tokens?: OAuthTokens;
        error?: string;
        redirectPath?: string;
    }>;
    /**
     * Get valid OAuth tokens for a user and integration
     * Automatically refreshes if expired or about to expire
     */
    getValidTokens(userId: string, integrationId: string): Promise<OAuthTokens | null>;
    /**
     * Refresh tokens and save to Firestore
     */
    private refreshAndSaveTokens;
    /**
     * Disconnect an integration (revoke and delete tokens)
     */
    disconnect(userId: string, integrationId: string): Promise<boolean>;
    /**
     * Check if a user has connected an integration
     */
    isConnected(userId: string, integrationId: string): Promise<boolean>;
    /**
     * Get connection status for an integration
     */
    getStatus(userId: string, integrationId: string): Promise<{
        connected: boolean;
        status: string;
        connectedAt?: string;
        expiresAt?: string;
        scopes?: string[];
    }>;
    /**
     * Get all connected integrations for a user
     */
    getConnections(userId: string): Promise<Array<{
        provider: string;
        status: string;
        connectedAt: string;
        scopes: string[];
    }>>;
    /**
     * Refresh OAuth tokens using refresh token
     */
    refreshTokens(integrationId: string, refreshToken: string): Promise<OAuthTokens | null>;
    /**
     * Get list of available OAuth integrations
     */
    getAvailableIntegrations(): Array<{
        id: string;
        name: string;
        scopes: string[];
        configured: boolean;
    }>;
    /**
     * Get display name for an integration
     */
    private getIntegrationDisplayName;
    /**
     * Get full OAuth config for an integration
     */
    private getConfig;
    /**
     * Exchange authorization code for tokens
     */
    private exchangeCodeForTokens;
    /**
     * Encode state object to string
     */
    private encodeState;
    /**
     * Decode and validate state token
     */
    private decodeAndValidateState;
    /**
     * Clean up expired pending states
     */
    private cleanupExpiredStates;
}
export declare function getOAuthManager(): OAuthManager;
//# sourceMappingURL=oauth-manager.d.ts.map