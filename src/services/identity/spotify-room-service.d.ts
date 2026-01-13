/**
 * Spotify Room Service
 *
 * Bridges Spotify devices with room configuration.
 * Handles device discovery, room-based playback, and transfers.
 */
import type { ListRoomsResult, PlayInRoomResult, RoomResult, SpotifyDevice, TransferRoomResult } from './spotify-room-types.js';
/**
 * Get all available Spotify devices for the user
 */
export declare function discoverDevices(): Promise<RoomResult<SpotifyDevice[]>>;
/**
 * Get devices that are NOT assigned to any room yet
 */
export declare function getUnassignedDevices(userId: string): Promise<RoomResult<SpotifyDevice[]>>;
/**
 * Play music in a specific room
 */
export declare function playInRoom(userId: string, roomName: string, options: {
    query?: string;
    contextUri?: string;
    uris?: string[];
}): Promise<PlayInRoomResult>;
/**
 * Transfer playback from one room to another
 */
export declare function transferToRoom(userId: string, toRoomName: string): Promise<TransferRoomResult>;
/**
 * Set volume in a specific room
 */
export declare function setRoomVolume(userId: string, roomName: string, volume: number): Promise<RoomResult<void>>;
/**
 * Get rooms formatted for voice response
 */
export declare function getRoomsForVoice(userId: string): Promise<ListRoomsResult>;
export { createRoom, updateRoom, deleteRoom, getRoomConfig, findRoomByName, getDefaultRoom, } from './spotify-room-config-store.js';
//# sourceMappingURL=spotify-room-service.d.ts.map