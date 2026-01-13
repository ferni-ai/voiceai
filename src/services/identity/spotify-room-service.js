/**
 * Spotify Room Service
 *
 * Bridges Spotify devices with room configuration.
 * Handles device discovery, room-based playback, and transfers.
 */
import { getSpotifyAccessToken, isSpotifyConfigured } from './spotify-auth.js';
import { findRoomByName, getDevicesForRoom, getRoomConfig, listRooms, } from './spotify-room-config-store.js';
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'spotify-room-service' });
// Spotify API
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
// ============================================================================
// DEVICE DISCOVERY
// ============================================================================
/**
 * Get all available Spotify devices for the user
 */
export async function discoverDevices() {
    if (!isSpotifyConfigured()) {
        return { success: false, error: 'Spotify not configured' };
    }
    const token = await getSpotifyAccessToken();
    if (!token) {
        return { success: false, error: 'Could not get Spotify access token' };
    }
    try {
        const response = await fetch(`${SPOTIFY_API_BASE}/me/player/devices`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (!response.ok) {
            log.error({ status: response.status }, 'Failed to fetch Spotify devices');
            return { success: false, error: 'Failed to fetch devices from Spotify' };
        }
        const data = (await response.json());
        log.debug({ deviceCount: data.devices?.length ?? 0 }, 'Discovered Spotify devices');
        return { success: true, data: data.devices || [] };
    }
    catch (error) {
        log.error({ error: String(error) }, 'Error discovering Spotify devices');
        return { success: false, error: 'Failed to discover devices' };
    }
}
/**
 * Get devices that are NOT assigned to any room yet
 */
export async function getUnassignedDevices(userId) {
    const devicesResult = await discoverDevices();
    if (!devicesResult.success || !devicesResult.data) {
        return devicesResult;
    }
    const configResult = await getRoomConfig(userId);
    if (!configResult.success || !configResult.data) {
        return devicesResult; // All devices are unassigned
    }
    const assignedDeviceIds = new Set(configResult.data.rooms.flatMap((r) => r.deviceIds));
    const unassigned = devicesResult.data.filter((d) => !assignedDeviceIds.has(d.id));
    return { success: true, data: unassigned };
}
// ============================================================================
// ROOM-BASED PLAYBACK
// ============================================================================
/**
 * Play music in a specific room
 */
export async function playInRoom(userId, roomName, options) {
    // Find the room
    const roomResult = await findRoomByName(userId, roomName);
    if (!roomResult.success || !roomResult.data) {
        // Try as a group
        const devicesResult = await getDevicesForRoom(userId, roomName);
        if (!devicesResult.success || !devicesResult.data?.length) {
            return {
                success: false,
                roomName,
                deviceNames: [],
                error: roomResult.error || `Room "${roomName}" not found`,
            };
        }
        // It's a group, play on all devices
        return playOnDevices(devicesResult.data, roomName, options);
    }
    const room = roomResult.data;
    if (room.deviceIds.length === 0) {
        return {
            success: false,
            roomName: room.name,
            deviceNames: [],
            error: `No devices configured for ${room.name}`,
        };
    }
    return playOnDevices(room.deviceIds, room.name, options, room.defaultVolume);
}
/**
 * Play music on specific device IDs
 */
async function playOnDevices(deviceIds, roomName, options, volume) {
    if (!isSpotifyConfigured()) {
        return {
            success: false,
            roomName,
            deviceNames: [],
            error: 'Spotify not configured',
        };
    }
    const token = await getSpotifyAccessToken();
    if (!token) {
        return {
            success: false,
            roomName,
            deviceNames: [],
            error: 'Could not get Spotify access token',
        };
    }
    // Get device info for response
    const devicesResult = await discoverDevices();
    const deviceMap = new Map(devicesResult.data?.map((d) => [d.id, d]) ?? []);
    // Find first available device
    const availableDeviceId = deviceIds.find((id) => deviceMap.has(id));
    if (!availableDeviceId) {
        return {
            success: false,
            roomName,
            deviceNames: [],
            error: `No devices in ${roomName} are currently online`,
        };
    }
    const device = deviceMap.get(availableDeviceId);
    try {
        // If query provided, search first
        let trackUri;
        let trackName;
        let artistName;
        if (options.query) {
            const searchResult = await searchTrack(token, options.query);
            if (searchResult) {
                trackUri = searchResult.uri;
                trackName = searchResult.name;
                artistName = searchResult.artist;
            }
            else {
                return {
                    success: false,
                    roomName,
                    deviceNames: [device.name],
                    error: `Couldn't find "${options.query}" on Spotify`,
                };
            }
        }
        // Build play request body
        const body = {};
        if (options.contextUri) {
            body.context_uri = options.contextUri;
        }
        else if (options.uris) {
            body.uris = options.uris;
        }
        else if (trackUri) {
            body.uris = [trackUri];
        }
        // Transfer to device and play
        await fetch(`${SPOTIFY_API_BASE}/me/player`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                device_ids: [availableDeviceId],
                play: true,
            }),
        });
        // Start playback
        if (Object.keys(body).length > 0) {
            await fetch(`${SPOTIFY_API_BASE}/me/player/play?device_id=${availableDeviceId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
        }
        // Set volume if specified
        if (volume !== undefined) {
            await fetch(`${SPOTIFY_API_BASE}/me/player/volume?volume_percent=${volume}&device_id=${availableDeviceId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` },
            });
        }
        log.info({ roomName, deviceName: device.name, trackName }, 'Playing music in room');
        return {
            success: true,
            roomName,
            deviceNames: [device.name],
            trackName,
            artistName,
        };
    }
    catch (error) {
        log.error({ error: String(error), roomName }, 'Failed to play in room');
        return {
            success: false,
            roomName,
            deviceNames: [device.name],
            error: 'Failed to start playback',
        };
    }
}
/**
 * Search for a track
 */
async function searchTrack(token, query) {
    try {
        const response = await fetch(`${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        const track = data.tracks?.items?.[0];
        if (!track)
            return null;
        return {
            uri: track.uri,
            name: track.name,
            artist: track.artists.map((a) => a.name).join(', '),
        };
    }
    catch {
        return null;
    }
}
// ============================================================================
// ROOM TRANSFER
// ============================================================================
/**
 * Transfer playback from one room to another
 */
export async function transferToRoom(userId, toRoomName) {
    // Find destination room
    const roomResult = await findRoomByName(userId, toRoomName);
    if (!roomResult.success || !roomResult.data) {
        // Try as a group
        const devicesResult = await getDevicesForRoom(userId, toRoomName);
        if (!devicesResult.success || !devicesResult.data?.length) {
            return {
                success: false,
                toRoom: toRoomName,
                deviceName: '',
                error: roomResult.error || `Room "${toRoomName}" not found`,
            };
        }
        // Use first device in group
        return transferToDevices(devicesResult.data, toRoomName);
    }
    const room = roomResult.data;
    if (room.deviceIds.length === 0) {
        return {
            success: false,
            toRoom: room.name,
            deviceName: '',
            error: `No devices configured for ${room.name}`,
        };
    }
    return transferToDevices(room.deviceIds, room.name, room.defaultVolume);
}
/**
 * Transfer playback to specific devices
 */
async function transferToDevices(deviceIds, roomName, volume) {
    if (!isSpotifyConfigured()) {
        return {
            success: false,
            toRoom: roomName,
            deviceName: '',
            error: 'Spotify not configured',
        };
    }
    const token = await getSpotifyAccessToken();
    if (!token) {
        return {
            success: false,
            toRoom: roomName,
            deviceName: '',
            error: 'Could not get Spotify access token',
        };
    }
    // Get current playback for "from" room
    let fromRoom;
    try {
        const currentResponse = await fetch(`${SPOTIFY_API_BASE}/me/player`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (currentResponse.ok) {
            const current = (await currentResponse.json());
            fromRoom = current.device?.name;
        }
    }
    catch {
        // Ignore - we don't need the from room name
    }
    // Get device info
    const devicesResult = await discoverDevices();
    const deviceMap = new Map(devicesResult.data?.map((d) => [d.id, d]) ?? []);
    // Find first available device
    const availableDeviceId = deviceIds.find((id) => deviceMap.has(id));
    if (!availableDeviceId) {
        return {
            success: false,
            toRoom: roomName,
            deviceName: '',
            error: `No devices in ${roomName} are currently online`,
        };
    }
    const device = deviceMap.get(availableDeviceId);
    try {
        // Transfer playback
        await fetch(`${SPOTIFY_API_BASE}/me/player`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                device_ids: [availableDeviceId],
                play: true,
            }),
        });
        // Set volume if specified
        if (volume !== undefined) {
            await fetch(`${SPOTIFY_API_BASE}/me/player/volume?volume_percent=${volume}&device_id=${availableDeviceId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` },
            });
        }
        log.info({ fromRoom, toRoom: roomName, deviceName: device.name }, 'Transferred playback');
        return {
            success: true,
            fromRoom,
            toRoom: roomName,
            deviceName: device.name,
        };
    }
    catch (error) {
        log.error({ error: String(error), roomName }, 'Failed to transfer playback');
        return {
            success: false,
            toRoom: roomName,
            deviceName: device.name,
            error: 'Failed to transfer playback',
        };
    }
}
// ============================================================================
// SET ROOM VOLUME
// ============================================================================
/**
 * Set volume in a specific room
 */
