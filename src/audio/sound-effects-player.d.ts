/**
 * 🔊 Sound Effects Player
 *
 * Dedicated player for short sound effects (stingers, notifications, game sounds).
 * Completely separate from the music player - no DJ callbacks, no state tracking.
 *
 * Key differences from MusicPlayer:
 * - No onTrackEnded callbacks (sounds just play and finish)
 * - No DJ state machine (no fading, ducking, crossfade)
 * - No "music ended" announcements
 * - Simple fire-and-forget playback
 *
 * Uses its own BackgroundAudioPlayer instance to avoid any interference
 * with music playback or triggering music-related callbacks.
 *
 * 🔧 FIX (Dec 2024): Re-enabled with proper error handling for fluent-ffmpeg errors.
 * The music player handles these same errors gracefully with .catch() - applying same fix here.
 */
import type { Room } from '@livekit/rtc-node';
type AgentSession = any;
declare class SoundEffectsPlayer {
    private audioPlayer;
    private currentPlayHandle;
    private room;
    private session;
    private isReady;
    private isPlaying;
    /**
     * Initialize the sound effects player
     * Must be called before playing any sounds
     */
    initialize(room: Room, session?: AgentSession): Promise<boolean>;
    /**
     * Check if the player is ready to play sounds
     * Returns false if sound effects are disabled globally
     */
    isInitialized(): boolean;
    /**
     * Check if a sound is currently playing
     */
    isSoundPlaying(): boolean;
    /**
     * Play a sound effect from a URL or local path
     * Fire-and-forget - no callbacks, no state changes
     *
     * @param url - URL or path to the sound file
     * @param volume - Volume 0-1 (default 0.5)
     * @returns Promise<boolean> - true if sound started playing
     */
    playSound(url: string, volume?: number): Promise<boolean>;
    /**
     * Download a sound from URL to temp file
     */
    private downloadSound;
    /**
     * Resolve a local sound file path (e.g., /sounds/connect.mp3)
     * Tries multiple locations for dev vs production environments
     */
    private resolveLocalSoundPath;
    /**
     * Stop any currently playing sound effect
     */
    stop(): void;
    /**
     * Reset the player (for cleanup)
     */
    reset(): void;
}
/**
 * Get the singleton sound effects player instance
 */
export declare function getSoundEffectsPlayer(): SoundEffectsPlayer;
/**
 * Initialize the sound effects player
 * Should be called during session setup, BEFORE session.start()
 */
export declare function initializeSoundEffectsPlayer(room: Room, session?: AgentSession): Promise<boolean>;
/**
 * Reset the sound effects player (for cleanup)
 */
export declare function resetSoundEffectsPlayer(): void;
export default SoundEffectsPlayer;
//# sourceMappingURL=sound-effects-player.d.ts.map