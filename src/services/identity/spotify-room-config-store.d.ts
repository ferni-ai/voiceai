/**
 * Spotify Room Config Store
 *
 * Firestore persistence for room configurations.
 * Maps Spotify devices to user-defined rooms for multi-room playback.
 *
 * Path: bogle_users/{userId}/spotify_room_config/config
 */
import type { CreateRoomGroupInput, CreateRoomInput, RoomResult, SpotifyRoom, SpotifyRoomConfig, SpotifyRoomGroup, UpdateRoomInput } from './spotify-room-types.js';
/**
 * Get user's room configuration
 */
export declare function getRoomConfig(userId: string): Promise<RoomResult<SpotifyRoomConfig>>;
/**
 * Create a new room
 */
export declare function createRoom(userId: string, input: CreateRoomInput): Promise<RoomResult<SpotifyRoom>>;
/**
 * Update an existing room
 */
export declare function updateRoom(userId: string, input: UpdateRoomInput): Promise<RoomResult<SpotifyRoom>>;
/**
 * Delete a room
 */
export declare function deleteRoom(userId: string, roomId: string): Promise<RoomResult<void>>;
/**
 * Set the default room
 */
export declare function setDefaultRoom(userId: string, roomId: string | null): Promise<RoomResult<void>>;
/**
 * Create a room group
 */
export declare function createRoomGroup(userId: string, input: CreateRoomGroupInput): Promise<RoomResult<SpotifyRoomGroup>>;
/**
 * Delete a room group
 */
export declare function deleteRoomGroup(userId: string, groupId: string): Promise<RoomResult<void>>;
/**
 * Find a room by name (case-insensitive, fuzzy)
 */
export declare function findRoomByName(userId: string, roomName: string): Promise<RoomResult<SpotifyRoom>>;
/**
 * Find a room group by name (case-insensitive, fuzzy)
 */
export declare function findRoomGroupByName(userId: string, groupName: string): Promise<RoomResult<SpotifyRoomGroup & {
    roomIds: string[];
}>>;
/**
 * Get all device IDs for a room (or rooms in a group)
 */
export declare function getDevicesForRoom(userId: string, roomOrGroupName: string): Promise<RoomResult<string[]>>;
/**
 * Get the default room
 */
export declare function getDefaultRoom(userId: string): Promise<RoomResult<SpotifyRoom | null>>;
/**
 * List all rooms (for voice tool response)
 */
export declare function listRooms(userId: string): Promise<RoomResult<{
    rooms: SpotifyRoom[];
    groups: SpotifyRoomGroup[];
    defaultRoomId: string | null;
}>>;
/**
 * Clear cache for a user (call on session end)
 */
export declare function clearUserCache(userId: string): void;
/**
 * Clear all caches (for testing/reset)
 */
export declare function clearAllCaches(): void;
//# sourceMappingURL=spotify-room-config-store.d.ts.map