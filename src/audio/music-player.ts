/**
 * Music Player for LiveKit Calls
 *
 * Streams music directly into the phone/web call using LiveKit's
 * built-in BackgroundAudioPlayer.
 *
 * Features:
 * - Background music playback via BackgroundAudioPlayer
 * - Automatic ducking when Jack speaks (via volume control)
 * - Play/pause/skip controls
 * - Spotify preview support (downloads and plays)
 *
 * ARCHITECTURE:
 * - Uses @livekit/agents BackgroundAudioPlayer for actual audio publishing
 * - Downloads Spotify previews to temp files before playing
 * - Manages playback state and queue
 */

import { voice } from '@livekit/agents';
// AgentSession is the session object from voice pipeline - using any for compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentSession = any;
import { createLogger, getLogger } from '../utils/safe-logger.js';
import type { Room } from '@livekit/rtc-node';

const log = createLogger({ module: 'MusicPlayer' });
const DEBUG_MUSIC = process.env.DEBUG_MUSIC === 'true';

// Extract BackgroundAudioPlayer from the voice namespace
const { BackgroundAudioPlayer } = voice;
type PlayHandle = ReturnType<InstanceType<typeof BackgroundAudioPlayer>['play']>;
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// TYPES
// ============================================================================

export interface MusicTrack {
  name: string;
  artist: string;
  uri?: string; // Spotify URI
  previewUrl?: string; // 30-second preview URL
  duration?: number; // Duration in ms
  genre?: string; // For mood matching
}

/**
 * 🎧 Session Music History Entry
 * Tracks what was played for DJ-style callbacks and continuity
 */
export interface SessionMusicEntry {
  track: MusicTrack;
  playedAt: number; // timestamp
  userMood?: string; // mood when this was played (for mood matching)
  wasRequested: boolean; // user asked for it vs ambient
  wasFullyPlayed: boolean; // completed vs skipped
}

export interface MusicPlayerState {
  isPlaying: boolean;
  currentTrack: MusicTrack | null;
  volume: number; // 0-1, normal playback volume
  duckingVolume: number; // 0-1, volume when agent speaks
  isDucked: boolean;
  queue: MusicTrack[];
  isInitialized: boolean;
  isAmbientMode: boolean; // Playing ambient/thinking music
  isChangingTrack: boolean; // DJ crossfade in progress
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
export type OnMusicStateChangeCallback = (
  state: MusicState,
  track: MusicTrack | null,
  isAmbient: boolean
) => void;

// ============================================================================
// MUSIC PLAYER CLASS
// ============================================================================

export class CallMusicPlayer {
  private state: MusicPlayerState = {
    isPlaying: false,
    currentTrack: null,
    volume: 0.25, // Default 25% volume - pleasant background that doesn't compete with speech
    duckingVolume: 0.08, // 8% when agent speaks - barely audible but still present
    isDucked: false,
    queue: [],
    isInitialized: false,
    isAmbientMode: false,
    isChangingTrack: false, // DJ crossfade in progress
  };

  // LiveKit BackgroundAudioPlayer
  private backgroundPlayer: InstanceType<typeof BackgroundAudioPlayer> | null = null;
  private currentPlayHandle: PlayHandle | null = null;

  // Room reference (needed to initialize BackgroundAudioPlayer)
  private room: Room | null = null;

  // Agent session reference (for proper audio mixing)
  private agentSession: AgentSession | null = null;

  // Temp directory for downloaded audio
  private tempDir: string;

  // Callback when track ends (so agent can respond)
  private onTrackEndedCallback: OnTrackEndedCallback | null = null;

  // Callback for music state changes (for frontend avatar dancing)
  private onMusicStateChangeCallback: OnMusicStateChangeCallback | null = null;

  // 🎤 Callback for "Wait for it..." mid-song moments
  private onMidSongMomentCallback: OnMidSongMomentCallback | null = null;

