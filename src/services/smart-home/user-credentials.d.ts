/**
 * Smart Home User Credentials Service
 *
 * Loads and manages per-user smart home credentials from Firestore.
 * This is the bridge between the UI (which saves credentials) and
 * the smart-home tools (which need to use them).
 *
 * SECURITY: Sensitive credentials are encrypted at rest using AES-256-GCM.
 * Sensitive fields: Hue username (API key), LIFX token, Sonos access/refresh tokens
 */
export interface HueCredentials {
    bridgeIp: string;
    username: string;
    connectedAt?: string;
}
export interface LifxCredentials {
    token: string;
    connectedAt?: string;
}
export interface SonosCredentials {
    accessToken: string;
    refreshToken: string;
    tokenExpiry?: number;
    householdId?: string;
    connectedAt?: string;
}
export interface HomeKitCredentials {
    enabled: boolean;
    homeId?: string;
    homeName?: string;
    deviceCount?: number;
    connectedAt?: string;
}
export interface SmartHomeCredentials {
    hue: HueCredentials | null;
    lifx: LifxCredentials | null;
    sonos: SonosCredentials | null;
    homeKit: HomeKitCredentials | null;
}
export interface SmartHomeSetupState {
    completedIntegrations: string[];
    lastSetupDate: string | null;
    setupStartedAt: string | null;
    setupAbandoned: boolean;
}
/**
 * Load all smart home credentials for a user
 */
export declare function getUserSmartHomeCredentials(userId: string): Promise<SmartHomeCredentials>;
/**
 * Get specific credential type for a user
 */
export declare function getCredential<K extends keyof SmartHomeCredentials>(userId: string, type: K): Promise<SmartHomeCredentials[K]>;
/**
 * Save credentials for a specific integration
 * Encrypts sensitive fields before storing in Firestore
 */
export declare function saveCredential<K extends keyof SmartHomeCredentials>(userId: string, type: K, credentials: NonNullable<SmartHomeCredentials[K]>): Promise<boolean>;
/**
 * Delete credentials for a specific integration
 */
export declare function deleteCredential(userId: string, type: keyof SmartHomeCredentials): Promise<boolean>;
/**
 * Get the user's smart home setup state
 */
export declare function getSetupState(userId: string): Promise<SmartHomeSetupState>;
/**
 * Mark setup as started (for tracking abandonment)
 */
export declare function markSetupStarted(userId: string): Promise<void>;
/**
 * Mark setup as abandoned (user left without completing)
 */
export declare function markSetupAbandoned(userId: string): Promise<void>;
/**
 * Check if user has any smart home integrations configured
 */
export declare function hasAnySmartHomeIntegration(userId: string): Promise<boolean>;
/**
 * Check if a specific integration is configured
 */
export declare function isIntegrationConfigured(userId: string, type: keyof SmartHomeCredentials): Promise<boolean>;
/**
 * Get a summary of configured integrations
 */
export declare function getConfiguredIntegrations(userId: string): Promise<string[]>;
//# sourceMappingURL=user-credentials.d.ts.map