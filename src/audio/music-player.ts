/**
 * Music Player for LiveKit Calls
 * 
 * Streams music directly into the phone/web call with:
 * - Background music playback
 * - Automatic ducking when Jack speaks
 * - Play/pause/skip controls
 * - Spotify preview support
 * 
 * NOTE: This is a simplified implementation that manages state
 * and can be extended to actually stream audio when LiveKit
 * native audio publishing is needed.
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

export interface MusicTrack {
  name: string;
  artist: string;
  uri?: string;          // Spotify URI
  previewUrl?: string;   // 30-second preview URL
  duration?: number;     // Duration in ms
}

export interface MusicPlayerState {
  isPlaying: boolean;
  currentTrack: MusicTrack | null;
  volume: number;        // 0-1, normal playback volume
  duckingVolume: number; // 0-1, volume when Jack speaks
  isDucked: boolean;
  queue: MusicTrack[];
}

// ============================================================================
// MUSIC PLAYER CLASS
// ============================================================================

export class CallMusicPlayer {
  private state: MusicPlayerState = {
    isPlaying: false,
    currentTrack: null,
    volume: 0.3,         // Default 30% volume (background level)
    duckingVolume: 0.1,  // 10% when Jack speaks
    isDucked: false,
    queue: [],
  };
  
  // Track playback simulation (for now - actual streaming needs native audio setup)
  private playbackTimeout: NodeJS.Timeout | null = null;
  
  constructor() {
    getLogger().info('CallMusicPlayer initialized');
  }
  
  /**
   * Play a track from URL (Spotify preview or any audio URL)
   * 
   * NOTE: This currently simulates playback and tracks state.
   * Actual audio streaming into LiveKit calls requires native audio setup
   * which can be added when telephony is fully configured.
   */
  async playFromUrl(url: string, track: MusicTrack): Promise<boolean> {
    console.log(`\n🎵 [MUSIC] Playing from URL: ${url}`);
    console.log(`🎵 [MUSIC] Track: "${track.name}" by ${track.artist}`);
    
    try {
      // Stop any current playback
      this.stop();
      
      this.state.currentTrack = track;
      this.state.isPlaying = true;
      
      // Log that we're "playing" (actual audio streaming would happen here)
      console.log(`🎵 [MUSIC] ▶️ Now playing: ${track.name} by ${track.artist}`);
      console.log(`🎵 [MUSIC] Preview URL: ${url}`);
      getLogger().info({ track: track.name, artist: track.artist, url }, 'Music playback started');
      
      // Simulate 30-second preview duration
      const duration = track.duration || 30000;
      this.playbackTimeout = setTimeout(() => {
        this.onTrackEnded();
      }, Math.min(duration, 30000)); // Max 30 seconds for previews
      
      return true;
    } catch (error) {
      console.error('🎵 [MUSIC] Playback error:', error);
      getLogger().error({ error }, 'Music playback failed');
      return false;
    }
  }
  
  /**
   * Called when current track ends
   */
  private onTrackEnded(): void {
    console.log('🎵 [MUSIC] Track ended');
    
    if (this.state.queue.length > 0) {
      // Play next in queue
      const nextTrack = this.state.queue.shift()!;
      if (nextTrack.previewUrl) {
        this.playFromUrl(nextTrack.previewUrl, nextTrack);
      }
    } else {
      // No more tracks
      this.state.isPlaying = false;
      this.state.currentTrack = null;
      console.log('🎵 [MUSIC] Queue empty - playback complete');
    }
  }
  
  /**
   * Pause playback
   */
  pause(): void {
    this.state.isPlaying = false;
    console.log('🎵 [MUSIC] ⏸️ Paused');
  }
  
  /**
   * Resume playback
   */
  resume(): void {
    if (this.state.currentTrack) {
      this.state.isPlaying = true;
      console.log('🎵 [MUSIC] ▶️ Resumed');
    }
  }
  
  /**
   * Stop playback completely
   */
  stop(): void {
    this.state.isPlaying = false;
    this.state.currentTrack = null;
    
    if (this.playbackTimeout) {
      clearTimeout(this.playbackTimeout);
      this.playbackTimeout = null;
    }
    
    console.log('🎵 [MUSIC] ⏹️ Stopped');
  }
  
  /**
   * Skip to next track
   */
  skip(): void {
    this.onTrackEnded();
  }
  
  /**
   * Add track to queue
   */
  addToQueue(track: MusicTrack): void {
    this.state.queue.push(track);
    console.log(`🎵 [MUSIC] Added to queue: ${track.name}`);
  }
  
  /**
   * Duck the music (called when Jack starts speaking)
   */
  duck(): void {
    if (!this.state.isDucked) {
      this.state.isDucked = true;
      console.log('🎵 [MUSIC] Ducking (Jack speaking)');
    }
  }
  
  /**
   * Unduck the music (called when Jack stops speaking)
   */
  unduck(): void {
    if (this.state.isDucked) {
      this.state.isDucked = false;
      console.log('🎵 [MUSIC] Unducking (Jack finished)');
    }
  }
  
  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    this.state.volume = Math.max(0, Math.min(1, volume));
    console.log(`🎵 [MUSIC] Volume set to ${Math.round(this.state.volume * 100)}%`);
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
   * Cleanup
   */
  dispose(): void {
    this.stop();
    this.state.queue = [];
    console.log('🎵 [MUSIC] Disposed');
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
    musicPlayerInstance.dispose();
    musicPlayerInstance = null;
  }
}

