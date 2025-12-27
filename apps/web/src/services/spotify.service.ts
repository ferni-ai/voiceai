/**
 * Spotify Service
 * 
 * Manages Spotify Web Playback SDK integration.
 * Provides type-safe APIs for music playback control.
 */

import type { SpotifyState } from '../types/events.js';
import { API } from '../config/index.js';
import { setSpotifyState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Spotify');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Spotify player instance (from Web Playback SDK).
 */
interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, callback: (...args: unknown[]) => void): boolean;
  removeListener(event: string, callback?: (...args: unknown[]) => void): boolean;
  getCurrentState(): Promise<SpotifyPlaybackState | null>;
  setName(name: string): Promise<void>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
}

/**
 * Extended window with Spotify SDK flags.
 */
interface SpotifyWindow extends Window {
  spotifySDKReady?: boolean;
}

/**
 * Spotify playback state.
 */
interface SpotifyPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      name: string;
      artists: Array<{ name: string }>;
      album: { name: string; images: Array<{ url: string }> };
    };
  };
}

/**
 * Spotify token response.
 */
interface SpotifyTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Spotify state callback.
 */
export type SpotifyStateCallback = (state: SpotifyState, trackInfo?: TrackInfo) => void;

/**
 * Track information.
 */
export interface TrackInfo {
  name: string;
  artist: string;
  album: string;
  imageUrl?: string;
}

// ============================================================================
// GLOBAL SPOTIFY TYPES
// ============================================================================

