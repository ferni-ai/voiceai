/**
 * Sonos Smart Home Integration
 *
 * Controls Sonos speakers for vibe and music playback.
 * Uses Sonos Cloud API (OAuth 2.0) for control.
 *
 * Features:
 * - Auto-refresh tokens on 401 errors
 * - Circuit breaker to prevent cascading failures
 * - Graceful degradation when Sonos is unavailable
 *
 * Setup: https://developer.sonos.com/
 * 1. Create app at developer.sonos.com
 * 2. Get OAuth credentials
 * 3. User authorizes via our OAuth flow
 */
/**
 * Get circuit breaker status (for diagnostics)
 */
export declare function getSonosCircuitBreakerStatus(): {
    isOpen: boolean;
    failures: number;
    nextRetryIn: number | null;
};
/**
 * Reset circuit breaker (for testing/admin)
 */
export declare function resetSonosCircuitBreaker(): void;
/**
 * Callback type for when tokens are refreshed
 * This allows the caller to persist the new tokens
 */
export type TokenRefreshCallback = (newCredentials: SonosCredentials) => Promise<void>;
/**
 * Register a callback to be called when tokens are refreshed
 */
export declare function setTokenRefreshCallback(callback: TokenRefreshCallback): void;
export interface SonosCredentials {
    accessToken: string;
    refreshToken: string;
    tokenExpiry?: number;
    householdId?: string;
}
export interface SonosHousehold {
    id: string;
    name: string;
}
export interface SonosGroup {
    id: string;
    name: string;
    playbackState: 'playing' | 'paused' | 'idle';
    volume: number;
    muted: boolean;
    coordinatorId: string;
}
export interface SonosPlayer {
    id: string;
    name: string;
    icon: string;
    websocketUrl: string;
    softwareVersion: string;
    capabilities: string[];
}
export interface SonosTrack {
    name: string;
    artist?: string;
    album?: string;
    imageUrl?: string;
    service?: string;
}
/**
 * Sonos API error with status code
 */
export declare class SonosApiError extends Error {
    statusCode: number;
    endpoint: string;
    constructor(message: string, statusCode: number, endpoint: string);
}
/**
 * Get all households (homes) the user has access to
 */
export declare function getHouseholds(credentials: SonosCredentials): Promise<SonosHousehold[]>;
/**
 * Get all player groups in a household
 */
export declare function getGroups(credentials: SonosCredentials, householdId: string): Promise<SonosGroup[]>;
/**
 * Get all players in a household
 */
export declare function getPlayers(credentials: SonosCredentials, householdId: string): Promise<SonosPlayer[]>;
/**
 * Play/pause a group
 */
export declare function setPlaybackState(credentials: SonosCredentials, groupId: string, action: 'play' | 'pause' | 'togglePlayPause'): Promise<void>;
/**
 * Skip to next track
 */
export declare function skipToNext(credentials: SonosCredentials, groupId: string): Promise<void>;
/**
 * Skip to previous track
 */
export declare function skipToPrevious(credentials: SonosCredentials, groupId: string): Promise<void>;
/**
 * Get current playback status
 */
export declare function getPlaybackStatus(credentials: SonosCredentials, groupId: string): Promise<{
    playbackState: string;
    positionMillis: number;
    playModes: {
        repeat: boolean;
        repeatOne: boolean;
        shuffle: boolean;
        crossfade: boolean;
    };
}>;
/**
 * Get current track info
 */
export declare function getCurrentTrack(credentials: SonosCredentials, groupId: string): Promise<SonosTrack | null>;
/**
 * Get group volume
 */
export declare function getGroupVolume(credentials: SonosCredentials, groupId: string): Promise<{
    volume: number;
    muted: boolean;
    fixed: boolean;
}>;
/**
 * Set group volume (0-100)
 */
export declare function setGroupVolume(credentials: SonosCredentials, groupId: string, volume: number): Promise<void>;
/**
 * Set group mute state
 */
export declare function setGroupMute(credentials: SonosCredentials, groupId: string, muted: boolean): Promise<void>;
/**
 * Adjust volume relative (positive to increase, negative to decrease)
 */
export declare function adjustVolume(credentials: SonosCredentials, groupId: string, delta: number): Promise<void>;
/**
 * Get user's Sonos favorites
 */
export declare function getFavorites(credentials: SonosCredentials, householdId: string): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    service?: string;
}>>;
/**
 * Play a favorite
 */
export declare function playFavorite(credentials: SonosCredentials, groupId: string, favoriteId: string): Promise<void>;
/**
 * Set volume across all groups for a vibe
 */
export declare function setAllGroupsVolume(credentials: SonosCredentials, volume: number): Promise<void>;
/**
 * Find and play a vibe-appropriate playlist/favorite
 */
export declare function playVibeMusic(credentials: SonosCredentials, vibe: string, targetRoom?: string): Promise<boolean>;
/**
 * Generate OAuth authorization URL
 */
export declare function getAuthorizationUrl(clientId: string, redirectUri: string, state: string): string;
/**
 * Exchange authorization code for tokens
 */
export declare function exchangeCodeForTokens(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}>;
/**
 * Refresh access token
 */
export declare function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}>;
/**
 * Test Sonos connection
 */
export declare function testConnection(credentials: SonosCredentials): Promise<{
    connected: boolean;
    households: number;
    players: number;
    error?: string;
}>;
//# sourceMappingURL=sonos.d.ts.map