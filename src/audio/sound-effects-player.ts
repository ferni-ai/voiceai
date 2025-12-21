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

import { voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SoundEffectsPlayer' });

// 🔧 RE-ENABLED: Sound effects now work with proper error handling
// fluent-ffmpeg errors are caught gracefully (same pattern as music player)
const SOUND_EFFECTS_ENABLED = true;

// Extract BackgroundAudioPlayer from the voice namespace
const { BackgroundAudioPlayer } = voice;
type PlayHandle = ReturnType<InstanceType<typeof BackgroundAudioPlayer>['play']>;

// AgentSession type for compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentSession = any;

// ============================================================================
// SOUND EFFECTS PLAYER CLASS
// ============================================================================

class SoundEffectsPlayer {
  private audioPlayer: InstanceType<typeof BackgroundAudioPlayer> | null = null;
  private currentPlayHandle: PlayHandle | null = null;
  private room: Room | null = null;
  private session: AgentSession | null = null;
  private isReady = false;
  private isPlaying = false;

  /**
   * Initialize the sound effects player
   * Must be called before playing any sounds
   */
  async initialize(room: Room, session?: AgentSession): Promise<boolean> {
    // Check if sound effects are enabled
    if (!SOUND_EFFECTS_ENABLED) {
      log.info('🔊 Sound effects disabled - using verbal fallbacks');
      return false;
    }

    if (this.isReady) {
      log.debug('🔊 Sound effects player already initialized');
      return true;
    }

    try {
      this.room = room;
      this.session = session;

      // Create dedicated BackgroundAudioPlayer for sound effects
      // This is separate from the music player's instance
      if (session) {
        this.audioPlayer = new BackgroundAudioPlayer(session);
        log.info('🔊 Sound effects player initialized with session');
      } else {
        log.warn('🔊 No session provided - sound effects will use verbal fallbacks');
        return false;
      }

      this.isReady = true;
      return true;
    } catch (error) {
      log.error('🔊 Failed to initialize sound effects player', { error: String(error) });
      return false;
    }
  }

  /**
   * Check if the player is ready to play sounds
   * Returns false if sound effects are disabled globally
   */
  isInitialized(): boolean {
    if (!SOUND_EFFECTS_ENABLED) {
      return false;
    }
    return this.isReady && this.audioPlayer !== null;
  }

  /**
   * Check if a sound is currently playing
   */
  isSoundPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Play a sound effect from a URL or local path
   * Fire-and-forget - no callbacks, no state changes
   *
   * @param url - URL or path to the sound file
   * @param volume - Volume 0-1 (default 0.5)
   * @returns Promise<boolean> - true if sound started playing
   */
  async playSound(url: string, volume = 0.5): Promise<boolean> {
    if (!SOUND_EFFECTS_ENABLED) {
      log.debug('🔊 Sound effects disabled');
      return false;
    }

    if (!this.isInitialized() || !this.audioPlayer) {
      log.debug('🔊 Sound effects player not initialized');
      return false;
    }

    // 🚨 CRASH-FIX: Check if room is still connected before playing
    if (this.room && !this.room.isConnected) {
      log.error(
        {
          roomIsConnected: this.room.isConnected,
        },
        '🚨 [CRASH-FIX] Cannot play sound - LiveKit room is disconnected'
      );
      return false;
    }

    try {
      this.isPlaying = true;

      // Resolve the audio path
      let audioPath: string = url;

      // Download if it's a remote URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const downloadedPath = await this.downloadSound(url);
        if (!downloadedPath) {
          this.isPlaying = false;
          return false;
        }
        audioPath = downloadedPath;
      }
      // Handle local file paths (e.g., /sounds/connect.mp3)
      else if (url.startsWith('/') && !url.startsWith('//')) {
        const resolvedPath = this.resolveLocalSoundPath(url);
        if (!resolvedPath) {
          log.warn('🔊 Sound file not found', { url });
          this.isPlaying = false;
          return false;
        }
        audioPath = resolvedPath;
        log.debug({ url, resolvedPath }, '🔊 Resolved local sound path');
      }

      // Play through BackgroundAudioPlayer
      // 🚨 CRASH-FIX: Wrap in try-catch for room disconnect during playback
      log.info({ url, volume }, '🔊 Playing sound effect');
      try {
        this.currentPlayHandle = this.audioPlayer.play({ source: audioPath, volume }, false);
      } catch (playError) {
        log.error(
          {
            error: String(playError),
            url,
            roomIsConnected: this.room?.isConnected,
          },
          '🚨 [CRASH-FIX] audioPlayer.play() threw - room likely disconnected'
        );
        this.isPlaying = false;
        // Cleanup temp file if we downloaded it
        if (audioPath !== url && audioPath.includes(os.tmpdir())) {
          try {
            fs.unlinkSync(audioPath);
          } catch {
            // Ignore cleanup errors
          }
        }
        return false;
      }

      // 🔧 FIX: Handle fluent-ffmpeg errors gracefully (same pattern as music player)
      // Use .then()/.catch() instead of await to handle "Output stream closed" errors
      const playStartTime = Date.now();
      this.currentPlayHandle
        .waitForPlayout()
        .then(() => {
          // Sound completed successfully
          this.isPlaying = false;
          this.currentPlayHandle = null;
          log.debug('🔊 Sound effect completed', { url, durationMs: Date.now() - playStartTime });

          // Cleanup temp file if we downloaded it
          if (audioPath !== url && audioPath.includes(os.tmpdir())) {
            try {
              fs.unlinkSync(audioPath);
            } catch {
              // Ignore cleanup errors
            }
          }
        })
        .catch((err: unknown) => {
          // fluent-ffmpeg can throw "Output stream closed" when sounds end abruptly
          // This is NOT fatal - the sound likely played fine
          this.isPlaying = false;
          this.currentPlayHandle = null;
          const elapsedMs = Date.now() - playStartTime;
          log.debug(
            { url, error: String(err), elapsedMs },
            '🔊 Sound effect waitForPlayout error (non-fatal, sound likely played)'
          );

          // Cleanup temp file anyway
          if (audioPath !== url && audioPath.includes(os.tmpdir())) {
            try {
              fs.unlinkSync(audioPath);
            } catch {
              // Ignore cleanup errors
            }
          }
        });

      // Return true immediately - sound is playing (we don't await completion)
      return true;
    } catch (error) {
      this.isPlaying = false;
      this.currentPlayHandle = null;
      log.warn('🔊 Failed to play sound effect', { url, error: String(error) });
      return false;
    }
  }

  /**
   * Download a sound from URL to temp file
   */
  private async downloadSound(url: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        log.warn('🔊 Failed to download sound', { url, status: response.status });
        return null;
      }

      const buffer = await response.arrayBuffer();
      const tempPath = path.join(os.tmpdir(), `ferni-sfx-${Date.now()}.mp3`);

      fs.writeFileSync(tempPath, Buffer.from(buffer));
      return tempPath;
    } catch (error) {
      log.warn('🔊 Error downloading sound', { url, error: String(error) });
      return null;
    }
  }

  /**
   * Resolve a local sound file path (e.g., /sounds/connect.mp3)
   * Tries multiple locations for dev vs production environments
   */
  private resolveLocalSoundPath(url: string): string | null {
    const cwd = process.cwd();

    // Try multiple locations - different depending on environment:
    // 1. Production (Docker): /app/sounds/ - sounds copied to container root
    // 2. Development: apps/web/public/sounds/
    // 3. dist builds: sounds copied to dist/sounds/
    const possiblePaths = [
      // Production: absolute path in Docker container
      `/app${url}`,
      // Also check relative to cwd (backup for Docker)
      path.join(cwd, url),
      // Sounds might be in /app/sounds directly (Docker copies them here)
      path.join(cwd, 'sounds', path.basename(url)),
      // Development: sounds are in apps/web/public
      path.join(cwd, 'apps/web/public', url),
      // Also try from src directory (development builds)
      path.join(cwd, 'src', '..', 'apps/web/public', url),
      // dist/sounds (if sounds are copied to dist during build)
      path.join(cwd, 'dist', url),
      path.join(cwd, 'dist', 'sounds', path.basename(url)),
      // public folder at project root
      path.join(cwd, 'public', url),
      path.join(cwd, 'public', 'sounds', path.basename(url)),
      // apps/web deployment (monorepo)
      path.join(cwd, 'apps', 'web', 'public', url),
      // absolute path as-is (in case url is already a full path)
      url,
    ];

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          return p;
        }
      } catch {
        // Ignore access errors, try next path
      }
    }

    return null;
  }

  /**
   * Stop any currently playing sound effect
   */
  stop(): void {
    if (this.currentPlayHandle && !this.currentPlayHandle.done()) {
      try {
        this.currentPlayHandle.stop();
        this.isPlaying = false;
        this.currentPlayHandle = null;
        log.debug('🔊 Sound effect stopped');
      } catch (error) {
        log.warn('🔊 Error stopping sound', { error: String(error) });
      }
    }
  }

  /**
   * Reset the player (for cleanup)
   */
  reset(): void {
    this.stop();
    this.audioPlayer = null;
    this.room = null;
    this.session = null;
    this.isReady = false;
    this.isPlaying = false;
    this.currentPlayHandle = null;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let soundEffectsPlayerInstance: SoundEffectsPlayer | null = null;

/**
 * Get the singleton sound effects player instance
 */
export function getSoundEffectsPlayer(): SoundEffectsPlayer {
  if (!soundEffectsPlayerInstance) {
    soundEffectsPlayerInstance = new SoundEffectsPlayer();
  }
  return soundEffectsPlayerInstance;
}

/**
 * Initialize the sound effects player
 * Should be called during session setup, BEFORE session.start()
 */
export async function initializeSoundEffectsPlayer(
  room: Room,
  session?: AgentSession
): Promise<boolean> {
  const player = getSoundEffectsPlayer();
  return player.initialize(room, session);
}

/**
 * Reset the sound effects player (for cleanup)
 */
export function resetSoundEffectsPlayer(): void {
  if (soundEffectsPlayerInstance) {
    soundEffectsPlayerInstance.reset();
    soundEffectsPlayerInstance = null;
  }
}

export default SoundEffectsPlayer;
