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
 */

import { voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SoundEffectsPlayer' });

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
   */
  isInitialized(): boolean {
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
    if (!this.isInitialized() || !this.audioPlayer) {
      log.debug('🔊 Sound effects player not initialized');
      return false;
    }

    try {
      this.isPlaying = true;

      // Download if it's a remote URL
      let audioPath: string = url;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const downloadedPath = await this.downloadSound(url);
        if (!downloadedPath) {
          this.isPlaying = false;
          return false;
        }
        audioPath = downloadedPath;
      }

      // Play through BackgroundAudioPlayer using the same API as MusicPlayer
      // { source: path, volume } is the options object
      this.currentPlayHandle = this.audioPlayer.play({ source: audioPath, volume }, false);

      // Wait for completion using waitForPlayout (same as MusicPlayer)
      await this.currentPlayHandle.waitForPlayout();

      // Cleanup temp file if we downloaded it
      if (audioPath !== url && audioPath.includes(os.tmpdir())) {
        try {
          fs.unlinkSync(audioPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      this.isPlaying = false;
      this.currentPlayHandle = null;
      log.debug('🔊 Sound effect completed', { url });
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

