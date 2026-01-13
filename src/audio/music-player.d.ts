/**
 * Music Player for LiveKit Calls
 *
 * LOW-LEVEL AUDIO PLAYBACK ENGINE
 *
 * This is a pure playback engine. It handles:
 * - Background music playback via BackgroundAudioPlayer
 * - Audio fade-out at track end (via ffmpeg pre-processing)
 * - Play/pause/skip controls
 * - Spotify/iTunes preview support (downloads and plays)
 * - Crossfade between tracks
 * - Duck/unduck for volume control during speech
 *
 * DJ Logic is handled elsewhere:
 * - DJController (dj-controller.ts) - State machine, single source of truth
 * - DJTimingEngine (dj-timing-engine.ts) - Schedules DJ moments
 * - DJSpeechEngine (dj-speech-engine.ts) - Generates phrases
 * - DJDecisionEngine (dj-decision-engine.ts) - Decides when to speak
 *
 * The music-handler.ts wires MusicPlayer events -> DJController.
 *
 * ARCHITECTURE:
 * - Uses @livekit/agents BackgroundAudioPlayer for actual audio publishing
 * - Downloads previews to temp files before playing
 * - Applies ffmpeg fade-out to downloaded tracks (last 5 seconds)
 * - Manages playback state and queue
 *
 * ⚠️ VOLUME LIMITATIONS (IMPORTANT):
 * LiveKit's BackgroundAudioPlayer does NOT support real-time volume changes.
 * Volume can only be set at play time - it cannot be changed during playback.
 *
 * This means:
 * - setVolume() only affects the NEXT track, not currently playing audio
 * - True audio ducking during playback is NOT possible
 * - We work around this with:
 *   1. Low default volume (25%) so speech is always clear
 *   2. Pausing ambient music when agent speaks (duck() method)
 *   3. Visual "ducking" feedback on frontend (waveform calms down)
 *   4. Audio fade-out at track end via ffmpeg pre-processing
 *
 * For games and other scenarios, we use 30% volume to ensure speech clarity.
 */
import type { Room } from '@livekit/rtc-node';
type AgentSession = any;
export interface MusicTrack {
    name: string;
    artist: string;
    uri?: string;
    previewUrl?: string;
    duration?: number;
    genre?: string;
    albumArt?: string;
}
/**
 * 🎧 Session Music History Entry
 * Tracks what was played for DJ-style callbacks and continuity
 */
export interface SessionMusicEntry {
    track: MusicTrack;
    playedAt: number;
    userMood?: string;
    wasRequested: boolean;
    wasFullyPlayed: boolean;
}
export interface MusicPlayerState {
    isPlaying: boolean;
    currentTrack: MusicTrack | null;
    volume: number;
    duckingVolume: number;
    isDucked: boolean;
    queue: MusicTrack[];
    isInitialized: boolean;
    isAmbientMode: boolean;
    isChangingTrack: boolean;
    wasExplicitlyStopped: boolean;
    explicitStopTime: number | null;
}
/**
 * Callback for when track ends (so agent can respond)
 */
export type OnTrackEndedCallback = (track: MusicTrack, wasAmbient: boolean) => void;
/**
 * 🎤 Callback for "Wait for it..." moments
 * Fired mid-song at exciting moments for live DJ commentary
 */
export type OnMidSongMomentCallback = (track: MusicTrack, momentType: 'buildup' | 'drop' | 'highlight') => void;
/**
 * Music playback states for frontend notifications.
 *
 * - 'playing' = Music actively playing
 * - 'ducking' = Agent speaking over music (DJ fade-down)
 * - 'fading'  = Track ending soon (~5 seconds left)
 * - 'changing' = DJ crossfade - switching to a new track
 * - 'paused'  = Playback paused
 * - 'stopped' = Playback stopped
 * - 'idle'    = No music loaded
 */
export type MusicState = 'playing' | 'ducking' | 'fading' | 'changing' | 'paused' | 'stopped' | 'idle';
export type OnMusicStateChangeCallback = (state: MusicState, track: MusicTrack | null, isAmbient: boolean) => void;
/**
 * 🎧 Music Player Events (EventEmitter Pattern)
 *
 * Allows multiple listeners without overwriting each other.
 * Legacy setOnXxxCallback methods still work for backward compatibility.
 *
 * Events:
 * - 'trackEnded': Fired when a track finishes playing
 * - 'stateChange': Fired when playback state changes
 * - 'midSongMoment': Fired during exciting parts of a track (30% chance)
 */
