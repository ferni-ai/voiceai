/**
 * Unified Music Tool
 *
 * Plays music for ALL users with a delightful experience:
 *
 * 1. iTunes (Default) - Free 30-second previews for everyone, no auth needed
 * 2. Spotify (Upgrade) - Full playback for users with linked Premium accounts
 *
 * This ensures every user can enjoy music without requiring a subscription.
 */
import { llm } from '@livekit/agents';
/**
 * Music intent types:
 * - AMBIENT: Background music while chatting (30-sec previews are perfect)
 * - LISTENING: User wants to actually hear a specific song (Spotify preferred)
 */
export type MusicIntent = 'ambient' | 'listening';
/**
 * Detect whether the user wants ambient background music or to actually listen.
 *
 * AMBIENT signals (iTunes DJ mode - chains previews):
 * - "Play some..." (vague/mood-based)
 * - "Put on something..."
 * - "While we talk/chat..."
 * - Mood words: relaxing, upbeat, focus, chill, background
 *
 * LISTENING signals (Spotify full track):
 * - "Play THE song..." (specific)
 * - "I want to hear [artist/song]"
 * - "On Spotify..."
 * - Specific artist + song name together
 */
export declare function detectMusicIntent(query: string): MusicIntent;
/**
 * Initialize music config for the session.
 * Called when the voice agent starts.
 * Auto-detects if Spotify is available.
 */
export declare function initializeMusicConfig(): Promise<void>;
/**
 * Reset music config to defaults.
 * Call this when a session ends to ensure clean state for next session.
 */
export declare function resetMusicConfig(): void;
/**
 * Play music using INTENT-BASED routing for the best experience.
 *
 * 🎵 AMBIENT (background music while chatting):
 *    - Uses iTunes DJ mode - chains 30-second previews with crossfades
 *    - ALWAYS works, no device issues
 *    - Perfect for conversation - natural segments
 *    - Example: "Play some jazz", "Put on something relaxing"
 *
 * 🎧 LISTENING (user wants to actually hear a song):
 *    - Uses Spotify if linked + device available
 *    - Falls back to iTunes preview with helpful message
 *    - Example: "Play 'All Too Well' by Taylor Swift", "I want to hear..."
 *
 * 🔊 SONOS: For Sonos playback, use the playSonosMusic tool directly.
 *    - The LLM should route "play on Sonos" requests to playSonosMusic tool
 */
export declare function playMusicUnified(query: string): Promise<string>;
/**
 * Play via iTunes - Free 30-second previews.
 *
 * 🎧 DJ-STYLE: If music is already playing, we do a smooth crossfade!
 * This makes Ferni feel like a real DJ - seamless track transitions.
 */
export declare function playViaItunes(query: string, personaId?: string): Promise<string>;
/**
 * Search for music across sources.
 */
export declare function searchMusic(query: string, limit?: number): Promise<string>;
/**
 * Get music recommendation based on mood.
 */
export declare function suggestAndPlayMusic(mood: string): Promise<string>;
export declare function createMusicTools(): {
    playMusic: llm.FunctionTool<{
        query: string;
    }, unknown, string>;
    searchMusic: llm.FunctionTool<{
        query: string;
        limit?: number | undefined;
    }, unknown, string>;
    suggestMusic: llm.FunctionTool<{
        mood: string;
    }, unknown, string>;
    pauseMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    resumeMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    stopMusic: llm.FunctionTool<Record<string, never>, unknown, string>;
    setMusicVolume: llm.FunctionTool<{
        volume: number;
    }, unknown, string>;
    whatsPlaying: llm.FunctionTool<Record<string, never>, unknown, string>;
    useSpotify: llm.FunctionTool<Record<string, never>, unknown, "Spotify isn't linked yet. Link your account in settings to enjoy full songs!" | "Spotify is linked and ready! I'll play full songs from your library.">;
    useFreePreviews: llm.FunctionTool<Record<string, never>, unknown, string>;
    discoverMusic: llm.FunctionTool<{
        personaId?: string | undefined;
    }, unknown, string>;
    keepVibeGoing: llm.FunctionTool<{
        personaId?: string | undefined;
    }, unknown, string>;
    /**
     * 🎵 Get user's learned music preferences
     * Users can ask "What music do you remember I like?" or "What are my music preferences?"
     */
    myMusicPreferences: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createMusicTools;
//# sourceMappingURL=music.d.ts.map