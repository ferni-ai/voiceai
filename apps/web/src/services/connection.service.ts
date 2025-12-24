/**
 * Connection Service
 *
 * Manages LiveKit room connections with type-safe APIs.
 * Handles token fetching, room creation, and connection lifecycle.
 */

// Use global LiveKit from UMD script (better iOS compatibility)
// The UMD script is loaded in index.html before this module
declare global {
  interface Window {
    LiveKit: {
      Room: new (options?: Record<string, unknown>) => LiveKitRoom;
      RoomEvent: typeof RoomEventEnum;
      Track: { Kind: { Audio: string; Video: string } };
    };
  }
}

// LiveKit types from global - use 'any' for flexibility with event handlers
/* eslint-disable @typescript-eslint/no-explicit-any */
interface LiveKitRoom {
  state: string;
  name: string;
  localParticipant: {
    identity: string;
    setMicrophoneEnabled(enabled: boolean): Promise<void>;
    getTrackPublications(): any[];
    publishData(data: Uint8Array, options?: any): Promise<void>;
  };
  remoteParticipants: Map<string, any>;
  connect(url: string, token: string, options?: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  on(event: string, callback: (...args: any[]) => void): LiveKitRoom;
  off(event: string, callback: (...args: any[]) => void): LiveKitRoom;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const RoomEventEnum = {
  Connected: 'connected',
  Disconnected: 'disconnected',
  ConnectionStateChanged: 'connectionStateChanged',
  TrackSubscribed: 'trackSubscribed',
  DataReceived: 'dataReceived',
  ParticipantConnected: 'participantConnected',
  ParticipantDisconnected: 'participantDisconnected',
} as const;

// Get LiveKit from global (loaded via UMD script in index.html)
const getLiveKit = () => {
  const liveKit = typeof window !== 'undefined' ? window.LiveKit : undefined;
  if (liveKit) {
    return liveKit;
  }
  throw new Error('LiveKit not loaded. Make sure the UMD script is included.');
};

import { API } from '../config/index.js';
import { appState, setConnectionState } from '../state/app.state.js';
import type { ConnectionState, DataMessage } from '../types/events.js';
import type { RoomState, TokenRequest, TokenResponse } from '../types/livekit.js';
import { isValidTokenResponse } from '../types/livekit.js';
import { createLogger } from '../utils/logger.js';
import { spotifyService } from './spotify.service.js';

const log = createLogger('Connection');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Connection event callbacks.
 */
export interface ConnectionCallbacks {
  onStateChange?: (state: ConnectionState) => void;
  onAgentConnected?: (participantId: string) => void;
  onAgentDisconnected?: () => void;
  onDataMessage?: (message: DataMessage) => void;
  /** Called when agent audio track is available. Includes the audio element and track for visualization. */
  onAudioTrack?: (
    audioElement: HTMLAudioElement,
    participantId: string,
    mediaStreamTrack?: MediaStreamTrack
  ) => void;
  /** Called when agent audio track ends (agent stops speaking). */
  onAudioTrackEnd?: (participantId: string) => void;
  /** 🎚️ Called when a MUSIC audio track is detected. Route to MusicAudioController for ducking. */
  onMusicTrack?: (audioElement: HTMLAudioElement, trackId: string) => void;
  /** 🎚️ Called when music track ends. */
  onMusicTrackEnd?: (trackId: string) => void;
  onLocalMicActive?: (isActive: boolean) => void;
  onConnectionQuality?: (latencyMs: number) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// CONNECTION SERVICE
// ============================================================================

/**
 * LiveKit connection management service.
 */
class ConnectionService {
  private room: LiveKitRoom | null = null;
  private callbacks: ConnectionCallbacks = {};
  private cleanupFunctions: (() => void)[] = [];
  private qualityMonitorInterval: number | null = null;
  // Cache audio elements by participant to prevent duplicate creation
  private audioElements: Map<string, HTMLAudioElement> = new Map();

  // Track intentional disconnects vs crashes
  private isDisconnecting = false;

  // 🎚️ Music track identification
  // When we receive music_state: playing, we expect a music track soon
  private expectingMusicTrack = false;
  private expectingMusicTrackTimeout: ReturnType<typeof setTimeout> | null = null;
  private musicTrackIds: Set<string> = new Set(); // Track IDs identified as music
  private voiceTrackId: string | null = null; // First track is usually voice

  // 🐛 FIX: Buffer for tracks that arrive BEFORE the data message
  // This fixes the race condition where audio arrives before music_state message
  private pendingMusicTracks: Map<string, { audioEl: HTMLAudioElement; timestamp: number }> =
    new Map();
  private pendingTrackCleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly PENDING_TRACK_TTL_MS = 5000; // 5 seconds to match with data message

  /**
   * Register callbacks for connection events.
   */
  setCallbacks(callbacks: ConnectionCallbacks): void {
    this.callbacks = callbacks;
  }

  // ==========================================================================
  // 🎚️ MUSIC TRACK IDENTIFICATION
  // ==========================================================================

  /**
   * Signal that we're expecting a music track soon.
   * Called when we receive music_state: 'playing' from backend.
   *
   * 🐛 FIX: Now also checks pending tracks buffer for tracks that
   * arrived BEFORE this message (race condition fix).
   */
  expectMusicTrack(): void {
    this.expectingMusicTrack = true;

    // Clear any existing timeout
    if (this.expectingMusicTrackTimeout) {
      clearTimeout(this.expectingMusicTrackTimeout);
    }

    // 🐛 FIX: Check if any pending tracks are waiting to be identified
    // This handles the case where audio arrives BEFORE the data message
    if (this.pendingMusicTracks.size > 0) {
      log.info('🎚️ Found pending tracks waiting for identification', {
        count: this.pendingMusicTracks.size,
      });

      // Identify the most recent pending track as music
      let mostRecentTrack: { trackKey: string; audioEl: HTMLAudioElement } | null = null;
      let mostRecentTime = 0;

      for (const [trackKey, { audioEl, timestamp }] of this.pendingMusicTracks) {
        if (timestamp > mostRecentTime) {
          mostRecentTime = timestamp;
          mostRecentTrack = { trackKey, audioEl };
        }
      }

      if (mostRecentTrack) {
        const { trackKey, audioEl } = mostRecentTrack;
        this.musicTrackIds.add(trackKey);
        this.pendingMusicTracks.delete(trackKey);

        log.info('🎚️ Music track identified (retroactive - audio arrived before data message)', {
          trackKey,
          latencyMs: Date.now() - mostRecentTime,
        });

        // Route to MusicAudioController for ducking
        this.callbacks.onMusicTrack?.(audioEl, trackKey);

        // Clear expecting flag since we found the track
        this.expectingMusicTrack = false;
        return;
      }
    }

    // Stop expecting after 5 seconds (increased from 3s for reliability)
    this.expectingMusicTrackTimeout = setTimeout(() => {
      this.expectingMusicTrack = false;
      this.expectingMusicTrackTimeout = null;
      log.debug('🎚️ Music track expectation timed out');
    }, 5000);

    log.debug('🎚️ Expecting music track...');
  }

  /**
   * Add a track to the pending buffer.
   * Called when a track arrives but we're not sure if it's music.
   */
  private addPendingMusicTrack(trackKey: string, audioEl: HTMLAudioElement): void {
    this.pendingMusicTracks.set(trackKey, { audioEl, timestamp: Date.now() });

    // Start cleanup interval if not running
    if (!this.pendingTrackCleanupInterval) {
      this.pendingTrackCleanupInterval = setInterval(() => {
        this.cleanupOldPendingTracks();
      }, 2000);
    }

    log.debug('🎚️ Track added to pending buffer', { trackKey });
  }

  /**
   * Remove old pending tracks that were never identified.
   */
  private cleanupOldPendingTracks(): void {
    const now = Date.now();
    let removed = 0;

    for (const [trackKey, { timestamp }] of this.pendingMusicTracks) {
      if (now - timestamp > this.PENDING_TRACK_TTL_MS) {
        this.pendingMusicTracks.delete(trackKey);
        removed++;
      }
    }

    // Stop interval if no more pending tracks
    if (this.pendingMusicTracks.size === 0 && this.pendingTrackCleanupInterval) {
      clearInterval(this.pendingTrackCleanupInterval);
      this.pendingTrackCleanupInterval = null;
    }

    if (removed > 0) {
      log.debug('🎚️ Cleaned up old pending tracks', { removed });
    }
  }

  /**
   * Check if a track is a music track.
   */
  isMusicTrack(trackId: string): boolean {
    return this.musicTrackIds.has(trackId);
  }

  /**
   * Mark a track as ended (for cleanup).
   */
  private handleTrackEnded(trackId: string): void {
    if (this.musicTrackIds.has(trackId)) {
      this.musicTrackIds.delete(trackId);
      this.callbacks.onMusicTrackEnd?.(trackId);
      log.debug('🎚️ Music track ended', { trackId });
    }
    if (this.voiceTrackId === trackId) {
      this.voiceTrackId = null;
    }
    // Also clean from pending buffer
    this.pendingMusicTracks.delete(trackId);
  }

  /**
   * Check if we're expecting a music track (music_state: playing was received).
   * Used by fallback UI logic to distinguish real music from system stingers.
   * System stingers (sound-*) don't send music_state messages.
   */
  isExpectingMusic(): boolean {
    return this.expectingMusicTrack;
  }

  /**
   * Connect to a LiveKit room.
   */
  async connect(): Promise<boolean> {
    if (this.room?.state === 'connected') {
      log.warn('Already connected');
      return true;
    }

    try {
      this.updateState('connecting');

      // CRITICAL FIX: Wait for Firebase Auth to initialize before connecting
      // This ensures we have the Firebase UID for proper user identification
      try {
        const { initializeAuth } = await import('./auth-init.service.js');
        await initializeAuth();
        log.debug('Firebase auth ready for connection');
      } catch (authError) {
        // Continue even if auth fails - will fall back to device ID
        log.warn('Auth init failed, will use device ID:', authError);
      }

      // Get connection parameters from state (now with Firebase UID if available)
      const state = appState.getState();

      // Check for claimed demo conversation ("Better than human")
      let claimedDemoConversation;
      try {
        const { getClaimedConversation } = await import('./demo-claim.service.js');
        claimedDemoConversation = getClaimedConversation() ?? undefined;
        if (claimedDemoConversation) {
          log.info('Including claimed demo conversation in connection');
        }
      } catch (e) {
        // Demo claim service not available, continue without
      }

      // 🌍 Load user's accent preference for international voice support
      let preferredAccent: string | undefined;
      try {
        const { apiGet } = await import('../utils/api.js');
        const accentResponse = await apiGet<{ accent?: string }>('/api/user/accent');
        if (accentResponse.ok && accentResponse.data?.accent) {
          preferredAccent = accentResponse.data.accent;
          log.debug('Using saved accent preference:', preferredAccent);
        }
      } catch (e) {
        // Accent preference not available, will use geo-detection on backend
        log.debug('Accent preference not loaded, will use geo-detection');
      }

      const tokenRequest: TokenRequest = {
        room: `voice-${Date.now()}`,
        username: state.userName ?? 'User',
        deviceId: state.deviceId,
        personaId: state.selectedPersona.id,
        // Firebase UID for cross-device user identification (Priority 2 in voice agent)
        firebaseUid: state.firebaseUid ?? undefined,
        // 🌍 User's preferred voice accent (international support)
        preferredAccent,
        // Claimed demo conversation (Better than human - remember first conversation)
        claimedDemoConversation,
      };

      // Debug: Log identity being used for connection
      log.info('Connection identity', {
        firebaseUid: state.firebaseUid ? state.firebaseUid.substring(0, 8) + '...' : 'none',
        deviceId: state.deviceId.substring(0, 16) + '...',
        hasFirebaseUid: !!state.firebaseUid,
      });

      // Fetch token
      let tokenResponse;
      try {
        tokenResponse = await this.fetchToken(tokenRequest);
      } catch (tokenError) {
        log.error('Token fetch failed:', tokenError);
        throw new Error(
          `Token fetch failed: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`
        );
      }

      // Create and configure room using global LiveKit (iOS compatible)
      const LiveKit = getLiveKit();
      this.room = new LiveKit.Room({
        adaptiveStream: true,
        dynacast: true,
        stopLocalTrackOnUnpublish: true,
      });

      // Set up event handlers
      this.setupRoomHandlers();

      // Connect to room
      try {
        await this.room.connect(tokenResponse.url, tokenResponse.token, {
          autoSubscribe: true,
        });
      } catch (roomError) {
        log.error('Room connection failed:', roomError);
        throw new Error(
          `Room connection failed: ${roomError instanceof Error ? roomError.message : String(roomError)}`
        );
      }

      // Enable microphone so the agent can hear us
      try {
        await this.room.localParticipant.setMicrophoneEnabled(true);
      } catch (micError) {
        const errMsg = micError instanceof Error ? micError.message : String(micError);
        log.warn('Microphone not available:', errMsg);
        // On iOS, this might fail - continue anyway so user can at least hear
      }

      this.updateState('connected');
      this.startQualityMonitoring();

      // 📊 Initialize disconnect diagnostics session
      try {
        const { startSession, trackPeerConnection } = await import('./disconnect-diagnostics.service.js');
        const sessionId = tokenResponse.roomName || `session-${Date.now()}`;
        startSession(sessionId, tokenResponse.roomName || 'unknown', tokenResponse.identity);
        
        // Track the RTCPeerConnection for WebRTC diagnostics
        // LiveKit's Room internally uses RTCPeerConnection - try to access it
        const pc = (this.room as any).engine?.pcManager?.publisher?.pc as RTCPeerConnection | undefined;
        if (pc) {
          trackPeerConnection(pc);
          log.debug('📊 Tracking RTCPeerConnection for diagnostics');
        }
      } catch (err) {
        log.debug({ error: String(err) }, 'Disconnect diagnostics not available');
      }

      // Initialize Spotify Web Playback SDK now that user has interacted
      // This must happen after user interaction (browser autoplay policy)
      spotifyService.initialize().then((success) => {
        if (success) {
          log.info('🎵 Spotify Web Playback initialized');
        } else {
          log.debug('Spotify not available (not linked or not Premium)');
        }
      }).catch((err) => {
        log.warn('Spotify init failed:', err);
      });

      return true;
    } catch (error) {
      log.error('Connection failed:', error);
      this.updateState('error');
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Disconnect from the current room.
   */
  async disconnect(): Promise<void> {
    if (!this.room) return;

    // Mark as intentional disconnect (for crash analytics)
    this.isDisconnecting = true;

    try {
      // Stop quality monitoring
      this.stopQualityMonitoring();

      // Clean up event handlers
      this.cleanup();

      // Clean up cached audio elements
      this.audioElements.forEach((audioEl) => {
        audioEl.pause();
        audioEl.remove();
      });
      this.audioElements.clear();

      // Disconnect
      await this.room.disconnect();
      this.room = null;

      this.updateState('disconnected');
    } catch (error) {
      log.error('Disconnect error:', error);
    } finally {
      this.isDisconnecting = false;
    }
  }

  /**
   * Get current room state.
   */
  getRoomState(): RoomState {
    if (!this.room) {
      return {
        isConnected: false,
        roomName: null,
        localParticipantId: null,
        remoteParticipantCount: 0,
        hasActiveAudio: false,
      };
    }

    return {
      isConnected: this.room.state === 'connected',
      roomName: this.room.name,
      localParticipantId: this.room.localParticipant?.identity ?? null,
      remoteParticipantCount: this.room.remoteParticipants.size,
      hasActiveAudio: this.hasActiveAudioTrack(),
    };
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.room?.state === 'connected';
  }

  /**
   * Get the LiveKit room instance (for advanced use cases).
   */
  getRoom(): LiveKitRoom | null {
    return this.room;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Fetch token from server.
   */
  private async fetchToken(request: TokenRequest): Promise<TokenResponse> {
    const params = new URLSearchParams({
      room: request.room,
      username: request.username,
      device_id: request.deviceId,
      persona_id: request.personaId,
    });

    // Add Firebase UID if available (Priority 2 for user identification)
    if (request.firebaseUid) {
      params.set('firebase_uid', request.firebaseUid);
    }

    // Add user's preferred accent for voice localization (🌍 international accent support)
    if (request.preferredAccent) {
      params.set('accent', request.preferredAccent);
    }

    // Add claimed demo conversation if available (Better than human)
    if (request.claimedDemoConversation) {
      params.set('claimed_demo', JSON.stringify(request.claimedDemoConversation));
    }

    const url = `${API.TOKEN}?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        // iOS sometimes needs explicit cache control
        cache: 'no-cache',
      });
    } catch (fetchError) {
      log.error('Fetch error:', fetchError);
      throw new Error(
        `Network error: ${fetchError instanceof Error ? fetchError.message : 'Failed to connect'}`
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      log.error('Token error response:', errorText);
      throw new Error(`Token request failed: ${response.status} - ${errorText.slice(0, 100)}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (jsonError) {
      log.error('JSON parse error:', jsonError);
      throw new Error('Invalid response format from server');
    }

    if (!isValidTokenResponse(data)) {
      log.error('Invalid token response:', data);
      throw new Error('Invalid token response from server');
    }

    return data;
  }

  /**
   * Set up room event handlers.
   */
  private setupRoomHandlers(): void {
    if (!this.room) return;

    // Connection state changes
    const onConnectionStateChange = async (state: string) => {
      const mapped = this.mapConnectionState(state);
      this.updateState(mapped);

      // Update crash reporter context
      try {
        const { updateCrashContext } = await import('./crash-reporter.service.js');
        updateCrashContext({
          connectionState: mapped as 'connecting' | 'connected' | 'reconnecting' | 'disconnected',
          roomName: this.room?.name,
        });
      } catch {
        // Crash reporter not available
      }
    };
    this.room.on('connectionStateChanged', onConnectionStateChange);
    this.cleanupFunctions.push(() => {
      this.room?.off('connectionStateChanged', onConnectionStateChange);
    });

    // 🔄 Handle reconnection - re-enable microphone after LiveKit reconnects
    // This fixes the issue where mic disconnects and needs to be manually re-enabled
    const onReconnected = async () => {
      log.info('🔄 Room reconnected - re-enabling microphone');
      try {
        // Check if mic should be enabled (user hasn't muted)
        const isMuted = (window as any).appState?.get?.('isMuted') ?? false;
        if (!isMuted && this.room?.localParticipant) {
          await this.room.localParticipant.setMicrophoneEnabled(true);
          log.info('🎤 Microphone re-enabled after reconnection');
        }
      } catch (err) {
        log.warn('Failed to re-enable mic after reconnection:', err);
      }
    };
    this.room.on('reconnected', onReconnected);
    this.cleanupFunctions.push(() => {
      this.room?.off('reconnected', onReconnected);
    });

    // Participant connected (agent joins)
    const onParticipantConnected = (participant: { identity: string; isLocal?: boolean }) => {
      if (!participant.isLocal) {
        this.callbacks.onAgentConnected?.(participant.identity);
      }
    };
    this.room.on('participantConnected', onParticipantConnected);
    this.cleanupFunctions.push(() => {
      this.room?.off('participantConnected', onParticipantConnected);
    });

    // Participant disconnected
    const onParticipantDisconnected = (participant: { identity: string; isLocal?: boolean }) => {
      if (!participant.isLocal) {
        this.callbacks.onAgentDisconnected?.();
      }
    };
    this.room.on('participantDisconnected', onParticipantDisconnected);
    this.cleanupFunctions.push(() => {
      this.room?.off('participantDisconnected', onParticipantDisconnected);
    });

    // Track subscribed (audio from agent) - use simple attach() like old frontend
    // FIX: Support MULTIPLE audio tracks per participant (voice + background music)
    const onTrackSubscribed = (
      track: {
        kind: string;
        attach: () => HTMLMediaElement;
        mediaStreamTrack: MediaStreamTrack;
        sid?: string;
      },
      _publication: unknown,
      participant: { identity: string }
    ) => {
      if (track.kind === 'audio') {
        // Use track SID + participant identity to support multiple audio tracks
        // (e.g., agent voice track + BackgroundAudioPlayer music track)
        const trackKey = `${participant.identity}-${track.sid || track.mediaStreamTrack.id || Date.now()}`;

        // Check if we already have this specific track attached
        let audioEl = this.audioElements.get(trackKey);

        if (audioEl) {
          // Just fire the callback with existing element and track
          this.callbacks.onAudioTrack?.(audioEl, participant.identity, track.mediaStreamTrack);
          return;
        }

        // Create new audio element via LiveKit's track.attach()
        // Each track gets its own audio element (voice and music play simultaneously)
        audioEl = track.attach() as HTMLAudioElement;
        this.audioElements.set(trackKey, audioEl);

        // 🎚️ MUSIC TRACK IDENTIFICATION
        // Determine if this is a music track or voice track
        //
        // RACE CONDITION FIX:
        // Audio track might arrive BEFORE the music_state data message.
        // We now buffer unknown tracks and retroactively identify them
        // when expectMusicTrack() is called.
        let isMusicTrack = false;

        if (this.expectingMusicTrack) {
          // We received a music_state: playing message, so this is likely music
          isMusicTrack = true;
          this.expectingMusicTrack = false;
          if (this.expectingMusicTrackTimeout) {
            clearTimeout(this.expectingMusicTrackTimeout);
            this.expectingMusicTrackTimeout = null;
          }
          this.musicTrackIds.add(trackKey);
          log.info('🎚️ Music track identified (data message arrived first)', { trackKey });
        } else if (!this.voiceTrackId) {
          // First track is usually voice - mark it
          this.voiceTrackId = trackKey;
          log.debug('🎤 Voice track identified', { trackKey });
        } else if (!this.musicTrackIds.has(trackKey) && trackKey !== this.voiceTrackId) {
          // Additional track after voice - could be music
          // 🐛 FIX: Add to pending buffer instead of immediately treating as music
          // This allows expectMusicTrack() to retroactively identify it
          this.addPendingMusicTrack(trackKey, audioEl);

          // Still treat as music for now (fallback behavior)
          // The pending buffer is for cases where data message arrives late
          isMusicTrack = true;
          this.musicTrackIds.add(trackKey);
          log.info('🎚️ Additional track treated as music (added to pending for confirmation)', {
            trackKey,
          });
        }

        log.debug(`Audio track attached: ${trackKey} (isMusicTrack: ${isMusicTrack})`);

        // iOS/Safari specific attributes
        audioEl.setAttribute('playsinline', '');
        audioEl.setAttribute('autoplay', '');
        audioEl.setAttribute('webkit-playsinline', ''); // Legacy iOS
        (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
        audioEl.autoplay = true;
        audioEl.muted = false; // Explicitly unmuted for voice
        audioEl.volume = 1.0;

        // Add to DOM (required for iOS)
        audioEl.style.display = 'none';
        audioEl.style.position = 'absolute';
        audioEl.style.left = '-9999px';
        document.body.appendChild(audioEl);

        // iOS audio unlock: try to play immediately
        const playAudio = async () => {
          try {
            // iOS requires load() call before play() in some cases
            audioEl.load();
            await audioEl.play();
          } catch (err) {
            // iOS/mobile requires user gesture - set up handlers
            const unlock = () => {
              audioEl.play().catch((e) => log.warn('Audio unlock failed:', e));
              document.removeEventListener('touchstart', unlock);
              document.removeEventListener('touchend', unlock);
              document.removeEventListener('click', unlock);
            };
            document.addEventListener('touchstart', unlock, { once: true, passive: true });
            document.addEventListener('touchend', unlock, { once: true, passive: true });
            document.addEventListener('click', unlock, { once: true });
          }
        };

        void playAudio();

        // 🎚️ Route music tracks to MusicAudioController for ducking
        if (isMusicTrack) {
          this.callbacks.onMusicTrack?.(audioEl, trackKey);
        }

        // Pass audio element AND track for visualization
        // Track-based visualization works better for WebRTC streams
        this.callbacks.onAudioTrack?.(audioEl, participant.identity, track.mediaStreamTrack);
      }
    };
    this.room.on('trackSubscribed', onTrackSubscribed);
    this.cleanupFunctions.push(() => {
      this.room?.off('trackSubscribed', onTrackSubscribed);
    });

    // Track unsubscribed - agent stopped speaking or music ended
    const onTrackUnsubscribed = (
      track: { kind: string; sid?: string; mediaStreamTrack?: MediaStreamTrack },
      _publication: unknown,
      participant: { identity: string; isLocal?: boolean }
    ) => {
      // Only care about remote audio tracks
      if (!participant.isLocal && track.kind === 'audio') {
        // Try to identify the track
        const trackKey = `${participant.identity}-${track.sid || track.mediaStreamTrack?.id || 'unknown'}`;

        // 🎚️ Check if this was a music track
        if (this.musicTrackIds.has(trackKey)) {
          this.handleTrackEnded(trackKey);
        }

        // Fire the voice track end callback
        this.callbacks.onAudioTrackEnd?.(participant.identity);
      }
    };
    this.room.on('trackUnsubscribed', onTrackUnsubscribed);
    this.cleanupFunctions.push(() => {
      this.room?.off('trackUnsubscribed', onTrackUnsubscribed);
    });

    // Local track published (user's microphone is now active)
    const onLocalTrackPublished = (
      publication: { kind: string; track?: { isMuted?: boolean } },
      _participant: unknown
    ) => {
      if (publication.kind === 'audio') {
        this.callbacks.onLocalMicActive?.(true);
      }
    };
    this.room.on('localTrackPublished', onLocalTrackPublished);
    this.cleanupFunctions.push(() => {
      this.room?.off('localTrackPublished', onLocalTrackPublished);
    });

    // Local track unpublished (microphone disabled)
    // ⚠️ This fires when mic is taken away by iOS audio interruption, reconnect, etc.
    const onLocalTrackUnpublished = (publication: { kind: string }, _participant: unknown) => {
      if (publication.kind === 'audio') {
        log.warn('⚠️ Local audio track unpublished (mic dropped)', { 
          roomState: this.room?.state,
          visibilityState: document.visibilityState,
        });
        this.callbacks.onLocalMicActive?.(false);
      }
    };
    this.room.on('localTrackUnpublished', onLocalTrackUnpublished);
    this.cleanupFunctions.push(() => {
      this.room?.off('localTrackUnpublished', onLocalTrackUnpublished);
    });

    // Track muted/unmuted (for detecting when user mutes their mic)
    // ⚠️ trackMuted can fire due to iOS audio session interruption
    const onTrackMuted = (publication: { kind: string }, participant: { isLocal?: boolean }) => {
      if (participant.isLocal && publication.kind === 'audio') {
        log.debug('🔇 Local audio track muted', {
          roomState: this.room?.state,
          visibilityState: document.visibilityState,
        });
        this.callbacks.onLocalMicActive?.(false);
      }
    };
    this.room.on('trackMuted', onTrackMuted);
    this.cleanupFunctions.push(() => {
      this.room?.off('trackMuted', onTrackMuted);
    });

    const onTrackUnmuted = (publication: { kind: string }, participant: { isLocal?: boolean }) => {
      if (participant.isLocal && publication.kind === 'audio') {
        this.callbacks.onLocalMicActive?.(true);
      }
    };
    this.room.on('trackUnmuted', onTrackUnmuted);
    this.cleanupFunctions.push(() => {
      this.room?.off('trackUnmuted', onTrackUnmuted);
    });

    // Data messages (handoff notifications, etc.)
    const onDataReceived = (payload: Uint8Array, _participant: unknown, _kind: unknown) => {
      try {
        const text = new TextDecoder().decode(payload);
        const message = JSON.parse(text) as DataMessage;
        this.callbacks.onDataMessage?.(message);
      } catch {
        log.warn('Failed to parse data message');
      }
    };
    this.room.on('dataReceived', onDataReceived);
    this.cleanupFunctions.push(() => {
      this.room?.off('dataReceived', onDataReceived);
    });

    // Disconnected - COMPREHENSIVE DIAGNOSTICS
    const onDisconnected = async (reason?: unknown) => {
      const disconnectTime = Date.now();
      const wasGraceful = this.isDisconnecting; // Check if we initiated the disconnect
      const disconnectReason = String(reason || 'unknown');

      // 🚨 CRITICAL: Capture FULL disconnect diagnostics
      log.warn(
        {
          wasGraceful,
          disconnectReason,
          roomName: this.room?.name,
          roomState: this.room?.state,
          isDisconnecting: this.isDisconnecting,
          disconnectTime: new Date(disconnectTime).toISOString(),
        },
        wasGraceful
          ? '🔌 Graceful disconnect from LiveKit room'
          : `🚨 UNEXPECTED DISCONNECT from LiveKit room - reason: ${disconnectReason}`
      );

      this.updateState('disconnected');

      // 📊 Capture comprehensive disconnect diagnostics
      try {
        const { captureDisconnectDiagnostic, endSession } = await import('./disconnect-diagnostics.service.js');
        await captureDisconnectDiagnostic(disconnectReason, wasGraceful, this.room?.state);
        endSession();
      } catch (err) {
        log.error({ error: String(err) }, 'Failed to capture disconnect diagnostics');
      }

      // Report unexpected disconnections to crash analytics with full context
      try {
        const { reportConnectionDrop } = await import('./crash-reporter.service.js');
        reportConnectionDrop(`LiveKit disconnect: ${disconnectReason}`, wasGraceful, {
          roomName: this.room?.name,
          disconnectTime: new Date(disconnectTime).toISOString(),
          disconnectReason,
          source: 'livekit_disconnected_event',
        });
      } catch (err) {
        log.error({ error: String(err) }, 'Failed to report connection drop');
      }
    };
    this.room.on('disconnected', onDisconnected);
    this.cleanupFunctions.push(() => {
      this.room?.off('disconnected', onDisconnected);
    });

    // 📱 Handle mobile visibility changes (screen lock, tab switch)
    // When returning to app, audio track may need to be restored
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && this.room?.state === 'connected') {
        log.debug('📱 App became visible - checking microphone state');
        try {
          const isMuted = (window as any).appState?.get?.('isMuted') ?? false;
          if (!isMuted && this.room?.localParticipant) {
            // Small delay to let audio context resume
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if mic is already publishing
            const audioTracks = this.room.localParticipant.getTrackPublications()
              .filter((pub: any) => pub.kind === 'audio' && pub.track);
            
            if (audioTracks.length === 0) {
              log.info('📱 No audio track found - re-enabling microphone');
              await this.room.localParticipant.setMicrophoneEnabled(true);
              log.info('🎤 Microphone restored after visibility change');
            }
          }
        } catch (err) {
          log.warn('Failed to restore mic on visibility change:', err);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.cleanupFunctions.push(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    });

    // 📱 Handle native app state changes (iOS/Android via Capacitor)
    // This fires when app comes back from background, after phone calls, etc.
    const onAppState = async (event: Event) => {
      const { isActive } = (event as CustomEvent<{ isActive: boolean }>).detail;
      
      if (isActive && this.room?.state === 'connected') {
        log.info('📱 Native app became active - restoring microphone');
        try {
          const isMuted = (window as any).appState?.get?.('isMuted') ?? false;
          if (!isMuted && this.room?.localParticipant) {
            // Longer delay for native - iOS audio session needs time to restore
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Re-enable microphone
            await this.room.localParticipant.setMicrophoneEnabled(true);
            log.info('🎤 Microphone restored after native app state change');
          }
        } catch (err) {
          log.warn('Failed to restore mic on app state change:', err);
        }
      }
    };
    document.addEventListener('ferni:app-state', onAppState);
    this.cleanupFunctions.push(() => {
      document.removeEventListener('ferni:app-state', onAppState);
    });
  }

  /**
   * Clean up event handlers.
   */
  private cleanup(): void {
    for (const fn of this.cleanupFunctions) {
      fn();
    }
    this.cleanupFunctions = [];

    // 🎚️ Clean up music track identification state
    if (this.pendingTrackCleanupInterval) {
      clearInterval(this.pendingTrackCleanupInterval);
      this.pendingTrackCleanupInterval = null;
    }
    if (this.expectingMusicTrackTimeout) {
      clearTimeout(this.expectingMusicTrackTimeout);
      this.expectingMusicTrackTimeout = null;
    }
    this.pendingMusicTracks.clear();
    this.musicTrackIds.clear();
    this.voiceTrackId = null;
    this.expectingMusicTrack = false;
  }

  /**
   * Map LiveKit connection state to our connection state.
   */
  private mapConnectionState(lkState: string): ConnectionState {
    switch (lkState) {
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'reconnecting':
        return 'reconnecting';
      case 'disconnected':
        return 'disconnected';
      default:
        return 'disconnected';
    }
  }

  /**
   * Update connection state in app state and notify callback.
   */
  private updateState(state: ConnectionState): void {
    setConnectionState(state);
    this.callbacks.onStateChange?.(state);
  }

  /**
   * Check if there's an active audio track.
   */
  private hasActiveAudioTrack(): boolean {
    if (!this.room) return false;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    for (const participant of this.room.remoteParticipants.values()) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      for (const publication of participant.audioTrackPublications.values()) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (publication.isSubscribed && !publication.isMuted) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Start monitoring connection quality.
   * Uses round-trip time estimation based on WebRTC stats.
   */
  private startQualityMonitoring(): void {
    if (this.qualityMonitorInterval) return;

    // Check quality every 5 seconds
    this.qualityMonitorInterval = window.setInterval(() => {
      void this.measureConnectionQuality();
    }, 5000);

    // Initial measurement
    void this.measureConnectionQuality();
  }

  /**
   * Stop monitoring connection quality.
   */
  private stopQualityMonitoring(): void {
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
      this.qualityMonitorInterval = null;
    }
  }

  /**
   * Measure connection quality using available metrics.
   */
  private measureConnectionQuality(): void {
    if (!this.room || this.room.state !== 'connected') return;

    try {
      // Try to get RTT from the room's engine if available
      // LiveKit exposes connection stats through the engine
      const engine = (this.room as unknown as { engine?: { client?: { currentRTT?: number } } })
        .engine;
      const rtt = engine?.client?.currentRTT;

      if (typeof rtt === 'number' && rtt > 0) {
        // RTT is in milliseconds
        this.callbacks.onConnectionQuality?.(rtt);
      } else {
        // Fallback: estimate based on connection state
        // If we're connected and everything works, assume good quality
        const hasAudio = this.hasActiveAudioTrack();
        const estimatedLatency = hasAudio ? 150 : 200;
        this.callbacks.onConnectionQuality?.(estimatedLatency);
      }
    } catch {
      // If we can't measure, assume fair quality
      this.callbacks.onConnectionQuality?.(300);
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton connection service instance.
 */
export const connectionService = new ConnectionService();
