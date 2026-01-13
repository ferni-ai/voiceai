/**
 * Spotify Connect Multi-Room Tools
 *
 * Voice tools for multi-room music playback.
 * "Play jazz in the living room" → routes to correct Spotify device(s)
 *
 * TOOLS:
 *   - playMusicInRoom: Play music in a specific room
 *   - transferToRoom: Move playback to another room
 *   - setRoomVolume: Adjust volume in a room
 *   - listRooms: Show configured rooms and groups
 *   - configureRoom: Add/edit/remove room configurations
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { playInRoom, transferToRoom, setRoomVolume, getRoomsForVoice, discoverDevices, getUnassignedDevices, getRoomConfig, } from '../../../services/identity/spotify-room-service.js';
const log = createLogger({ module: 'spotify-connect-tools' });
// ============================================================================
// PLAY MUSIC IN ROOM
// ============================================================================
const playMusicInRoomDef = {
    id: 'playMusicInRoom',
    name: 'Play Music in Room',
    description: 'Play music in a specific room or on "everywhere". Routes to the correct Spotify Connect device(s).',
    domain: 'entertainment',
    tags: ['spotify', 'multi-room', 'playback', 'rooms'],
    requiredServices: ['spotify'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('playMusicInRoom') ||
                'Play music in a specific room (e.g., "living room", "kitchen", "everywhere"). Searches for the song and plays on the room\'s Spotify device.',
            parameters: z.object({
                room: z
                    .string()
                    .describe('Room name (e.g., "living room", "kitchen", "bedroom", "everywhere", or a group name)'),
                query: z.string().describe('Song, artist, or genre to play'),
            }),
            execute: async ({ room, query }) => {
                log.info({ room, query, userId: ctx.userId }, 'Playing music in room');
                const result = await playInRoom(ctx.userId, room, { query });
                if (!result.success) {
                    // Helpful error messages
                    if (result.error?.includes('not found')) {
                        const roomsResult = await getRoomsForVoice(ctx.userId);
                        if (roomsResult.rooms.length === 0) {
                            return `I don't have any rooms set up yet. You can configure rooms in Settings, or just say "play ${query}" to play on the default device.`;
                        }
                        const roomNames = roomsResult.rooms.map((r) => r.name).join(', ');
                        return `I couldn't find "${room}". Your configured rooms are: ${roomNames}. Which one would you like?`;
                    }
                    return result.error || `Couldn't play in ${room}`;
                }
                const deviceInfo = result.deviceNames.length > 0 ? ` on ${result.deviceNames[0]}` : '';
                const trackInfo = result.trackName
                    ? `"${result.trackName}" by ${result.artistName}`
                    : query;
                return `Playing ${trackInfo} in the ${result.roomName}${deviceInfo}.`;
            },
        });
    },
};
// ============================================================================
// TRANSFER TO ROOM
// ============================================================================
const transferToRoomDef = {
    id: 'transferToRoom',
    name: 'Transfer to Room',
    description: 'Move current playback to a different room.',
    domain: 'entertainment',
    tags: ['spotify', 'multi-room', 'transfer', 'rooms'],
    requiredServices: ['spotify'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('transferToRoom') ||
                'Transfer the currently playing music to another room (e.g., "move music to the kitchen").',
            parameters: z.object({
                room: z.string().describe('Room name to transfer playback to'),
            }),
            execute: async ({ room }) => {
                log.info({ room, userId: ctx.userId }, 'Transferring to room');
                const result = await transferToRoom(ctx.userId, room);
                if (!result.success) {
                    if (result.error?.includes('not found')) {
                        const roomsResult = await getRoomsForVoice(ctx.userId);
                        if (roomsResult.rooms.length === 0) {
                            return `I don't have any rooms set up. You can configure rooms in Settings.`;
                        }
                        const roomNames = roomsResult.rooms.map((r) => r.name).join(', ');
                        return `I couldn't find "${room}". Available rooms: ${roomNames}.`;
                    }
                    return result.error || `Couldn't transfer to ${room}`;
                }
                const fromInfo = result.fromRoom ? ` from the ${result.fromRoom}` : '';
                return `Moved the music${fromInfo} to the ${result.toRoom} (${result.deviceName}).`;
            },
        });
    },
};
// ============================================================================
// SET ROOM VOLUME
// ============================================================================
const setRoomVolumeDef = {
    id: 'setRoomVolume',
    name: 'Set Room Volume',
    description: 'Adjust volume in a specific room.',
    domain: 'entertainment',
    tags: ['spotify', 'multi-room', 'volume', 'rooms'],
    requiredServices: ['spotify'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('setRoomVolume') ||
                'Set the volume in a specific room (e.g., "turn up the living room").',
            parameters: z.object({
                room: z.string().describe('Room name'),
                volume: z.number().min(0).max(100).describe('Volume percentage (0-100)'),
            }),
            execute: async ({ room, volume }) => {
                log.info({ room, volume, userId: ctx.userId }, 'Setting room volume');
                const result = await setRoomVolume(ctx.userId, room, volume);
                if (!result.success) {
                    return result.error || `Couldn't set volume in ${room}`;
                }
                if (volume >= 80) {
                    return `${room} volume cranked up to ${volume}%!`;
                }
                else if (volume <= 20) {
                    return `${room} volume lowered to ${volume}%. Nice and quiet.`;
                }
                return `${room} volume set to ${volume}%.`;
            },
        });
    },
};
// ============================================================================
// LIST ROOMS
// ============================================================================
const listRoomsDef = {
    id: 'listMusicRooms',
    name: 'List Music Rooms',
    description: 'List configured rooms and room groups for multi-room playback.',
    domain: 'entertainment',
    tags: ['spotify', 'multi-room', 'rooms', 'list'],
    requiredServices: ['spotify'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('listMusicRooms') || 'List your configured music rooms and room groups.',
            parameters: z.object({}),
            execute: async () => {
                log.info({ userId: ctx.userId }, 'Listing music rooms');
                const result = await getRoomsForVoice(ctx.userId);
                if (result.rooms.length === 0) {
                    return `You don't have any music rooms set up yet. You can configure rooms in Settings under "Spotify Rooms".`;
                }
                let response = `You have ${result.rooms.length} room${result.rooms.length > 1 ? 's' : ''} configured:\n`;
                for (const room of result.rooms) {
                    const playing = room.isPlaying ? ' (playing now)' : '';
                    const devices = room.deviceCount === 1 ? '1 device' : `${room.deviceCount} devices`;
                    response += `\n• ${room.name} - ${devices}${playing}`;
                }
                if (result.defaultRoom) {
                    response += `\n\nDefault room: ${result.defaultRoom}`;
                }
                if (result.groups.length > 0) {
                    response += '\n\nRoom groups:';
                    for (const group of result.groups) {
                        response += `\n• ${group.name} (${group.roomCount} rooms)`;
                    }
                }
                response += '\n\nYou can also say "play everywhere" to play on all rooms.';
                return response;
            },
        });
    },
};
// ============================================================================
// SYNC ROOMS (play on all)
// ============================================================================
const syncRoomsDef = {
    id: 'syncMusicRooms',
    name: 'Sync Music Rooms',
    description: 'Play the current music on all configured rooms simultaneously.',
    domain: 'entertainment',
    tags: ['spotify', 'multi-room', 'sync', 'everywhere'],
    requiredServices: ['spotify'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('syncMusicRooms') ||
                'Play music on all speakers/rooms at once (whole-house audio).',
            parameters: z.object({
                query: z
                    .string()
                    .optional()
                    .describe('Optional song/artist to play. If empty, transfers current playback.'),
            }),
            execute: async ({ query }) => {
                log.info({ query, userId: ctx.userId }, 'Syncing music to all rooms');
                const result = query
                    ? await playInRoom(ctx.userId, 'everywhere', { query })
                    : await transferToRoom(ctx.userId, 'everywhere');
                if (!result.success) {
                    const config = await getRoomConfig(ctx.userId);
                    if (!config.success || !config.data?.rooms.length) {
                        return `You don't have any rooms configured yet. Set up rooms in Settings first.`;
                    }
                    return result.error || "Couldn't sync to all rooms";
                }
                if ('trackName' in result && result.trackName) {
                    return `Playing "${result.trackName}" everywhere!`;
                }
                return `Music is now playing everywhere!`;
            },
        });
    },
};
// ============================================================================
// DISCOVER DEVICES (for setup)
// ============================================================================
const discoverDevicesDef = {
    id: 'discoverSpotifyDevices',
    name: 'Discover Spotify Devices',
    description: 'Find available Spotify Connect devices for room configuration.',
    domain: 'entertainment',
    tags: ['spotify', 'devices', 'setup', 'discovery'],
    requiredServices: ['spotify'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('discoverSpotifyDevices') ||
                'Discover available Spotify Connect devices for setting up rooms.',
            parameters: z.object({
                showUnassignedOnly: z
                    .boolean()
                    .optional()
                    .describe('Only show devices not yet assigned to a room'),
            }),
            execute: async ({ showUnassignedOnly }) => {
                log.info({ showUnassignedOnly, userId: ctx.userId }, 'Discovering devices');
                const result = showUnassignedOnly
                    ? await getUnassignedDevices(ctx.userId)
                    : await discoverDevices();
                if (!result.success || !result.data) {
                    return (result.error || "Couldn't discover devices. Is Spotify running on any of your devices?");
                }
                if (result.data.length === 0) {
                    if (showUnassignedOnly) {
                        return 'All your Spotify devices are already assigned to rooms!';
                    }
                    return "I don't see any Spotify devices. Make sure Spotify is open on your speakers, phone, or computer.";
                }
                let response = `Found ${result.data.length} Spotify device${result.data.length > 1 ? 's' : ''}:\n`;
                for (const device of result.data) {
                    const active = device.is_active ? ' (active)' : '';
                    response += `\n• ${device.name} (${device.type})${active}`;
                }
                response += '\n\nTo add a device to a room, go to Settings > Spotify Rooms.';
                return response;
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const spotifyConnectTools = [
    playMusicInRoomDef,
    transferToRoomDef,
    setRoomVolumeDef,
    listRoomsDef,
    syncRoomsDef,
    discoverDevicesDef,
];
export default spotifyConnectTools;
//# sourceMappingURL=spotify-connect.js.map