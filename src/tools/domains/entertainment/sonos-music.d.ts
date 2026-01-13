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
/**
 * Create Sonos music tools for voice control
 * @param userId - The user's ID for credential lookup
 */
export declare function createSonosMusicTools(userId: string): {
    /**
     * Play music on Sonos by searching for a song, artist, or genre
     * First searches favorites, then falls back to vibe matching
     */
    playSonosMusic: llm.FunctionTool<{
        query: string;
        room?: string | undefined;
    }, unknown, string>;
    /**
     * Play a specific Sonos favorite
     */
    playSonosFavorite: llm.FunctionTool<{
        name: string;
        room?: string | undefined;
    }, unknown, string>;
    /**
     * Search Sonos favorites to see what's available
     */
    searchSonosFavorites: llm.FunctionTool<{
        query: string;
    }, unknown, string>;
    /**
     * Pause Sonos playback
     */
    pauseSonos: llm.FunctionTool<{
        room?: string | undefined;
    }, unknown, string>;
    /**
     * Resume Sonos playback
     */
    resumeSonos: llm.FunctionTool<{
        room?: string | undefined;
    }, unknown, string>;
    /**
     * Set Sonos volume
     */
    setSonosVolume: llm.FunctionTool<{
        volume: number;
        room?: string | undefined;
    }, unknown, string>;
    /**
     * Get what's currently playing on Sonos
     */
    whatsSonosPlaying: llm.FunctionTool<{
        room?: string | undefined;
    }, unknown, string>;
    /**
     * Set the default Sonos room for future commands
     */
    setSonosRoom: llm.FunctionTool<{
        room: string;
    }, unknown, string>;
    /**
     * List available Sonos rooms
     */
    listSonosRooms: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createSonosMusicTools;
//# sourceMappingURL=sonos-music.d.ts.map