export async function setRoomVolume(userId, roomName, volume) {
    const devicesResult = await getDevicesForRoom(userId, roomName);
    if (!devicesResult.success || !devicesResult.data?.length) {
        return { success: false, error: `Room "${roomName}" not found` };
    }
    const token = await getSpotifyAccessToken();
    if (!token) {
        return { success: false, error: 'Could not get Spotify access token' };
    }
    // Get online devices
    const onlineDevices = await discoverDevices();
    const onlineIds = new Set(onlineDevices.data?.map((d) => d.id) ?? []);
    const roomDeviceIds = devicesResult.data.filter((id) => onlineIds.has(id));
    if (roomDeviceIds.length === 0) {
        return { success: false, error: `No devices in ${roomName} are online` };
    }
    try {
        // Set volume on first available device
        await fetch(`${SPOTIFY_API_BASE}/me/player/volume?volume_percent=${volume}&device_id=${roomDeviceIds[0]}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
        });
        log.info({ roomName, volume }, 'Set room volume');
        return { success: true };
    }
    catch (error) {
        log.error({ error: String(error), roomName }, 'Failed to set room volume');
        return { success: false, error: 'Failed to set volume' };
    }
}
// ============================================================================
// LIST ROOMS (VOICE RESPONSE)
// ============================================================================
/**
 * Get rooms formatted for voice response
 */
export async function getRoomsForVoice(userId) {
    const result = await listRooms(userId);
    if (!result.success || !result.data) {
        return { rooms: [], groups: [], defaultRoom: null };
    }
    const { rooms, groups, defaultRoomId } = result.data;
    // Get currently playing device
    let playingDeviceId = null;
    try {
        const token = await getSpotifyAccessToken();
        if (token) {
            const response = await fetch(`${SPOTIFY_API_BASE}/me/player`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = (await response.json());
                if (data.is_playing && data.device?.id) {
                    playingDeviceId = data.device.id;
                }
            }
        }
    }
    catch {
        // Ignore - just won't show playing status
    }
    const defaultRoom = rooms.find((r) => r.id === defaultRoomId)?.name ?? null;
    return {
        rooms: rooms.map((r) => ({
            name: r.name,
            deviceCount: r.deviceIds.length,
            isPlaying: r.deviceIds.includes(playingDeviceId ?? ''),
        })),
        groups: groups.map((g) => ({
            name: g.name,
            roomCount: g.roomIds.length,
        })),
        defaultRoom,
    };
}
// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================
export { createRoom, updateRoom, deleteRoom, getRoomConfig, findRoomByName, getDefaultRoom, } from './spotify-room-config-store.js';
//# sourceMappingURL=spotify-room-service.js.map