/**
 * Integration Hub
 *
 * Central registry and manager for all external API integrations.
 * Provides unified access to OAuth, rate limiting, and API clients.
 *
 * @module services/integrations/integration-hub
 */
import type { IntegrationConfig, IntegrationConnection, IntegrationRegistry, AuthType, ConnectionStatus, ApiRequestConfig, ApiResponse } from './types.js';
/**
 * All supported integrations with their configurations
 */
export declare const INTEGRATIONS: Record<string, IntegrationConfig>;
/**
 * Central hub for managing all external integrations
 */
export declare class IntegrationHub implements IntegrationRegistry {
    private connections;
    private oauthManager;
    private rateLimiter;
    constructor();
    get(id: string): IntegrationConfig | undefined;
    getAll(): IntegrationConfig[];
    getEnabled(): IntegrationConfig[];
    getByAuthType(authType: AuthType): IntegrationConfig[];
    /**
     * Get a user's connection to an integration
     */
    getConnection(userId: string, integrationId: string): IntegrationConnection | undefined;
    /**
     * Get all connections for a user
     */
    getUserConnections(userId: string): IntegrationConnection[];
    /**
     * Check if a user is connected to an integration
     * Now checks Firestore first, then falls back to in-memory
     */
    isConnected(userId: string, integrationId: string): boolean;
    /**
     * Async version of isConnected that checks Firestore
     */
    isConnectedAsync(userId: string, integrationId: string): Promise<boolean>;
    /**
     * Store a connection
     */
    setConnection(connection: IntegrationConnection): void;
    /**
     * Remove a connection
     */
    removeConnection(userId: string, integrationId: string): boolean;
    /**
     * Generate OAuth authorization URL for a user
     */
    getAuthorizationUrl(userId: string, integrationId: string, redirectPath?: string): Promise<string>;
    /**
     * Handle OAuth callback and store tokens
     */
    handleOAuthCallback(code: string, state: string): Promise<{
        userId: string;
        integrationId: string;
        success: boolean;
    }>;
    /**
     * Refresh OAuth tokens for a connection
     */
    refreshTokens(userId: string, integrationId: string): Promise<boolean>;
    /**
     * Make an authenticated API request to an integration
     * Uses Firestore-persisted tokens with automatic refresh
     */
    request<T>(userId: string, integrationId: string, config: ApiRequestConfig): Promise<ApiResponse<T>>;
    /**
     * Get status of all integrations for a user
     */
    getIntegrationStatus(userId: string): Array<{
        integration: IntegrationConfig;
        status: ConnectionStatus;
        connectedAt?: Date;
    }>;
}
export declare function getIntegrationHub(): IntegrationHub;
export declare function resetIntegrationHub(): void;
//# sourceMappingURL=integration-hub.d.ts.map