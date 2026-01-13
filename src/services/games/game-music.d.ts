/**
 * 🎵 Game Music Helper
 *
 * Connects games to the music player.
 * Handles searching, playing, and managing music during games.
 */
export interface GameTrack {
    name: string;
    artist: string;
    previewUrl: string;
    duration?: number;
    decade?: string;
    genre?: string;
}
export interface SearchResult {
    found: boolean;
    track?: GameTrack;
    error?: string;
}
/**
 * Search for a specific song (for Name That Tune)
 * Uses rate limiting, caching, and fallback
 */
export declare function searchSong(query: string, useFallback?: boolean): Promise<SearchResult>;
/**
 * Search for songs containing a word (for One Word Song)
 */
export declare function searchSongWithWord(word: string): Promise<SearchResult>;
/**
 * Search for random songs from a decade or genre (for Name That Tune variety)
 */
export declare function getRandomGameSongs(count?: number, options?: {
    decade?: string;
    genre?: string;
}): Promise<GameTrack[]>;
/**
 * Search for songs matching a mood (for Mood DJ Challenge)
 */
export declare function searchSongForMood(mood: string): Promise<SearchResult>;
/**
 * Play a game track
 * Returns true if playback started successfully
 *
 * @param waitForStart - If true, waits for music to actually start before resolving
 *                       This prevents the agent from speaking over the music intro
 */
export declare function playGameTrack(track: GameTrack, waitForStart?: boolean): Promise<boolean>;
/**
 * Stop current game track and restore normal volume
 */
export declare function stopGameTrack(): void;
/**
 * 🎮 Restore normal music volume after a game ends
 * Call this when transitioning back to regular conversation
 */
export declare function restoreNormalVolume(): void;
/**
 * Stop game track for dramatic reveals
 *
 * NOTE: BackgroundAudioPlayer doesn't support real-time volume changes,
 * so we can't actually fade. We stop immediately but the visual effect
 * in the frontend still shows the transition smoothly.
 *
 * @param delayMs - Optional delay before stopping (for dramatic pause)
 */
export declare function fadeOutGameTrack(delayMs?: number): Promise<void>;
/**
 * Check if music player is available
 */
export declare function isMusicAvailable(): boolean;
/**
 * Get current playback status
 */
export declare function isPlaying(): boolean;
/**
 * 🎮 Duck game music when user speaks during a game
 * Called when user starts speaking - they're making a guess!
 *
 * NOTE: BackgroundAudioPlayer doesn't support real-time volume changes.
 * We use the music player's duck() method which:
 * - For ambient: pauses the music
 * - For user music: sends 'ducking' state to frontend (visual fade)
 * The audio volume doesn't actually change, but the visual feedback helps.
 */
export declare function duckForUserGuess(): void;
/**
 * 🎮 Restore game music after user stops speaking
 */
export declare function unduckAfterGuess(): void;
/**
 * Preload songs for upcoming rounds
 * Call this at game start or after each round
 */
export declare function preloadNextRoundSongs(count?: number): Promise<void>;
/**
 * Get a preloaded track (or search for one if queue is empty)
 */
export declare function getPreloadedOrSearch(query?: string): Promise<GameTrack | null>;
/**
 * Clear the preload queue and cleanup after game ends
 * Restores normal volume settings for regular conversation
 */
export declare function clearPreloadQueue(): void;
/**
 * Get preload queue size (for debugging)
 */
export declare function getPreloadQueueSize(): number;
//# sourceMappingURL=game-music.d.ts.map