declare global {
  interface Window {
    Spotify?: {
      Player: new (config: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

// ============================================================================
// SPOTIFY SERVICE
// ============================================================================

/**
 * Spotify playback management service.
 */
class SpotifyService {
  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
  private accessToken: string | null = null;
  private state: SpotifyState = 'uninitialized';
  private callbacks: Set<SpotifyStateCallback> = new Set();
  private currentTrack: TrackInfo | null = null;
  private initPromise: Promise<boolean> | null = null;

  /**
   * Register a callback for state changes.
   */
  onStateChange(callback: SpotifyStateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Initialize the Spotify Web Playback SDK.
   * Returns true if successful, false if not available.
   */
  async initialize(): Promise<boolean> {
    // Return existing promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Already ready
    if (this.state === 'ready' || this.state === 'playing' || this.state === 'paused') {
      return true;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  /**
   * Check if Spotify is ready.
   */
  isReady(): boolean {
    return this.state === 'ready' || this.state === 'playing' || this.state === 'paused';
  }

  /**
   * Get current state.
   */
  getState(): SpotifyState {
    return this.state;
  }

  /**
   * Get current track info.
   */
  getCurrentTrack(): TrackInfo | null {
    return this.currentTrack;
  }

  /**
   * Pause playback.
   */
  async pause(): Promise<boolean> {
    if (!this.player || !this.isReady()) {
      return false;
    }

    try {
      const state = await this.player.getCurrentState();
      if (state && !state.paused) {
        await this.player.pause();
        this.updateState('paused');
        return true;
      }
      return false;
    } catch (error) {
      log.error('Failed to pause:', error);
      return false;
    }
  }

  /**
   * Resume playback.
   */
  async resume(): Promise<boolean> {
    if (!this.player || !this.isReady()) {
      return false;
    }

    try {
      await this.player.resume();
      this.updateState('playing');
      return true;
    } catch (error) {
      log.error('Failed to resume:', error);
      return false;
    }
  }

  /**
   * Toggle play/pause.
   */
  async togglePlayback(): Promise<boolean> {
    if (!this.player || !this.isReady()) {
      return false;
    }

    try {
      await this.player.togglePlay();
      const state = await this.player.getCurrentState();
      this.updateState(state?.paused ? 'paused' : 'playing');
      return true;
    } catch (error) {
      log.error('Failed to toggle playback:', error);
      return false;
    }
  }

  /**
   * Set volume (0-1).
   */
  async setVolume(volume: number): Promise<boolean> {
    if (!this.player || !this.isReady()) {
      return false;
    }

    try {
      await this.player.setVolume(Math.max(0, Math.min(1, volume)));
      return true;
    } catch (error) {
      log.error('Failed to set volume:', error);
      return false;
    }
  }

  /**
   * Get device ID for API calls.
   */
  getDeviceId(): string | null {
    return this.deviceId;
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.player) {
      // Check if disconnect exists (might not in test mocks after vi.clearAllMocks)
      if (typeof this.player.disconnect === 'function') {
        this.player.disconnect();
      }
      this.player = null;
    }
    this.deviceId = null;
    this.accessToken = null;
    this.initPromise = null;
    this.currentTrack = null;
    this.callbacks.clear();
    this.updateState('uninitialized');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Perform actual initialization.
   */
  private async doInitialize(): Promise<boolean> {
    this.updateState('initializing');

    try {
      // Check if Spotify is configured and linked FIRST
      // This prevents 400 errors when Spotify isn't set up
      const statusOk = await this.checkStatus();
      if (!statusOk) {
        log.debug('Spotify not configured or linked - skipping initialization');
        this.updateState('not_available');
        return false;
      }

      // Fetch token
      const token = await this.fetchToken();
      if (!token) {
        this.updateState('error');
        return false;
      }
      this.accessToken = token;

      // Wait for SDK to load
      await this.waitForSDK();

      // Create player
      const success = await this.createPlayer();
      if (!success) {
        this.updateState('error');
        return false;
      }

      return true;

    } catch (error) {
      log.error('Initialization failed:', error);
      this.updateState('error');
      return false;
    }
  }

  /**
   * Check if Spotify is configured and linked on the server.
   * This should be called BEFORE attempting to fetch tokens.
   * @returns true if Spotify is ready for use
   */
  private async checkStatus(): Promise<boolean> {
    try {
      const deviceId = localStorage.getItem('voiceai_deviceId') || 'unknown';
      const response = await fetch(`${API.SPOTIFY_STATUS}?device_id=${encodeURIComponent(deviceId)}`);
      
      if (!response.ok) {
        log.debug('Spotify status check failed');
        return false;
      }

      const data = await response.json() as {
        spotify_configured: boolean;
        linked: boolean;
      };

      // Only proceed if Spotify is configured AND linked
      if (!data.spotify_configured) {
        log.debug('Spotify not configured on server');
        return false;
      }

      if (!data.linked) {
        log.debug('Spotify not linked for this device');
        return false;
      }

      return true;
    } catch (error) {
      log.debug('Spotify status check error:', error);
      return false;
    }
  }

  /**
   * Fetch Spotify access token from server.
   */
  private async fetchToken(): Promise<string | null> {
    try {
      const deviceId = localStorage.getItem('voiceai_deviceId') || 'unknown';
      const response = await fetch(`${API.SPOTIFY_TOKEN}?device_id=${encodeURIComponent(deviceId)}`);
      if (!response.ok) {
        // Don't log warning - status check already determined we should skip
        return null;
      }

      const data = await response.json() as SpotifyTokenResponse;
      return data.access_token || null;

    } catch (error) {
      log.debug('Failed to fetch token:', error);
      return null;
    }
  }

  /**
   * Wait for Spotify SDK to be loaded.
   */
  private waitForSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      const spotifyWindow = window as SpotifyWindow;
      
      // Already loaded (callback already fired)
      if (window.Spotify ?? spotifyWindow.spotifySDKReady) {
        resolve();
        return;
      }

      // Wait for the custom event we dispatch from HTML
      const timeout = setTimeout(() => {
        reject(new Error('Spotify SDK load timeout'));
      }, 10000);

      const handler = () => {
        clearTimeout(timeout);
        resolve();
      };

      window.addEventListener('spotify-sdk-ready', handler, { once: true });
    });
  }

  /**
   * Create and connect the Spotify player.
   */
  private async createPlayer(): Promise<boolean> {
    if (!window.Spotify || !this.accessToken) {
      return false;
    }

    const token = this.accessToken;

    this.player = new window.Spotify.Player({
      name: 'VoiceAI Player',
      getOAuthToken: (cb) => cb(token),
      volume: 0.5,
    });

    // Wait for ready OR error event (with timeout)
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        log.warn('Player connection timed out');
        resolve(false);
      }, 10000); // 10 second timeout

      // Success handler
      this.player!.addListener('ready', (...args: unknown[]) => {
        clearTimeout(timeout);
        const data = args[0] as { device_id: string };
        this.deviceId = data.device_id;
        this.updateState('ready');
        resolve(true);
      });

      // Error handlers - resolve with false
      this.player!.addListener('initialization_error', (...args: unknown[]) => {
        clearTimeout(timeout);
        const data = args[0] as { message: string };
        log.error('Init error:', data.message);
        this.updateState('error');
        resolve(false);
      });

      this.player!.addListener('authentication_error', (...args: unknown[]) => {
        clearTimeout(timeout);
        const data = args[0] as { message: string };
        log.error('Auth error:', data.message);
        this.updateState('error');
        resolve(false);
      });

      this.player!.addListener('account_error', (...args: unknown[]) => {
        clearTimeout(timeout);
        const data = args[0] as { message: string };
        log.error('Account error:', data.message);
        this.updateState('error');
        resolve(false);
      });

      // Set up other event listeners
      this.setupOtherListeners();

      // Connect - don't await, let the events handle resolution
      this.player!.connect().catch((err) => {
        clearTimeout(timeout);
        log.error('Connect error:', err);
        this.updateState('error');
        resolve(false);
      });
    });
  }

  /**
   * Set up non-critical event listeners (playback state changes, etc.).
   * The critical events (ready, errors) are handled in createPlayer().
   */
  private setupOtherListeners(): void {
    if (!this.player) return;

    // Not ready (device temporarily unavailable)
    this.player.addListener('not_ready', (..._args: unknown[]) => {
      // Device temporarily unavailable - will reconnect automatically
    });

    // Playback state changed
    this.player.addListener('player_state_changed', (...args: unknown[]) => {
      const state = args[0] as SpotifyPlaybackState | null;
      if (!state) {
        this.currentTrack = null;
        return;
      }

      const track = state.track_window.current_track;
      this.currentTrack = {
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        imageUrl: track.album.images[0]?.url,
      };

      this.updateState(state.paused ? 'paused' : 'playing', this.currentTrack);
    });
  }

  /**
   * Update state and notify callbacks.
   */
  private updateState(newState: SpotifyState, trackInfo?: TrackInfo): void {
    this.state = newState;
    setSpotifyState(newState);

    for (const callback of this.callbacks) {
      try {
        callback(newState, trackInfo);
      } catch (error) {
        log.error('Callback error:', error);
      }
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton Spotify service instance.
 */
export const spotifyService = new SpotifyService();

