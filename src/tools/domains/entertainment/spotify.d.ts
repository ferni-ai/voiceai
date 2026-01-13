/**
 * Spotify Integration Tools
 *
 * Allows Jack to play music, search tracks, and control playback.
 *
 * Requirements:
 * - SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env
 * - User must authenticate via OAuth (one-time)
 * - SPOTIFY_REFRESH_TOKEN after initial auth
 *
 * @see https://developer.spotify.com/documentation/web-api
 */
import { llm } from '@livekit/agents';
/**
 * Search for tracks and return those with preview URLs
 * Used for ambient music where we need streamable tracks
 */
export declare function searchTracksWithPreviews(query: string, limit?: number): Promise<Array<{
    name: string;
    artist: string;
    previewUrl: string;
    uri?: string;
    duration?: number;
}>>;
/**
 * Enable/disable streaming music into the call
 */
export declare function setStreamIntoCall(enabled: boolean): void;
export declare function createSpotifyTools(): {
    playMusic: llm.FunctionTool<{
        query: string;
    }, unknown, string>;
    searchMusic: llm.FunctionTool<{
        query: string;
        limit?: number | undefined;
    }, unknown, string>;
    pauseMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    resumeMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    skipSong: llm.FunctionTool<Record<string, never>, unknown, string>;
    whatsPlaying: llm.FunctionTool<Record<string, never>, unknown, string>;
    setMusicVolume: llm.FunctionTool<{
        volume: number;
    }, unknown, string>;
    suggestMusic: llm.FunctionTool<{
        mood: string;
    }, unknown, string>;
    tellMeAboutThisMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    playPreview: llm.FunctionTool<{
        query: string;
    }, unknown, string>;
    pauseCallMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    resumeCallMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    stopCallMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    setCallMusicVolume: llm.FunctionTool<{
        volume: number;
    }, unknown, string>;
    transferMusic: llm.FunctionTool<{
        deviceName?: string | undefined;
    }, unknown, string>;
    getMusicStatus: llm.FunctionTool<Record<string, never>, unknown, string>;
    setSleepTimer: llm.FunctionTool<{
        minutes: number;
    }, unknown, string>;
    cancelSleepTimer: llm.FunctionTool<Record<string, never>, unknown, "Sleep timer cancelled. The music will keep playing!" | "There's no sleep timer active right now.">;
    checkSpotifyHealth: llm.FunctionTool<Record<string, never>, unknown, string>;
};
/**
 * Stop Spotify auto-refresh (call on shutdown)
 */
export declare function shutdownSpotify(): void;
export default createSpotifyTools;
//# sourceMappingURL=spotify.d.ts.map