/**
 * Music Player for LiveKit Calls
 *
 * Streams music directly into the phone/web call using LiveKit's
 * built-in BackgroundAudioPlayer.
 *
 * Features:
 * - Background music playback via BackgroundAudioPlayer
 * - DJ-style fade-out at track end (via ffmpeg pre-processing)
 * - Play/pause/skip controls
 * - Spotify/iTunes preview support (downloads and plays)
 * - Crossfade between tracks
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
 *   4. DJ-style fade-out at track end via ffmpeg pre-processing
 *
 * For games and other scenarios, we use 30% volume to ensure speech clarity.
 */

import { voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { exec } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { isDebugEnabled } from '../config/feature-flags.js';
import { createLogger, getLogger } from '../utils/safe-logger.js';
// AgentSession is the session object from voice pipeline - using any for compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentSession = any;

const log = createLogger({ module: 'MusicPlayer' });

// Use centralized feature flag system for debug toggle
const DEBUG_MUSIC = isDebugEnabled('music');

// Extract BackgroundAudioPlayer from the voice namespace
const { BackgroundAudioPlayer } = voice;
type PlayHandle = ReturnType<InstanceType<typeof BackgroundAudioPlayer>['play']>;

const execAsync = promisify(exec);

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
export type OnMidSongMomentCallback = (
  track: MusicTrack,
  momentType: 'buildup' | 'drop' | 'highlight'
) => void;

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
export type MusicState =
  | 'playing'
  | 'ducking'
  | 'fading'
  | 'changing'
  | 'paused'
  | 'stopped'
  | 'idle';
export type OnMusicStateChangeCallback = (
  state: MusicState,
  track: MusicTrack | null,
  isAmbient: boolean
) => void;

// ============================================================================
// EVENT EMITTER TYPES
// ============================================================================

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
  on: <K extends keyof MusicPlayerEvents>(
    event: K,
    listener: (...args: MusicPlayerEvents[K]) => void
  ) => this;
  once: <K extends keyof MusicPlayerEvents>(
    event: K,
    listener: (...args: MusicPlayerEvents[K]) => void
  ) => this;
  off: <K extends keyof MusicPlayerEvents>(
    event: K,
    listener: (...args: MusicPlayerEvents[K]) => void
  ) => this;
  emit: <K extends keyof MusicPlayerEvents>(event: K, ...args: MusicPlayerEvents[K]) => boolean;
  removeAllListeners: <K extends keyof MusicPlayerEvents>(event?: K) => this;
}

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

  // 🎧 EventEmitter for multiple listeners (new pattern)
  private readonly events: TypedMusicPlayerEmitter = new EventEmitter() as TypedMusicPlayerEmitter;

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

  // 🎧 Whether ffmpeg is available for DJ-style audio fade-out
  private ffmpegAvailable = false;

  // 🐛 FIX: Backup timer for track end detection
  // waitForPlayout() may not resolve reliably, so we use this as a fallback
  private trackEndBackupTimer: ReturnType<typeof setTimeout> | null = null;

  // 🐛 FIX: Track if waitForPlayout has already resolved (to prevent double-firing)
  private trackEndHandled = false;

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

    // Check if ffmpeg is available for DJ-style audio fade-out
    this.ffmpegAvailable = await this.checkFfmpegAvailability();

    getLogger().info(
      { hasAgentSession: !!agentSession, ffmpegAvailable: this.ffmpegAvailable },
      'Music player initialized with BackgroundAudioPlayer'
    );
  }

  /**
   * Set callback for when track ends
   * The agent can use this to acknowledge the music ended
   *
   * @deprecated Use on('trackEnded', callback) instead for multiple listeners
   */
  setOnTrackEndedCallback(callback: OnTrackEndedCallback): void {
    // Legacy: store for backward compatibility
    this.onTrackEndedCallback = callback;
    // Also register with event emitter for proper multi-listener support
    this.events.on('trackEnded', callback);
  }

  /**
   * Set callback for music state changes
   * Used to notify frontend so avatar can dance!
   *
   * @deprecated Use on('stateChange', callback) instead for multiple listeners
   */
  setOnMusicStateChangeCallback(callback: OnMusicStateChangeCallback): void {
    // Legacy: store for backward compatibility
    this.onMusicStateChangeCallback = callback;
    // Also register with event emitter for proper multi-listener support
    this.events.on('stateChange', callback);
  }

  /**
   * 🎤 Set callback for "Wait for it..." mid-song moments
   * These are the magic DJ interjections that make music feel alive!
   *
   * @deprecated Use on('midSongMoment', callback) instead for multiple listeners
   */
  setOnMidSongMomentCallback(callback: OnMidSongMomentCallback): void {
    // Legacy: store for backward compatibility
    this.onMidSongMomentCallback = callback;
    // Also register with event emitter for proper multi-listener support
    this.events.on('midSongMoment', callback);
  }

  // ==========================================================================
  // 🎧 EVENT EMITTER METHODS (Recommended)
  // ==========================================================================

  /**
   * Register an event listener
   *
   * Events:
   * - 'trackEnded': (track: MusicTrack, wasAmbient: boolean) => void
   * - 'stateChange': (state: MusicState, track: MusicTrack | null, isAmbient: boolean) => void
   * - 'midSongMoment': (track: MusicTrack, momentType: 'buildup' | 'drop' | 'highlight') => void
   */
  on<K extends keyof MusicPlayerEvents>(
    event: K,
    listener: (...args: MusicPlayerEvents[K]) => void
  ): this {
    this.events.on(event, listener);
    return this;
  }

  /**
   * Register a one-time event listener
   */
  once<K extends keyof MusicPlayerEvents>(
    event: K,
    listener: (...args: MusicPlayerEvents[K]) => void
  ): this {
    this.events.once(event, listener);
    return this;
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof MusicPlayerEvents>(
    event: K,
    listener: (...args: MusicPlayerEvents[K]) => void
  ): this {
    this.events.off(event, listener);
    return this;
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  removeAllListeners<K extends keyof MusicPlayerEvents>(event?: K): this {
    this.events.removeAllListeners(event);
    // Also clear legacy callbacks
    if (!event || event === 'trackEnded') this.onTrackEndedCallback = null;
    if (!event || event === 'stateChange') this.onMusicStateChangeCallback = null;
    if (!event || event === 'midSongMoment') this.onMidSongMomentCallback = null;
    return this;
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
    // Use ?? instead of || so duration of 0 doesn't falsely default to 30s
    const duration = track.duration ?? 30000;
    if (duration < 20000) {
      return;
    }

    // Schedule at 55-70% through the track (the exciting part!)
    const momentPercent = 0.55 + Math.random() * 0.15;
    const momentTime = duration * momentPercent;

    this.midSongMomentTimer = setTimeout(() => {
      // Only fire if still playing the same track
      if (this.state.isPlaying && this.state.currentTrack?.name === track.name) {
        // Pick moment type - mostly "buildup" with occasional "highlight"
        const momentType = Math.random() < 0.7 ? 'buildup' : 'highlight';

        getLogger().info({ track: track.name, momentType }, '🎤 Mid-song moment triggered!');

        // Emit to all listeners via EventEmitter
        this.events.emit('midSongMoment', track, momentType);
      }
    }, momentTime);

    getLogger().debug(
      { track: track.name, momentTime: Math.round(momentTime / 1000) },
      '🎤 Mid-song moment scheduled'
    );
  }

  /**
   * Notify listeners of state change
   *
   * 🎧 CRITICAL: This is how the frontend learns about music state changes.
   * The frontend uses this to show/hide the Now Playing UI and animate the avatar.
   *
   * Uses EventEmitter pattern - all registered listeners receive the event.
   */
  private notifyStateChange(state: MusicState): void {
    getLogger().debug(
      {
        state,
        track: this.state.currentTrack?.name,
        isAmbient: this.state.isAmbientMode,
      },
      '🎧 Notifying music state change'
    );

    // Emit to all listeners via EventEmitter
    this.events.emit('stateChange', state, this.state.currentTrack, this.state.isAmbientMode);
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
      // 🚨 CRITICAL: Music player not initialized - return false so agent doesn't announce playback!
      getLogger().error(
        {
          track: track.name,
          isInitialized: this.state.isInitialized,
          hasBackgroundPlayer: !!this.backgroundPlayer,
        },
        '🚨 Cannot play music - player not initialized! Call initializeMusicPlayer(room) first.'
      );
      return false;
    }

    try {
      // Stop any current playback
      if (DEBUG_MUSIC) log.debug('Stopping any current playback');
      this.stop();

      // Download the audio file (with DJ fade-out baked in)
      // 🐛 FIX: Now returns actual duration detected via ffprobe (iTunes previews vary!)
      if (DEBUG_MUSIC) log.debug('Downloading audio', { url });
      const downloadResult = await this.downloadAudio(url, track.name);
      if (DEBUG_MUSIC)
        log.debug('Download result', {
          success: downloadResult ? 'SUCCESS' : 'FAILED',
          audioPath: downloadResult?.path,
          actualDurationMs: downloadResult?.actualDurationMs,
        });
      if (!downloadResult) {
        log.error('Failed to download audio');
        return false;
      }

      const { path: audioPath, actualDurationMs } = downloadResult;

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
      // 🐛 FIX: Use ACTUAL duration from ffprobe, not hardcoded 30s
      const trackDuration = actualDurationMs;

      // 🐛 FIX: For short tracks, use 70% of duration instead of fixed 10s minimum
      // This ensures fade still triggers for tracks <15s
      const minFadeTime = Math.min(10000, trackDuration * 0.7);
      const fadeOutTime = Math.max(trackDuration - 5000, minFadeTime);

      getLogger().info(
        {
          track: track.name,
          actualDurationMs,
          fadeOutTime,
        },
        '🎧 Scheduled fade timer with ACTUAL duration'
      );

      // 🐛 FIX: Reset track end handled flag for new track
      this.trackEndHandled = false;

      // 🐛 FIX: Clear any existing backup timer
      if (this.trackEndBackupTimer) {
        clearTimeout(this.trackEndBackupTimer);
        this.trackEndBackupTimer = null;
      }

      // Schedule the fade notification
      // 🐛 FIX: Removed isDucked check - if agent is speaking when fade timer fires,
      // we were SKIPPING the outro entirely! Now we always notify 'fading' and let
      // the handler decide. The session.say() will queue properly.
      const fadeTimer = setTimeout(() => {
        if (this.state.isPlaying && this.state.currentTrack?.name === track.name) {
          getLogger().info(
            {
              track: track.name,
              isDucked: this.state.isDucked,
              actualDurationMs,
            },
            '🎧 DJ fade-out starting - notifying handlers'
          );
          this.notifyStateChange('fading');
        } else {
          getLogger().debug(
            {
              track: track.name,
              isPlaying: this.state.isPlaying,
              currentTrack: this.state.currentTrack?.name,
            },
            '🎧 Fade timer fired but track changed - skipping outro'
          );
        }
      }, fadeOutTime);

      // 🐛 FIX: Helper function to handle track end (used by both waitForPlayout and backup timer)
      const handleTrackEnd = (source: 'waitForPlayout' | 'backupTimer') => {
        // Prevent double-firing
        if (this.trackEndHandled) {
          getLogger().debug(
            { source, track: track.name },
            '🎧 Track end already handled, skipping'
          );
          return;
        }
        this.trackEndHandled = true;

        // Clear both timers
        clearTimeout(fadeTimer);
        if (this.trackEndBackupTimer) {
          clearTimeout(this.trackEndBackupTimer);
          this.trackEndBackupTimer = null;
        }

        getLogger().info(
          { source, track: track.name, duration: trackDuration },
          '🎧 Track ended - notifying agent'
        );

        const endedTrack = this.state.currentTrack;
        const wasAmbient = this.state.isAmbientMode;

        // 🎧 Mark track as fully played in history
        if (!wasAmbient) {
          this.markCurrentTrackCompleted();
        }

        this.onTrackEnded();

        // Emit trackEnded event to all listeners
        if (endedTrack) {
          this.events.emit('trackEnded', endedTrack, wasAmbient);
        }

        // Clean up temp file (after callback, in case callback needs track info)
        this.cleanupTempFile(audioPath);
      };

      // Wait for playback to complete, then cleanup
      if (this.currentPlayHandle) {
        void this.currentPlayHandle.waitForPlayout().then(() => {
          handleTrackEnd('waitForPlayout');
        });
      }

      // 🐛 FIX: Backup timer in case waitForPlayout never resolves
      // Add 2 second buffer to account for any processing delays
      const backupDelay = trackDuration + 2000;
      this.trackEndBackupTimer = setTimeout(() => {
        if (
          !this.trackEndHandled &&
          this.state.isPlaying &&
          this.state.currentTrack?.name === track.name
        ) {
          getLogger().warn(
            { track: track.name, expectedDuration: trackDuration },
            '🎧 Backup timer fired - waitForPlayout did not resolve in time'
          );
          handleTrackEnd('backupTimer');
        }
      }, backupDelay);

      getLogger().debug(
        { track: track.name, fadeOutTime, backupDelay },
        '🎧 Scheduled track timers'
      );

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
    const previousAudioPath = this.currentAudioPath;

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
    // This reduces latency - the new track is ready to go! (with DJ fade-out baked in)
    // 🐛 FIX: downloadAudio now returns actual duration from ffprobe
    const downloadPromise = this.downloadAudio(url, track.name);

    // 🎧 OPTIMIZED CROSSFADE: Download first, then do minimal transition
    // The agent speaks the transition phrase while we're downloading
    // Once download is ready, we do a quick swap (<500ms gap)
    const downloadResult = await downloadPromise;

    // Check download success BEFORE stopping current track
    if (!downloadResult) {
      log.error('Failed to download new track for crossfade - keeping current playback');
      this.state.isChangingTrack = false;
      // Keep current track playing, just notify the transition failed
      getLogger().warn(
        { fromTrack: previousTrack.name, toTrack: track.name },
        '🎧 Crossfade download failed - keeping current track'
      );
      return { success: false, previousTrack };
    }

    // Quick transition moment (agent has already started speaking)
    // 500ms is enough for the track to fade briefly without noticeable silence
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

    // Stop the current track immediately after brief fade
    if (this.currentPlayHandle && !this.currentPlayHandle.done()) {
      this.currentPlayHandle.stop();
    }

    const { path: audioPath, actualDurationMs } = downloadResult;

    // Start the new track
    this.state.currentTrack = track;
    this.state.isPlaying = true;
    this.state.isAmbientMode = isAmbient;
    this.state.isChangingTrack = false;
    this.currentAudioPath = audioPath;

    const volume = this.state.isDucked ? this.state.duckingVolume : this.state.volume;

    if (!this.backgroundPlayer) {
      log.error('Background player not initialized');
      // Clean up the downloaded file
      this.cleanupTempFile(audioPath);
      this.state.isPlaying = false;
      this.state.currentTrack = null;
      this.notifyStateChange('stopped');
      return { success: false, previousTrack };
    }

    this.currentPlayHandle = this.backgroundPlayer.play({ source: audioPath, volume }, false);

    // Clean up the previous track's temp file
    if (previousAudioPath && previousAudioPath !== audioPath) {
      this.cleanupTempFile(previousAudioPath);
    }

    getLogger().info(
      { track: track.name, artist: track.artist, volume, isAmbient },
      '🎧 Crossfade complete - new track playing!'
    );

    // Notify we're now playing the new track
    this.notifyStateChange('playing');

    // 🎧 Add to session history for DJ callbacks
    if (!isAmbient) {
      this.addToSessionHistory(track, true);
    }

    // 🎤 Schedule mid-song moment for new track
    this.scheduleMidSongMoment(track);

    // Set up the fade-out timer for this new track
    // 🐛 FIX: Use ACTUAL duration from ffprobe, not hardcoded 30s
    const trackDuration = actualDurationMs;

    // 🐛 FIX: For short tracks, use 70% of duration instead of fixed 10s minimum
    const minFadeTime = Math.min(10000, trackDuration * 0.7);
    const fadeOutTime = Math.max(trackDuration - 5000, minFadeTime);

    getLogger().info(
      {
        track: track.name,
        actualDurationMs,
        fadeOutTime,
      },
      '🎧 Scheduled fade timer with ACTUAL duration (crossfade)'
    );

    // 🐛 FIX: Reset track end handled flag for new track
    this.trackEndHandled = false;

    // 🐛 FIX: Clear any existing backup timer
    if (this.trackEndBackupTimer) {
      clearTimeout(this.trackEndBackupTimer);
      this.trackEndBackupTimer = null;
    }

    // 🐛 FIX: Removed isDucked check - same fix as playFromUrl
    const fadeTimer = setTimeout(() => {
      if (this.state.isPlaying && this.state.currentTrack?.name === track.name) {
        getLogger().info(
          {
            track: track.name,
            isDucked: this.state.isDucked,
            actualDurationMs,
          },
          '🎧 DJ fade-out starting (crossfade) - notifying handlers'
        );
        this.notifyStateChange('fading');
      }
    }, fadeOutTime);

    // 🐛 FIX: Helper function to handle track end (used by both waitForPlayout and backup timer)
    const handleTrackEnd = (source: 'waitForPlayout' | 'backupTimer') => {
      // Prevent double-firing
      if (this.trackEndHandled) {
        getLogger().debug({ source, track: track.name }, '🎧 Track end already handled, skipping');
        return;
      }
      this.trackEndHandled = true;

      // Clear both timers
      clearTimeout(fadeTimer);
      if (this.trackEndBackupTimer) {
        clearTimeout(this.trackEndBackupTimer);
        this.trackEndBackupTimer = null;
      }

      getLogger().info(
        { source, track: track.name, duration: trackDuration },
        '🎧 Track ended (crossfade) - notifying agent'
      );

      const endedTrack = this.state.currentTrack;
      const wasAmbient = this.state.isAmbientMode;

      // Mark track completed in history
      if (!wasAmbient) {
        this.markCurrentTrackCompleted();
      }

      this.onTrackEnded();

      // Emit trackEnded event to all listeners
      if (endedTrack) {
        this.events.emit('trackEnded', endedTrack, wasAmbient);
      }

      this.cleanupTempFile(audioPath);
    };

    // Handle track end
    if (this.currentPlayHandle) {
      void this.currentPlayHandle.waitForPlayout().then(() => {
        handleTrackEnd('waitForPlayout');
      });
    }

    // 🐛 FIX: Backup timer in case waitForPlayout never resolves
    const backupDelay = trackDuration + 2000;
    this.trackEndBackupTimer = setTimeout(() => {
      if (
        !this.trackEndHandled &&
        this.state.isPlaying &&
        this.state.currentTrack?.name === track.name
      ) {
        getLogger().warn(
          { track: track.name, expectedDuration: trackDuration },
          '🎧 Backup timer fired (crossfade) - waitForPlayout did not resolve in time'
        );
        handleTrackEnd('backupTimer');
      }
    }, backupDelay);

    getLogger().debug(
      { track: track.name, fadeOutTime, backupDelay },
      '🎧 Scheduled track timers (crossfade)'
    );

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
   * Download audio from URL to temp file and apply DJ fade-out
   *
   * 🐛 FIX: Now returns BOTH the file path AND the actual duration detected via ffprobe.
   * This is critical because iTunes previews vary in length (not always 30s exactly).
   *
   * 🐛 FIX: Now handles local file paths (starting with /) by reading from filesystem
   * instead of fetching via HTTP. This fixes session sounds not playing.
   *
   * @returns Object with path and actualDurationMs, or null if download failed
   */
  private async downloadAudio(
    url: string,
    trackName: string
  ): Promise<{ path: string; actualDurationMs: number } | null> {
    try {
      let buffer: ArrayBuffer;

      // Handle local file paths (e.g., /sounds/connect.mp3)
      if (url.startsWith('/') && !url.startsWith('//')) {
        // 🐛 FIX: __dirname doesn't work correctly in ESM modules in Docker
        // Use process.cwd() and explicit paths instead
        const cwd = process.cwd();
        
        // Try multiple locations for sound files:
        // 1. Production (Docker): /app/sounds/ - sounds copied to container root
        // 2. Development: frontend-typescript/public/sounds/
        const possiblePaths = [
          // Production: absolute path in Docker container
          `/app${url}`,
          // Also check relative to cwd (backup for Docker)
          path.join(cwd, url),
          // Sounds might be in /app/sounds directly (Docker copies them here)
          path.join(cwd, 'sounds', path.basename(url)),
          // Development: sounds are in frontend-typescript/public
          path.join(cwd, 'frontend-typescript/public', url),
          // Also try from src directory (development builds)
          path.join(cwd, 'src', '..', 'frontend-typescript/public', url),
        ];

        let localPath: string | null = null;
        for (const p of possiblePaths) {
          getLogger().debug({ path: p, exists: fs.existsSync(p) }, 'Checking sound file path');
          if (fs.existsSync(p)) {
            localPath = p;
            break;
          }
        }

        if (localPath) {
          getLogger().info(
            { localPath, url },
            '🎵 Found local audio file'
          );
          const fileBuffer = fs.readFileSync(localPath);
          buffer = fileBuffer.buffer.slice(
            fileBuffer.byteOffset,
            fileBuffer.byteOffset + fileBuffer.byteLength
          );
        } else {
          getLogger().error(
            { url, cwd, triedPaths: possiblePaths },
            '🎵 Local audio file not found in any location'
          );
          return null;
        }
      } else {
        // Fetch from HTTP URL
        const response = await fetch(url);
        if (!response.ok) {
          getLogger().error({ status: response.status }, 'Failed to fetch audio');
          return null;
        }
        buffer = await response.arrayBuffer();
      }

      // Generate filename from track name (sanitized)
      const safeName = trackName.replace(/[^a-z0-9]/gi, '_').slice(0, 30);
      const timestamp = Date.now();
      const rawFilename = `${safeName}_${timestamp}_raw.mp3`;
      const rawFilepath = path.join(this.tempDir, rawFilename);

      // Write to temp file
      fs.writeFileSync(rawFilepath, Buffer.from(buffer));

      getLogger().debug({ rawFilepath, size: buffer.byteLength }, 'Audio downloaded');

      // 🐛 FIX: Detect ACTUAL duration before applying fade
      let actualDurationMs = 30000; // Default fallback
      if (this.ffmpegAvailable) {
        try {
          const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${rawFilepath}"`;
          const { stdout } = await execAsync(probeCmd);
          const actualDurationSec = parseFloat(stdout.trim());
          if (!isNaN(actualDurationSec) && actualDurationSec > 0) {
            actualDurationMs = actualDurationSec * 1000;
            getLogger().debug(
              { actualDurationMs, actualDurationSec },
              '🎧 Detected actual audio duration'
            );
          }
        } catch (probeErr) {
          getLogger().warn({ error: probeErr }, '🎧 ffprobe duration detection failed');
        }
      }

      // 🎧 DJ-STYLE FADE OUT: Apply fade-out to the last 5 seconds using ffmpeg
      // This makes the track ending feel natural and intentional
      const fadedFilepath = await this.applyAudioFadeOut(rawFilepath, actualDurationMs);

      // Clean up the raw file if we successfully faded it
      if (fadedFilepath && fadedFilepath !== rawFilepath) {
        this.cleanupTempFile(rawFilepath);
        return { path: fadedFilepath, actualDurationMs };
      }

      // Fallback to raw file if fade failed
      return { path: rawFilepath, actualDurationMs };
    } catch (error) {
      getLogger().error({ error }, 'Failed to download audio');
      return null;
    }
  }

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
  private async applyAudioFadeOut(inputPath: string, actualDurationMs: number): Promise<string> {
    // Skip if ffmpeg not available (checked once at startup)
    if (!this.ffmpegAvailable) {
      return inputPath;
    }

    try {
      const actualDurationSec = actualDurationMs / 1000;
      const fadeOutDuration = 5; // 5 seconds of fade-out
      const fadeOutStart = Math.max(actualDurationSec - fadeOutDuration, 0);

      // Generate output filename
      const outputPath = inputPath.replace('_raw.mp3', '_faded.mp3');

      // ffmpeg command: apply audio fade-out for the last 5 seconds
      // -y = overwrite output, -loglevel error = quiet mode, -af = audio filter
      const ffmpegCmd = `ffmpeg -y -loglevel error -i "${inputPath}" -af "afade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}" "${outputPath}"`;

      if (DEBUG_MUSIC) {
        log.debug('🎧 Applying DJ fade-out', {
          inputPath,
          outputPath,
          actualDurationSec,
          fadeOutStart,
          fadeOutDuration,
        });
      }

      await execAsync(ffmpegCmd);

      getLogger().info(
        {
          outputPath,
          actualDuration: actualDurationSec.toFixed(2),
          fadeStart: fadeOutStart.toFixed(2),
          fadeDuration: fadeOutDuration,
        },
        '🎧 DJ fade-out applied successfully'
      );

      return outputPath;
    } catch (error) {
      // Log but don't fail - fall back to raw audio
      getLogger().warn({ error, inputPath }, '🎧 Failed to apply DJ fade-out - using raw audio');
      return inputPath;
    }
  }

  /**
   * Check if ffmpeg is available on this system
   */
  private async checkFfmpegAvailability(): Promise<boolean> {
    try {
      await execAsync('ffmpeg -version');
      return true;
    } catch {
      getLogger().info(
        '🎧 ffmpeg not available - DJ fade-out will be skipped (audio will end abruptly)'
      );
      return false;
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
   *
   * ⚠️ RETURNS FALSE - Audio will NOT be heard!
   * The agent should NOT announce that music is playing.
   */
  private simulatePlayback(track: MusicTrack): boolean {
    getLogger().error(
      {
        track: track.name,
        artist: track.artist,
        isInitialized: this.state.isInitialized,
        hasBackgroundPlayer: !!this.backgroundPlayer,
      },
      '🚨 MUSIC PLAYBACK FAILED - Player not initialized! Audio will NOT be heard.'
    );

    // DO NOT set state.isPlaying = true - no audio is actually playing!
    // DO NOT return true - the agent should not announce music is playing!

    return false;
  }

  /**
   * Called when current track ends
   *
   * 🎧 CRITICAL: This method MUST notify 'stopped' state when no more tracks in queue.
   * The frontend relies on this to hide the Now Playing UI.
   */
  private onTrackEnded(): void {
    // 🎤 Clear mid-song moment timer
    if (this.midSongMomentTimer) {
      clearTimeout(this.midSongMomentTimer);
      this.midSongMomentTimer = null;
    }

    if (this.state.queue.length > 0) {
      // Play next in queue
      const nextTrack = this.state.queue.shift()!;
      getLogger().info(
        {
          nextTrack: nextTrack.name,
          remainingInQueue: this.state.queue.length,
        },
        '🎧 Track ended - playing next in queue'
      );

      if (nextTrack.previewUrl) {
        // 🐛 FIX: Reset trackEndHandled so the new track's backup timer can work
        this.trackEndHandled = false;
        // 🐛 FIX: Clear backup timer from previous track (playFromUrl will set a new one)
        if (this.trackEndBackupTimer) {
          clearTimeout(this.trackEndBackupTimer);
          this.trackEndBackupTimer = null;
        }
        void this.playFromUrl(nextTrack.previewUrl, nextTrack);
      } else {
        // 🐛 FIX: Track has no previewUrl - skip to next or notify stopped
        getLogger().warn({ track: nextTrack.name }, '🎧 Queue track has no previewUrl - skipping');
        // Recursively try the next track in queue
        this.onTrackEnded();
      }
    } else {
      // 🎧 FIX: Save track info BEFORE clearing for proper notification
      // This ensures DJ Booth and frontend receive the track that just ended
      const endedTrack = this.state.currentTrack;
      const wasAmbient = this.state.isAmbientMode;

      getLogger().info(
        {
          track: endedTrack?.name,
          wasAmbient,
        },
        '🎧 Track ended - queue empty, notifying stopped'
      );

      // No more tracks - clear state
      this.state.isPlaying = false;
      this.state.currentTrack = null;
      this.state.isAmbientMode = false;
      this.currentPlayHandle = null;
      this.currentAudioPath = null;

      // ✨ CRITICAL: Notify 'stopped' state so frontend hides the Now Playing UI
      // This MUST happen even if endedTrack is null (defensive)
      if (this.onMusicStateChangeCallback) {
        getLogger().debug(
          {
            hasCallback: true,
            track: endedTrack?.name,
          },
          '🎧 Calling onMusicStateChangeCallback with stopped'
        );
        this.onMusicStateChangeCallback('stopped', endedTrack, wasAmbient);
      } else {
        // This should never happen in normal operation
        getLogger().warn(
          '🎧 No onMusicStateChangeCallback set - frontend will not be notified of track end!'
        );
      }
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    const pausedTrack = this.state.currentTrack;

    // 🎤 Clear mid-song moment timer
    if (this.midSongMomentTimer) {
      clearTimeout(this.midSongMomentTimer);
      this.midSongMomentTimer = null;
    }

    // 🐛 FIX: Clear backup timer on pause
    if (this.trackEndBackupTimer) {
      clearTimeout(this.trackEndBackupTimer);
      this.trackEndBackupTimer = null;
    }
    this.trackEndHandled = true; // Prevent backup timer from firing

    if (this.currentPlayHandle && !this.currentPlayHandle.done()) {
      this.currentPlayHandle.stop();
    }
    this.state.isPlaying = false;

    getLogger().info({ track: pausedTrack?.name }, '🎧 Music paused');

    // ✨ Notify frontend - pause state
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
   *
   * 🎧 This is called when:
   * - User explicitly stops music
   * - A new track is about to play (stop current first)
   * - Session is ending
   */
  stop(): void {
    const wasPlaying = this.state.isPlaying;
    const stoppedTrack = this.state.currentTrack;

    // 🎤 Clear mid-song moment timer
    if (this.midSongMomentTimer) {
      clearTimeout(this.midSongMomentTimer);
      this.midSongMomentTimer = null;
    }

    // 🐛 FIX: Clear backup timer on stop
    if (this.trackEndBackupTimer) {
      clearTimeout(this.trackEndBackupTimer);
      this.trackEndBackupTimer = null;
    }
    this.trackEndHandled = true; // Prevent backup timer from firing

    if (this.currentPlayHandle && !this.currentPlayHandle.done()) {
      this.currentPlayHandle.stop();
    }

    this.state.isPlaying = false;
    this.state.currentTrack = null;
    this.state.isAmbientMode = false;
    this.currentPlayHandle = null;
    this.currentAudioPath = null;

    getLogger().info(
      {
        wasPlaying,
        stoppedTrack: stoppedTrack?.name,
      },
      '🎧 Music stopped (explicit stop call)'
    );

    // ✨ Notify frontend - stop dancing and hide Now Playing UI
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
  /**
   * Duck the music (lower volume) when agent starts speaking
   *
   * ARCHITECTURE NOTE:
   * Backend (LiveKit BackgroundAudioPlayer) cannot do real-time volume changes.
   * The REAL ducking happens on the FRONTEND via Web Audio API GainNode.
   * See: frontend-typescript/src/services/music-audio.controller.ts
   *
   * This method:
   * 1. Sets state for tracking
   * 2. Pauses ambient music (it's meant to fill silence)
   * 3. Notifies frontend to duck via 'ducking' state
   */
  duck(): void {
    if (!this.state.isDucked) {
      this.state.isDucked = true;

      // For ambient music, pause it - it's meant to fill silence, not compete with speech
      if (this.state.isAmbientMode && this.state.isPlaying) {
        this.pause();
        getLogger().debug('🔉 Paused ambient music during agent speech');
      } else if (this.state.isPlaying) {
        // For user-requested music: notify frontend to duck via Web Audio GainNode
        // The frontend MusicAudioController handles the actual volume reduction
        this.notifyStateChange('ducking');
        getLogger().debug(
          {
            track: this.state.currentTrack?.name,
          },
          '🔉 Music ducking - frontend Web Audio will handle volume'
        );
      }
    }
  }

  /**
   * Unduck the music (restore volume) when agent stops speaking
   *
   * The REAL unduck happens on the frontend via Web Audio API.
   * This notifies the frontend to restore volume.
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
        // Notify frontend to restore volume via Web Audio GainNode
        this.notifyStateChange('playing');
        getLogger().debug(
          {
            track: this.state.currentTrack?.name,
          },
          '🔊 Music unduck - frontend Web Audio will restore volume'
        );
      }
    }
  }

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
  setVolume(volume: number): void {
    this.state.volume = Math.max(0, Math.min(1, volume));
    getLogger().debug(
      { volume: Math.round(this.state.volume * 100) },
      'Volume set (applies to next track)'
    );
  }

  /**
   * Get current volume setting (0-1)
   */
  getVolume(): number {
    return this.state.volume;
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
