/**
 * Sonos Music Search & Playback Service
 *
 * Provides music search and playback capabilities for Sonos speakers.
 * Uses the Sonos Cloud API to:
 * - Search through user's connected music services (Spotify, Apple Music, etc.)
 * - Play music on specific rooms/groups
 * - Play from Sonos favorites
 *
 * Features:
 * - Automatic token refresh on 401 errors
 * - Credential persistence after refresh
 * - Circuit breaker integration
 *
 * @see https://developer.sonos.com/reference/control-api/
 */
import { type SonosCredentials, type SonosGroup } from './sonos.js';
/**
 * Create a token refresh callback for a specific user
 * This ensures refreshed tokens get persisted to Firestore
 */
export declare function createTokenRefreshHandler(userId: string): void;
/**
 * Check if Sonos service is available (circuit breaker status)
 */
export declare function isSonosAvailable(): boolean;
export interface SonosMusicService {
    name: string;
    imageUrl?: string;
    id: string;
}
export interface SonosSearchResult {
    id: string;
    name: string;
    artist?: string;
    album?: string;
    imageUrl?: string;
    type: 'track' | 'album' | 'playlist' | 'station';
    serviceId: string;
    serviceName: string;
}
export interface SonosPlayResult {
    success: boolean;
    message: string;
    room?: string;
    track?: {
        name: string;
        artist?: string;
    };
}
export interface SonosRoomConfig {
    groupId: string;
    groupName: string;
    householdId: string;
}
/**
 * Get the user's last used room
 */
export declare function getLastUsedRoom(userId: string): SonosRoomConfig | undefined;
/**
 * Set the user's last used room
 */
export declare function setLastUsedRoom(userId: string, room: SonosRoomConfig): void;
/**
 * Match a room name from natural language to available Sonos groups
 * Uses fuzzy matching for flexibility
 */
export declare function matchRoomName(query: string, groups: SonosGroup[]): SonosGroup | null;
/**
 * Get all available rooms/groups for a user
 */
export declare function getAvailableRooms(credentials: SonosCredentials): Promise<SonosRoomConfig[]>;
/**
 * Search user's Sonos favorites by name
 */
export declare function searchFavorites(credentials: SonosCredentials, query: string): Promise<Array<{
    id: string;
    name: string;
    imageUrl?: string;
}>>;
/**
 * Play a Sonos favorite on a specific room
 */
export declare function playSonosFavorite(credentials: SonosCredentials, userId: string, favoriteName: string, roomName?: string): Promise<SonosPlayResult>;
/**
 * Play music by searching through user's connected music services
 * This is the main entry point for "Play jazz on living room Sonos"
 *
 * Features:
 * - Automatic token refresh on 401 errors
 * - Circuit breaker for graceful degradation
 * - Vibe matching when exact favorites not found
 */
export declare function playSonosMusic(credentials: SonosCredentials, userId: string, query: string, roomName?: string): Promise<SonosPlayResult>;
/**
 * Pause playback on a Sonos room
 */
export declare function pauseSonos(credentials: SonosCredentials, userId: string, roomName?: string): Promise<SonosPlayResult>;
/**
 * Resume playback on a Sonos room
 */
export declare function resumeSonos(credentials: SonosCredentials, userId: string, roomName?: string): Promise<SonosPlayResult>;
/**
 * Set volume on a Sonos room
 */
export declare function setSonosVolume(credentials: SonosCredentials, userId: string, volume: number, roomName?: string): Promise<SonosPlayResult>;
/**
 * Get what's currently playing on Sonos
 */
export declare function getSonosNowPlaying(credentials: SonosCredentials, userId: string, roomName?: string): Promise<SonosPlayResult>;
//# sourceMappingURL=sonos-music.d.ts.map