/**
 * Sonos Music Voice Tools
 *
 * LLM tools for controlling music on Sonos speakers.
 * Provides voice-controlled music playback, favorites, and room selection.
 *
 * Features:
 * - Play music by genre/mood/artist on Sonos
 * - Play Sonos favorites
 * - Set default room
 * - Transfer playback between rooms
 * - Volume and playback control
 *
 * @module tools/entertainment/sonos-music
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getUserSmartHomeCredentials } from '../../../services/smart-home/user-credentials.js';
import { playSonosMusic, playSonosFavorite, pauseSonos, resumeSonos, setSonosVolume, getSonosNowPlaying, getAvailableRooms, setLastUsedRoom, searchFavorites, } from '../../../services/smart-home/sonos-music.js';
const log = getLogger();
// ============================================================================
// CREDENTIAL HELPER
// ============================================================================
/**
 * Get Sonos credentials for a user
 * Returns null if not connected
 */
async function getSonosCredentials(userId) {
    try {
        const credentials = await getUserSmartHomeCredentials(userId);
        if (!credentials.sonos) {
            log.debug({ userId }, '🔊 User has no Sonos credentials');
            return null;
        }
        return credentials.sonos;
    }
    catch (error) {
        log.error({ error, userId }, '🔊 Failed to get Sonos credentials');
        return null;
    }
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
/**
 * Create Sonos music tools for voice control
 * @param userId - The user's ID for credential lookup
 */
export function createSonosMusicTools(userId) {
    return {
        /**
         * Play music on Sonos by searching for a song, artist, or genre
         * First searches favorites, then falls back to vibe matching
         */
        playSonosMusic: llm.tool({
            description: getToolDescription('playSonosMusic'),
            parameters: z.object({
                query: z
                    .string()
                    .describe('Music to play - song name, artist, genre, or mood (e.g., "jazz", "Taylor Swift", "chill vibes")'),
                room: z
                    .string()
                    .optional()
                    .describe('Room name to play on (e.g., "living room", "kitchen"). If not specified, uses last room or first available.'),
            }),
            execute: async ({ query, room }) => {
                log.info({ userId, query, room }, '🔊 TOOL: playSonosMusic called');
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "I don't see Sonos connected. You can set it up in the settings!";
                }
                const result = await playSonosMusic(credentials, userId, query, room);
                log.info({ result: result.message }, '🔊 TOOL: playSonosMusic result');
                return result.message;
            },
        }),
        /**
         * Play a specific Sonos favorite
         */
        playSonosFavorite: llm.tool({
            description: getToolDescription('playSonosFavorite'),
            parameters: z.object({
                name: z.string().describe('Name of the favorite to play'),
                room: z.string().optional().describe('Room to play on (optional)'),
            }),
            execute: async ({ name, room }) => {
                log.info({ userId, name, room }, '🔊 TOOL: playSonosFavorite called');
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "Sonos isn't connected. Set it up in settings to play favorites!";
                }
                const result = await playSonosFavorite(credentials, userId, name, room);
                return result.message;
            },
        }),
        /**
         * Search Sonos favorites to see what's available
         */
        searchSonosFavorites: llm.tool({
            description: 'Search the user\'s Sonos favorites. Use this to help find what music they have saved. Returns a list of matching favorites.',
            parameters: z.object({
                query: z.string().describe('Search query for favorites'),
            }),
            execute: async ({ query }) => {
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "Sonos isn't connected.";
                }
                const favorites = await searchFavorites(credentials, query);
                if (favorites.length === 0) {
                    return `No favorites found matching "${query}". Try a different search or say "list my Sonos favorites" to see all of them.`;
                }
                const list = favorites.slice(0, 10).map((f) => f.name).join(', ');
                return `Found these favorites matching "${query}": ${list}`;
            },
        }),
        /**
         * Pause Sonos playback
         */
        pauseSonos: llm.tool({
            description: getToolDescription('pauseSonos'),
            parameters: z.object({
                room: z.string().optional().describe('Room to pause (optional, defaults to last used)'),
            }),
            execute: async ({ room }) => {
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "Sonos isn't connected.";
                }
                const result = await pauseSonos(credentials, userId, room);
                return result.message;
            },
        }),
        /**
         * Resume Sonos playback
         */
        resumeSonos: llm.tool({
            description: getToolDescription('resumeSonos'),
            parameters: z.object({
                room: z.string().optional().describe('Room to resume (optional)'),
            }),
            execute: async ({ room }) => {
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "Sonos isn't connected.";
                }
                const result = await resumeSonos(credentials, userId, room);
                return result.message;
            },
        }),
        /**
         * Set Sonos volume
         */
        setSonosVolume: llm.tool({
            description: getToolDescription('setSonosVolume'),
            parameters: z.object({
                volume: z.number().min(0).max(100).describe('Volume level (0-100)'),
                room: z.string().optional().describe('Room to adjust (optional)'),
            }),
            execute: async ({ volume, room }) => {
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "Sonos isn't connected.";
                }
                const result = await setSonosVolume(credentials, userId, volume, room);
                return result.message;
            },
        }),
        /**
         * Get what's currently playing on Sonos
         */
        whatsSonosPlaying: llm.tool({
            description: getToolDescription('whatsSonosPlaying'),
            parameters: z.object({
                room: z.string().optional().describe('Room to check (optional)'),
            }),
            execute: async ({ room }) => {
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "Sonos isn't connected.";
                }
                const result = await getSonosNowPlaying(credentials, userId, room);
                return result.message;
            },
        }),
        /**
         * Set the default Sonos room for future commands
         */
        setSonosRoom: llm.tool({
            description: 'Set the default Sonos room for music playback. Future "play on Sonos" commands will use this room unless another is specified.',
            parameters: z.object({
                room: z.string().describe('Room name to set as default (e.g., "living room", "kitchen")'),
            }),
            execute: async ({ room }) => {
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "Sonos isn't connected. Set it up in settings first!";
                }
                const rooms = await getAvailableRooms(credentials);
                if (rooms.length === 0) {
                    return "I don't see any Sonos rooms. Make sure your Sonos is on and connected.";
                }
                // Find matching room
                const normalizedRoom = room.toLowerCase();
                const match = rooms.find((r) => r.groupName.toLowerCase().includes(normalizedRoom) ||
                    normalizedRoom.includes(r.groupName.toLowerCase()));
                if (!match) {
                    const availableRooms = rooms.map((r) => r.groupName).join(', ');
                    return `Couldn't find "${room}". Available rooms: ${availableRooms}`;
                }
                setLastUsedRoom(userId, match);
                return `Got it! I'll use "${match.groupName}" for Sonos by default now.`;
            },
        }),
        /**
         * List available Sonos rooms
         */
        listSonosRooms: llm.tool({
            description: 'List all available Sonos rooms/speakers. Use this when the user asks about their Sonos setup or which rooms are available.',
            parameters: z.object({}),
            execute: async () => {
                const credentials = await getSonosCredentials(userId);
                if (!credentials) {
                    return "Sonos isn't connected. You can set it up in the settings menu!";
                }
                const rooms = await getAvailableRooms(credentials);
                if (rooms.length === 0) {
                    return "I don't see any Sonos rooms. Make sure your Sonos is on and the speakers are connected.";
                }
                const roomList = rooms.map((r) => r.groupName).join(', ');
                return `Your Sonos rooms: ${roomList}`;
            },
        }),
    };
}
export default createSonosMusicTools;
//# sourceMappingURL=sonos-music.js.map