export interface MusicPlayerEvents {
    trackEnded: [track: MusicTrack, wasAmbient: boolean];
    stateChange: [state: MusicState, track: MusicTrack | null, isAmbient: boolean];
    midSongMoment: [track: MusicTrack, momentType: 'buildup' | 'drop' | 'highlight'];
}
export interface TypedMusicPlayerEmitter {
    on: <K extends keyof MusicPlayerEvents>(event: K, listener: (...args: MusicPlayerEvents[K]) => void) => this;
    once: <K extends keyof MusicPlayerEvents>(event: K, listener: (...args: MusicPlayerEvents[K]) => void) => this;
    off: <K extends keyof MusicPlayerEvents>(event: K, listener: (...args: MusicPlayerEvents[K]) => void) => this;
    emit: <K extends keyof MusicPlayerEvents>(event: K, ...args: MusicPlayerEvents[K]) => boolean;
    removeAllListeners: <K extends keyof MusicPlayerEvents>(event?: K) => this;
}
export declare class CallMusicPlayer {
    private state;
    private readonly events;
    private backgroundPlayer;
    private currentPlayHandle;
    private room;
    private agentSession;
    private tempDir;
    private onTrackEndedCallback;
    private onMusicStateChangeCallback;
    private onMidSongMomentCallback;
    private currentAudioPath;
    private sessionHistory;
    private midSongMomentTimer;
    private ffmpegAvailable;
    private trackEndBackupTimer;
    private trackEndHandled;
    private currentUserMood;
    private initializationPromise;
    private initializationResolve;
    private sessionId;
    constructor();
    /**
     * Initialize the player with a LiveKit room and agent session
     * MUST be called before playing music
     *
     * @param room - The LiveKit room to publish audio to
     * @param agentSession - Optional agent session for better audio mixing integration
     * @param sessionId - Optional session ID to track singleton usage across sessions
     */
    initialize(room: Room, agentSession?: AgentSession, sessionId?: string): Promise<void>;
    /**
     * 🐛 FIX: Wait for initialization to complete
     * Tools should call this before attempting to play music
     * Returns immediately if already initialized
     */
    waitForInitialization(timeoutMs?: number): Promise<boolean>;
    /**
     * Get current session ID (for debugging singleton issues)
     */
    getSessionId(): string | null;
    /**
     * Check if the LiveKit room is still connected
     * This helps prevent race conditions where the room disconnects during async operations
     *
     * @returns true if room exists and is connected, false otherwise
     */
    isRoomConnected(): boolean;
    /**
     * Set callback for when track ends
     * The agent can use this to acknowledge the music ended
     *
     * @deprecated Use on('trackEnded', callback) instead for multiple listeners
     */
    setOnTrackEndedCallback(callback: OnTrackEndedCallback): void;
    /**
     * Set callback for music state changes
     * Used to notify frontend so avatar can dance!
     *
     * @deprecated Use on('stateChange', callback) instead for multiple listeners
     */
    setOnMusicStateChangeCallback(callback: OnMusicStateChangeCallback): void;
    /**
     * 🎤 Set callback for "Wait for it..." mid-song moments
     * These are the magic DJ interjections that make music feel alive!
     *
     * @deprecated Use on('midSongMoment', callback) instead for multiple listeners
     */
    setOnMidSongMomentCallback(callback: OnMidSongMomentCallback): void;
    /**
     * Register an event listener
     *
     * Events:
     * - 'trackEnded': (track: MusicTrack, wasAmbient: boolean) => void
     * - 'stateChange': (state: MusicState, track: MusicTrack | null, isAmbient: boolean) => void
     * - 'midSongMoment': (track: MusicTrack, momentType: 'buildup' | 'drop' | 'highlight') => void
     */
    on<K extends keyof MusicPlayerEvents>(event: K, listener: (...args: MusicPlayerEvents[K]) => void): this;
    /**
     * Register a one-time event listener
     */
    once<K extends keyof MusicPlayerEvents>(event: K, listener: (...args: MusicPlayerEvents[K]) => void): this;
    /**
     * Remove an event listener
     */
    off<K extends keyof MusicPlayerEvents>(event: K, listener: (...args: MusicPlayerEvents[K]) => void): this;
    /**
     * Remove all listeners for an event (or all events)
     */
    removeAllListeners<K extends keyof MusicPlayerEvents>(event?: K): this;
    /**
     * 🎭 Set current user mood for mood-aware music features
     * Called by voice agent when emotion detection updates
     */
    setCurrentUserMood(mood: string | undefined): void;
    /**
     * 🎭 Get current user mood
     */
    getCurrentUserMood(): string | undefined;
    /**
     * Add a track to session history
     */
    private addToSessionHistory;
    /**
     * Mark the most recent track as fully played
     */
    private markCurrentTrackCompleted;
    /**
     * Get session music history for DJ callbacks
     * "We played some jazz earlier..."
     */
    getSessionHistory(): SessionMusicEntry[];
    /**
     * Get recent tracks (last N) for context
     */
    getRecentTracks(count?: number): SessionMusicEntry[];
    /**
     * Check if we've played music from this artist before in this session
     */
    hasPlayedArtist(artist: string): boolean;
    /**
     * Get the vibe/genre of music played this session
     * Used for "Keep this vibe going?" offers
     */
    getSessionVibe(): {
        genres: string[];
        moods: string[];
        artists: string[];
    };
    /**
     * Clear session history (on disconnect)
     */
    clearSessionHistory(): void;
    /**
     * Schedule a "Wait for it..." moment during playback
     * Only triggers 10% of the time to keep it rare and special
     *
     * @deprecated This functionality is now handled by DJTimingEngine.
     * The music-handler.ts uses timingEngine.scheduleTrackMoments() instead.
     * This method is kept for backward compatibility but will be removed in a future version.
     *
     * HUMANIZATION: Reduced from 30% to 10% - constant DJ commentary
     * interrupts the music experience. Less is more.
     */
    private scheduleMidSongMoment;
    /**
     * Notify listeners of state change
     *
     * 🎧 CRITICAL: This is how the frontend learns about music state changes.
     * The frontend uses this to show/hide the Now Playing UI and animate the avatar.
     *
     * Uses EventEmitter pattern - all registered listeners receive the event.
     */
    private notifyStateChange;
    /**
     * Play a track from URL (Spotify preview or any audio URL)
     * Downloads the audio first, then plays via BackgroundAudioPlayer
     * @param isAmbient - If true, this is ambient/thinking music (for callback context)
     */
    playFromUrl(url: string, track: MusicTrack, isAmbient?: boolean): Promise<boolean>;
    /**
     * 🎧 DJ-STYLE CROSSFADE: Switch to a new track with style
     *
     * This is the magic that makes track changes feel professional:
     * 1. Notifies 'changing' state so agent can speak a DJ transition
     * 2. Waits for the transition moment (agent speaks over fading track)
     * 3. Smoothly starts the new track
     *
     * The key timing: Agent gets ~1.5s to say something like "Coming up next..."
     * then the new track starts as they're finishing their phrase.
     *
     * @param url - URL of the new track to play
     * @param track - Track metadata
     * @param isAmbient - Whether this is ambient music
     * @returns Object with success status and the previous track info
     */
    crossfadeTo(url: string, track: MusicTrack, isAmbient?: boolean): Promise<{
        success: boolean;
        previousTrack: MusicTrack | null;
    }>;
    /**
     * Check if music is currently playing (for determining whether to crossfade)
     */
    isCurrentlyPlaying(): boolean;
    /**
     * Get current track for DJ transition callouts
     */
    getCurrentPlayingTrack(): MusicTrack | null;
    /**
     * Download audio from URL to temp file and apply DJ fade-out
     *
     * 🐛 FIX: Now returns BOTH the file path AND the actual duration detected via ffprobe.
     * This is critical because iTunes previews vary in length (not always 30s exactly).
     *
     * 🐛 FIX: Now handles local file paths (starting with /) by reading from filesystem
     * instead of fetching via HTTP. This fixes session sounds not playing.
     *
     * @param url - URL or local path of the audio file
     * @param trackName - Name of the track for logging
     * @param hintDurationMs - Optional duration hint from track metadata (fallback if ffprobe unavailable)
     * @returns Object with path and actualDurationMs, or null if download failed
     */
    private downloadAudio;
    /**
     * 🎧 Apply a DJ-style fade-out to the audio using ffmpeg
     *
     * Creates that professional radio feel where tracks smoothly fade out
     * instead of ending abruptly. The fade happens in the last 5 seconds.
     *
     * @param inputPath - Path to the raw audio file
     * @param actualDurationMs - Actual duration detected by caller via ffprobe
     * @returns Path to the faded audio file, or input path if fade fails
     */
    private applyAudioFadeOut;
    /**
     * Check if ffmpeg is available on this system
     */
    private checkFfmpegAvailability;
    /**
     * Clean up temp file after playback
     */
    private cleanupTempFile;
    /**
     * Fallback simulation mode (for when BackgroundAudioPlayer isn't available)
     *
     * ⚠️ RETURNS FALSE - Audio will NOT be heard!
     * The agent should NOT announce that music is playing.
     */
    private simulatePlayback;
    /**
     * Called when current track ends
     *
     * 🎧 CRITICAL: This method MUST notify 'stopped' state when no more tracks in queue.
     * The frontend relies on this to hide the Now Playing UI.
     */
    private onTrackEnded;
    /**
     * Pause playback
     */
    pause(): void;
    /**
     * Resume playback - replays the current track from the beginning
     * Note: BackgroundAudioPlayer doesn't support true seek/resume,
     * so we restart the track from the beginning
     */
    resume(): Promise<void>;
    /**
     * Stop playback completely
     *
     * 🎧 This is called when:
     * - User explicitly stops music
     * - A new track is about to play (stop current first)
     * - Session is ending
     */
    stop(): void;
    /**
     * Skip to next track
     */
    skip(): void;
    /**
     * Add track to queue
     */
    addToQueue(track: MusicTrack): void;
    /**
     * Duck the music (lower volume) when agent starts speaking
     *
     * STRATEGY: Since BackgroundAudioPlayer doesn't support real-time volume changes,
     * we use a "smart pause" approach for a natural experience:
     * - If playing ambient/thinking music → pause it (it's meant to be interrupted)
     * - If playing user-requested music → keep it playing but at low background volume
     *   (the default 30% volume is already low enough to not interfere with speech)
     *
     * This creates a natural "the music fades into background" effect.
     */
    /**
     * Duck the music (lower volume) when agent starts speaking
     *
     * ARCHITECTURE NOTE:
     * Backend (LiveKit BackgroundAudioPlayer) cannot do real-time volume changes.
     * The REAL ducking happens on the FRONTEND via Web Audio API GainNode.
     * See: apps/web/src/services/music-audio.controller.ts
     *
     * This method:
     * 1. Sets state for tracking
     * 2. Pauses ambient music (it's meant to fill silence)
     * 3. Notifies frontend to duck via 'ducking' state
     */
    duck(): void;
    /**
     * Unduck the music (restore volume) when agent stops speaking
     *
     * The REAL unduck happens on the frontend via Web Audio API.
     * This notifies the frontend to restore volume.
     */
    unduck(): void;
    /**
     * Set volume (0-1)
     *
     * NOTE: BackgroundAudioPlayer does NOT support real-time volume changes.
     * This method updates the volume for the NEXT track that plays.
     * For ducking during playback, we use pause/resume strategies instead.
     * See duck() and unduck() methods for runtime volume control.
     *
     * @param volume - Target volume (0-1), will apply to next playback
     */
    setVolume(volume: number): void;
    /**
     * Get current volume setting (0-1)
     */
    getVolume(): number;
    /**
     * Get current state
     */
    getState(): MusicPlayerState;
    /**
     * Check if playing
     */
    isPlaying(): boolean;
    /**
     * Check if music was explicitly stopped by user (vs ended naturally)
     * Used by ThinkingMusicController to avoid auto-playing ambient music
     * after user asked to stop music.
     *
     * The flag is cleared when:
     * - User explicitly asks to play new music (non-ambient)
     * - 5 minutes pass since explicit stop (cooldown period)
     */
    wasExplicitlyStopped(): boolean;
    /**
     * Clear explicit stop flag (e.g., when user asks for music again)
     */
    clearExplicitStop(): void;
    /**
     * Get current track
     */
    getCurrentTrack(): MusicTrack | null;
    /**
     * Check if initialized
     */
    isInitialized(): boolean;
    /**
     * Cleanup
     */
    dispose(): Promise<void>;
}
export declare function getMusicPlayer(): CallMusicPlayer;
/**
 * Reset the music player singleton.
 *
 * 🐛 FIX: This is now async to properly await dispose() and prevent race conditions.
 * Previously, dispose() was fire-and-forget which could cause issues if
 * getMusicPlayer() was called before dispose completed.
 */
export declare function resetMusicPlayer(): Promise<void>;
/**
 * Initialize the music player with a LiveKit room and agent session
 * Call this from the agent when the session starts
 *
 * @param room - The LiveKit room to publish audio to
 * @param agentSession - Optional agent session for proper audio integration
 * @param sessionId - Optional session ID to detect singleton pollution across sessions
 */
export declare function initializeMusicPlayer(room: Room, agentSession?: AgentSession, sessionId?: string): Promise<void>;
/**
 * Check if music playback is available for the current session.
 *
 * This is useful for tools to check BEFORE attempting playback,
 * so they can return a clear message to the LLM that music isn't available
 * (rather than trying and failing with vague error messages).
 *
 * @returns Object with availability status and reason
 */
export declare function isMusicAvailable(): {
    available: boolean;
    reason: string;
};
export {};
//# sourceMappingURL=music-player.d.ts.map