  // Track the current audio file path for ducking restart
  private currentAudioPath: string | null = null;

  // 🎧 Session music history for DJ callbacks ("We played some jazz earlier...")
  private sessionHistory: SessionMusicEntry[] = [];

  // Timer for mid-song moments
  private midSongMomentTimer: ReturnType<typeof setTimeout> | null = null;

  // Track current mood for mood-aware offers
  private currentUserMood: string | undefined;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'jack-music-player');

    // Create temp directory if it doesn't exist
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    getLogger().info({ tempDir: this.tempDir }, 'CallMusicPlayer initialized');
  }

  /**
   * Initialize the player with a LiveKit room and agent session
   * MUST be called before playing music
   *
   * @param room - The LiveKit room to publish audio to
   * @param agentSession - Optional agent session for better audio mixing integration
   */
  async initialize(room: Room, agentSession?: AgentSession): Promise<void> {
    if (this.state.isInitialized) {
      getLogger().debug('Music player already initialized');
      return;
    }

    this.room = room;
    this.agentSession = agentSession ?? null;

    // Create BackgroundAudioPlayer (no ambient sound by default)
    this.backgroundPlayer = new BackgroundAudioPlayer();

    // Start the player (publishes audio track to room)
    // Pass agentSession if available for proper audio mixing
    await this.backgroundPlayer.start({
      room,
      agentSession: agentSession,
    });

    this.state.isInitialized = true;
    getLogger().info(
      { hasAgentSession: !!agentSession },
      'Music player initialized with BackgroundAudioPlayer'
    );
  }

  /**
   * Set callback for when track ends
   * The agent can use this to acknowledge the music ended
   */
  setOnTrackEndedCallback(callback: OnTrackEndedCallback): void {
    this.onTrackEndedCallback = callback;
  }

  /**
   * Set callback for music state changes
   * Used to notify frontend so avatar can dance!
   */
  setOnMusicStateChangeCallback(callback: OnMusicStateChangeCallback): void {
    this.onMusicStateChangeCallback = callback;
  }

  /**
   * 🎤 Set callback for "Wait for it..." mid-song moments
   * These are the magic DJ interjections that make music feel alive!
   */
  setOnMidSongMomentCallback(callback: OnMidSongMomentCallback): void {
    this.onMidSongMomentCallback = callback;
  }

  /**
   * 🎭 Set current user mood for mood-aware music features
   * Called by voice agent when emotion detection updates
   */
  setCurrentUserMood(mood: string | undefined): void {
    this.currentUserMood = mood;
  }

  /**
   * 🎭 Get current user mood
   */
  getCurrentUserMood(): string | undefined {
    return this.currentUserMood;
  }

  // ============================================================================
  // 🎧 SESSION MUSIC HISTORY
  // ============================================================================

  /**
   * Add a track to session history
   */
  private addToSessionHistory(track: MusicTrack, wasRequested: boolean): void {
    this.sessionHistory.push({
      track,
      playedAt: Date.now(),
      userMood: this.currentUserMood,
      wasRequested,
      wasFullyPlayed: false, // Updated when track ends
    });

    getLogger().debug(
      { track: track.name, historySize: this.sessionHistory.length },
      '🎧 Added to session music history'
    );
  }

  /**
   * Mark the most recent track as fully played
   */
  private markCurrentTrackCompleted(): void {
    if (this.sessionHistory.length > 0) {
      this.sessionHistory[this.sessionHistory.length - 1].wasFullyPlayed = true;
    }
  }

  /**
   * Get session music history for DJ callbacks
   * "We played some jazz earlier..."
   */
  getSessionHistory(): SessionMusicEntry[] {
    return [...this.sessionHistory];
  }

  /**
   * Get recent tracks (last N) for context
   */
  getRecentTracks(count = 5): SessionMusicEntry[] {
    return this.sessionHistory.slice(-count);
  }

  /**
   * Check if we've played music from this artist before in this session
   */
  hasPlayedArtist(artist: string): boolean {
    return this.sessionHistory.some(
      (entry) => entry.track.artist.toLowerCase() === artist.toLowerCase()
    );
  }

  /**
   * Get the vibe/genre of music played this session
   * Used for "Keep this vibe going?" offers
   */
  getSessionVibe(): { genres: string[]; moods: string[]; artists: string[] } {
    const genres: string[] = [];
    const moods: string[] = [];
    const artists: string[] = [];

    for (const entry of this.sessionHistory) {
      if (entry.track.genre && !genres.includes(entry.track.genre)) {
        genres.push(entry.track.genre);
      }
      if (entry.userMood && !moods.includes(entry.userMood)) {
        moods.push(entry.userMood);
      }
      if (!artists.includes(entry.track.artist)) {
        artists.push(entry.track.artist);
      }
    }

    return { genres, moods, artists };
  }

  /**
   * Clear session history (on disconnect)
   */
  clearSessionHistory(): void {
    this.sessionHistory = [];
  }

  // ============================================================================
  // 🎤 MID-SONG MOMENTS ("Wait for it...")
  // ============================================================================

  /**
   * Schedule a "Wait for it..." moment during playback
   * Only triggers 30% of the time to keep it special
   */
  private scheduleMidSongMoment(track: MusicTrack): void {
    // Clear any existing timer
    if (this.midSongMomentTimer) {
      clearTimeout(this.midSongMomentTimer);
      this.midSongMomentTimer = null;
    }

    // Only do this for non-ambient music and 30% of the time
    if (this.state.isAmbientMode || Math.random() > 0.3) {
      return;
    }

    // Don't do mid-song moments for very short tracks
    const duration = track.duration || 30000;
    if (duration < 20000) {
      return;
    }

    // Schedule at 55-70% through the track (the exciting part!)
    const momentPercent = 0.55 + Math.random() * 0.15;
    const momentTime = duration * momentPercent;

    this.midSongMomentTimer = setTimeout(() => {
      // Only fire if still playing the same track
      if (
        this.state.isPlaying &&
        this.state.currentTrack?.name === track.name &&
        this.onMidSongMomentCallback
      ) {
        // Pick moment type - mostly "buildup" with occasional "highlight"
        const momentType = Math.random() < 0.7 ? 'buildup' : 'highlight';

        getLogger().info(
          { track: track.name, momentType },
          '🎤 Mid-song moment triggered!'
        );

        this.onMidSongMomentCallback(track, momentType);
      }
    }, momentTime);

    getLogger().debug(
      { track: track.name, momentTime: Math.round(momentTime / 1000) },
      '🎤 Mid-song moment scheduled'
    );
  }

  /**
   * Notify listeners of state change
   */
  private notifyStateChange(state: MusicState): void {
    if (this.onMusicStateChangeCallback) {
      this.onMusicStateChangeCallback(state, this.state.currentTrack, this.state.isAmbientMode);
    }
  }

  /**
   * Play a track from URL (Spotify preview or any audio URL)
   * Downloads the audio first, then plays via BackgroundAudioPlayer
   * @param isAmbient - If true, this is ambient/thinking music (for callback context)
   */
  async playFromUrl(url: string, track: MusicTrack, isAmbient = false): Promise<boolean> {
    if (DEBUG_MUSIC)
      log.debug('playFromUrl called', {
        url,
        trackName: track.name,
        artist: track.artist,
        isAmbient,
      });
    getLogger().info(
      { url: url.slice(0, 50), track: track.name, artist: track.artist, isAmbient },
      'Playing from URL'
    );

    if (!this.state.isInitialized || !this.backgroundPlayer) {
      if (DEBUG_MUSIC) log.warn('Not initialized, falling back to simulation mode');
      getLogger().warn('Music player not initialized - call initialize(room) first');
      // Fallback to simulation mode if not initialized
      return this.simulatePlayback(track);
    }

    try {
      // Stop any current playback
      if (DEBUG_MUSIC) log.debug('Stopping any current playback');
      this.stop();

      // Download the audio file
      if (DEBUG_MUSIC) log.debug('Downloading audio', { url });
      const audioPath = await this.downloadAudio(url, track.name);
      if (DEBUG_MUSIC)
        log.debug('Download result', {
          success: audioPath ? 'SUCCESS' : 'FAILED',
          audioPath,
        });
      if (!audioPath) {
        log.error('Failed to download audio');
        return false;
      }

      // Set current track state
      this.state.currentTrack = track;
      this.state.isPlaying = true;
      this.state.isAmbientMode = isAmbient;
      this.currentAudioPath = audioPath;

      // Calculate volume (consider ducking state)
      const volume = this.state.isDucked ? this.state.duckingVolume : this.state.volume;
      if (DEBUG_MUSIC)
        log.debug('Playing with volume', {
          volume,
          isDucked: this.state.isDucked,
        });

      // Play via BackgroundAudioPlayer
      if (DEBUG_MUSIC)
        log.debug('Calling BackgroundAudioPlayer.play()', {
          source: audioPath,
          volume,
        });
      this.currentPlayHandle = this.backgroundPlayer.play(
        { source: audioPath, volume },
        false // Don't loop previews
      );

      if (DEBUG_MUSIC) log.debug('BackgroundAudioPlayer.play() called successfully');
      getLogger().info(
        { track: track.name, artist: track.artist, volume, isAmbient },
        '🎵 Music playback started'
      );

      // ✨ Notify frontend - music is playing!
      this.notifyStateChange('playing');

      // 🎧 Add to session history (for DJ callbacks like "We played jazz earlier...")
      if (!isAmbient) {
        this.addToSessionHistory(track, true); // wasRequested = true for explicit plays
      }

      // 🎤 Schedule a "Wait for it..." moment (30% chance, makes DJ feel alive!)
      this.scheduleMidSongMoment(track);

      // 🎧 DJ-STYLE FADE OUT: Notify frontend to fade 5 seconds before track ends
      // This makes the ending feel human and intentional, not abrupt
      const trackDuration = track.duration || 30000; // Default 30s for previews
      const fadeOutTime = Math.max(trackDuration - 5000, 10000); // Start fade 5s before end, min 10s

      // Schedule the fade notification
      const fadeTimer = setTimeout(() => {
        if (this.state.isPlaying && this.state.currentTrack?.name === track.name) {
          getLogger().info({ track: track.name }, '🎧 DJ fade-out starting...');
          this.notifyStateChange('fading');
        }
      }, fadeOutTime);

      // Wait for playback to complete, then cleanup
      if (this.currentPlayHandle) {
        void this.currentPlayHandle.waitForPlayout().then(() => {
          clearTimeout(fadeTimer); // Clean up timer if track ended early

          const endedTrack = this.state.currentTrack;
          const wasAmbient = this.state.isAmbientMode;

          // 🎧 Mark track as fully played in history
          if (!wasAmbient) {
            this.markCurrentTrackCompleted();
          }

          this.onTrackEnded();

          // Call the callback so agent can respond
          if (endedTrack && this.onTrackEndedCallback) {
            this.onTrackEndedCallback(endedTrack, wasAmbient);
          }

          // Clean up temp file (after callback, in case callback needs track info)
          this.cleanupTempFile(audioPath);
        });
      }

      return true;
    } catch (error) {
      getLogger().error({ error }, 'Music playback failed');
      return false;
    }
  }

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
  async crossfadeTo(
    url: string,
    track: MusicTrack,
    isAmbient = false
  ): Promise<{ success: boolean; previousTrack: MusicTrack | null }> {
    const previousTrack = this.state.currentTrack;
    const wasPlaying = this.state.isPlaying;

    if (DEBUG_MUSIC)
      log.debug('🎧 DJ Crossfade initiated', {
        from: previousTrack?.name,
        to: track.name,
        wasPlaying,
      });

    if (!wasPlaying || !previousTrack) {
      // Nothing playing - just play normally
      const success = await this.playFromUrl(url, track, isAmbient);
      return { success, previousTrack: null };
    }

    // 🎧 CROSSFADE MAGIC: Set state to 'changing' so agent knows to do DJ transition
    this.state.isChangingTrack = true;
    this.notifyStateChange('changing');

    getLogger().info(
      {
        fromTrack: previousTrack.name,
        toTrack: track.name,
      },
      '🎧 DJ crossfade starting - agent should speak transition phrase'
    );

    // Pre-download the new track while the DJ transition happens
    // This reduces latency - the new track is ready to go!
    const downloadPromise = this.downloadAudio(url, track.name);

    // Wait for DJ transition moment (agent speaks during this)
    // 1.5 seconds is enough for a quick DJ callout
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Stop the current track (quick fade handled by the short wait above)
    if (this.currentPlayHandle && !this.currentPlayHandle.done()) {
      this.currentPlayHandle.stop();
    }

    // Wait for download to complete
    const audioPath = await downloadPromise;

    if (!audioPath) {
      log.error('Failed to download new track for crossfade');
      this.state.isChangingTrack = false;
      this.notifyStateChange('stopped');
      return { success: false, previousTrack };
    }

    // Start the new track
    this.state.currentTrack = track;
    this.state.isPlaying = true;
    this.state.isAmbientMode = isAmbient;
    this.state.isChangingTrack = false;
    this.currentAudioPath = audioPath;

    const volume = this.state.isDucked ? this.state.duckingVolume : this.state.volume;

    if (!this.backgroundPlayer) {
      log.error('Background player not initialized');
      return { success: false, previousTrack };
    }

    this.currentPlayHandle = this.backgroundPlayer.play(
      { source: audioPath, volume },
      false
    );

    getLogger().info(
      { track: track.name, artist: track.artist, volume, isAmbient },
      '🎧 Crossfade complete - new track playing!'
    );

    // Notify we're now playing the new track
    this.notifyStateChange('playing');

    // Set up the fade-out timer for this new track
    const trackDuration = track.duration || 30000;
    const fadeOutTime = Math.max(trackDuration - 5000, 10000);

    const fadeTimer = setTimeout(() => {
      if (this.state.isPlaying && this.state.currentTrack?.name === track.name) {
        getLogger().info({ track: track.name }, '🎧 DJ fade-out starting...');
        this.notifyStateChange('fading');
      }
    }, fadeOutTime);

    // Handle track end
    if (this.currentPlayHandle) {
      void this.currentPlayHandle.waitForPlayout().then(() => {
        clearTimeout(fadeTimer);
        const endedTrack = this.state.currentTrack;
        const wasAmbient = this.state.isAmbientMode;
        this.onTrackEnded();

        if (endedTrack && this.onTrackEndedCallback) {
          this.onTrackEndedCallback(endedTrack, wasAmbient);
        }

        this.cleanupTempFile(audioPath);
      });
    }

    return { success: true, previousTrack };
  }

  /**
   * Check if music is currently playing (for determining whether to crossfade)
   */
  isCurrentlyPlaying(): boolean {
    return this.state.isPlaying && this.state.currentTrack !== null;
  }

  /**
   * Get current track for DJ transition callouts
   */
  getCurrentPlayingTrack(): MusicTrack | null {
    return this.state.isPlaying ? this.state.currentTrack : null;
  }

  /**
   * Download audio from URL to temp file
   */
  private async downloadAudio(url: string, trackName: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        getLogger().error({ status: response.status }, 'Failed to fetch audio');
        return null;
      }

      const buffer = await response.arrayBuffer();

      // Generate filename from track name (sanitized)
      const safeName = trackName.replace(/[^a-z0-9]/gi, '_').slice(0, 30);
      const filename = `${safeName}_${Date.now()}.mp3`;
      const filepath = path.join(this.tempDir, filename);

      // Write to temp file
      fs.writeFileSync(filepath, Buffer.from(buffer));

      getLogger().debug({ filepath, size: buffer.byteLength }, 'Audio downloaded');
      return filepath;
    } catch (error) {
      getLogger().error({ error }, 'Failed to download audio');
      return null;
    }
  }

  /**
   * Clean up temp file after playback
   */
  private cleanupTempFile(filepath: string): void {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        getLogger().debug({ filepath }, 'Cleaned up temp audio file');
      }
    } catch (error) {
      getLogger().warn({ error, filepath }, 'Failed to cleanup temp file');
    }
  }

  /**
   * Fallback simulation mode (for when BackgroundAudioPlayer isn't available)
   */
  private simulatePlayback(track: MusicTrack): boolean {
    getLogger().warn(
      {
        track: track.name,
        artist: track.artist,
        isInitialized: this.state.isInitialized,
        hasBackgroundPlayer: !!this.backgroundPlayer,
      },
      '⚠️ SIMULATION MODE - Music player not initialized! Audio will NOT be heard. Call initializeMusicPlayer(room) first.'
    );

    this.state.currentTrack = track;
    this.state.isPlaying = true;

    // Simulate 30-second duration
    const duration = track.duration || 30000;
    setTimeout(
      () => {
        this.onTrackEnded();
      },
      Math.min(duration, 30000)
    );

    return true;
  }

  /**
   * Called when current track ends
   */
  private onTrackEnded(): void {
    getLogger().debug('Track ended');

    // 🎤 Clear mid-song moment timer
    if (this.midSongMomentTimer) {
      clearTimeout(this.midSongMomentTimer);
      this.midSongMomentTimer = null;
    }

    if (this.state.queue.length > 0) {
      // Play next in queue
      const nextTrack = this.state.queue.shift()!;
      if (nextTrack.previewUrl) {
        void this.playFromUrl(nextTrack.previewUrl, nextTrack);
      }
    } else {
      // No more tracks
      this.state.isPlaying = false;
      this.state.currentTrack = null;
      this.currentPlayHandle = null;
      getLogger().debug('Queue empty - playback complete');
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    // 🎤 Clear mid-song moment timer
    if (this.midSongMomentTimer) {
      clearTimeout(this.midSongMomentTimer);
      this.midSongMomentTimer = null;
    }

    if (this.currentPlayHandle && !this.currentPlayHandle.done()) {
      this.currentPlayHandle.stop();
    }
    this.state.isPlaying = false;
    getLogger().debug('Music paused');

    // ✨ Notify frontend - stop dancing
    this.notifyStateChange('paused');
  }

  /**
   * Resume playback - replays the current track from the beginning
   * Note: BackgroundAudioPlayer doesn't support true seek/resume,
   * so we restart the track from the beginning
   */
  async resume(): Promise<void> {
    if (this.state.currentTrack && this.state.currentTrack.previewUrl) {
      getLogger().debug(
        { track: this.state.currentTrack.name },
        'Resuming playback (replaying from start)'
      );
      await this.playFromUrl(this.state.currentTrack.previewUrl, this.state.currentTrack);
    } else {
      getLogger().debug('No track to resume');
    }
  }

  /**
   * Stop playback completely
   */
  stop(): void {
    // 🎤 Clear mid-song moment timer
    if (this.midSongMomentTimer) {
      clearTimeout(this.midSongMomentTimer);
      this.midSongMomentTimer = null;
    }

    if (this.currentPlayHandle && !this.currentPlayHandle.done()) {
      this.currentPlayHandle.stop();
    }

    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.state.isAmbientMode = false;
    this.currentPlayHandle = null;
    this.currentAudioPath = null;

    getLogger().debug('Music stopped');

    // ✨ Notify frontend - stop dancing
    this.notifyStateChange('stopped');
  }

  /**
   * Skip to next track
   */
  skip(): void {
    this.stop();
    this.onTrackEnded();
  }

  /**
   * Add track to queue
   */
  addToQueue(track: MusicTrack): void {
    this.state.queue.push(track);
    getLogger().debug({ track: track.name }, 'Added to queue');
  }

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
  duck(): void {
    if (!this.state.isDucked) {
      this.state.isDucked = true;

      // For ambient music, pause it - it's meant to fill silence, not compete with speech
      if (this.state.isAmbientMode && this.state.isPlaying) {
        this.pause();
        getLogger().debug('🔉 Paused ambient music during agent speech');
      } else if (this.state.isPlaying) {
        // For user-requested music, notify frontend to fade the visual (DJ ducking effect)
        this.notifyStateChange('ducking');
        getLogger().debug(
          {
            isPlaying: this.state.isPlaying,
            currentTrack: this.state.currentTrack?.name,
          },
          '🔉 Music ducking - agent speaking over music'
        );
      }
    }
  }

  /**
   * Unduck the music (restore volume) when agent stops speaking
   *
   * For ambient music that was paused, we could resume it here,
   * but it's better to let the silence system handle when to play ambient music again.
   */
  unduck(): void {
    if (this.state.isDucked) {
      const wasAmbientPaused = this.state.isAmbientMode && !this.state.isPlaying;
      this.state.isDucked = false;

      if (wasAmbientPaused) {
        // Don't auto-resume ambient - let the silence detector decide
        getLogger().debug(
          '🔊 Agent finished speaking (ambient music will resume if silence continues)'
        );
      } else if (this.state.isPlaying) {
        // Restore visual feedback - music back to full presence
        this.notifyStateChange('playing');
        getLogger().debug(
          {
            isPlaying: this.state.isPlaying,
            currentTrack: this.state.currentTrack?.name,
          },
          '🔊 Music back to full - agent finished speaking'
        );
      }
    }
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    this.state.volume = Math.max(0, Math.min(1, volume));
    getLogger().debug({ volume: Math.round(this.state.volume * 100) }, 'Volume set');
  }

  /**
   * Get current state
   */
  getState(): MusicPlayerState {
    return { ...this.state };
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.state.isPlaying;
  }

  /**
   * Get current track
   */
  getCurrentTrack(): MusicTrack | null {
    return this.state.currentTrack;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.state.isInitialized;
  }

  /**
   * Cleanup
   */
  async dispose(): Promise<void> {
    this.stop();
    this.state.queue = [];

    // Close background player (handle room already closed gracefully)
    if (this.backgroundPlayer) {
      try {
        await this.backgroundPlayer.close();
      } catch (err) {
        // Room may already be closed - this is fine during cleanup
        getLogger().debug(
          { error: String(err) },
          'Background player close error (expected during room cleanup)'
        );
      }
      this.backgroundPlayer = null;
    }

    // Clean up temp directory
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
    } catch {
      // Ignore cleanup errors
    }

    this.state.isInitialized = false;
    getLogger().debug('Music player disposed');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let musicPlayerInstance: CallMusicPlayer | null = null;

export function getMusicPlayer(): CallMusicPlayer {
  if (!musicPlayerInstance) {
    musicPlayerInstance = new CallMusicPlayer();
  }
  return musicPlayerInstance;
}

export function resetMusicPlayer(): void {
  if (musicPlayerInstance) {
    void musicPlayerInstance.dispose();
    musicPlayerInstance = null;
  }
}

/**
 * Initialize the music player with a LiveKit room and agent session
 * Call this from the agent when the session starts
 *
 * @param room - The LiveKit room to publish audio to
 * @param agentSession - Optional agent session for proper audio integration
 */
export async function initializeMusicPlayer(
  room: Room,
  agentSession?: AgentSession
): Promise<void> {
  const player = getMusicPlayer();
  await player.initialize(room, agentSession);
}
