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

import type { TokenResponse, TokenRequest, RoomState } from '../types/livekit.js';
import type { ConnectionState, DataMessage } from '../types/events.js';
import { isValidTokenResponse } from '../types/livekit.js';
import { API } from '../config/index.js';
import { appState, setConnectionState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';

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
  onAudioTrack?: (audioElement: HTMLAudioElement, participantId: string, mediaStreamTrack?: MediaStreamTrack) => void;
  /** Called when agent audio track ends (agent stops speaking). */
  onAudioTrackEnd?: (participantId: string) => void;
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

  /**
   * Register callbacks for connection events.
   */
  setCallbacks(callbacks: ConnectionCallbacks): void {
    this.callbacks = callbacks;
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

      // Get connection parameters from state
      const state = appState.getState();
      const tokenRequest: TokenRequest = {
        room: `voice-${Date.now()}`,
        username: state.userName ?? 'User',
        deviceId: state.deviceId,
        personaId: state.selectedPersona.id,
      };

      // Fetch token
      let tokenResponse;
      try {
        tokenResponse = await this.fetchToken(tokenRequest);
      } catch (tokenError) {
        log.error('Token fetch failed:', tokenError);
        throw new Error(`Token fetch failed: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`);
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
        throw new Error(`Room connection failed: ${roomError instanceof Error ? roomError.message : String(roomError)}`);
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

    const url = `${API.TOKEN}?${params.toString()}`;
    
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        // iOS sometimes needs explicit cache control
        cache: 'no-cache',
      });
    } catch (fetchError) {
      log.error('Fetch error:', fetchError);
      throw new Error(`Network error: ${fetchError instanceof Error ? fetchError.message : 'Failed to connect'}`);
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
    const onConnectionStateChange = (state: string) => {
      const mapped = this.mapConnectionState(state);
      this.updateState(mapped);
    };
    this.room.on('connectionStateChanged', onConnectionStateChange);
    this.cleanupFunctions.push(() => {
      this.room?.off('connectionStateChanged', onConnectionStateChange);
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
      track: { kind: string; attach: () => HTMLMediaElement; mediaStreamTrack: MediaStreamTrack; sid?: string },
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
        
        log.debug(`Audio track attached: ${trackKey} (kind: ${track.kind})`);
        
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
              audioEl.play()
                .catch((e) => log.warn('Audio unlock failed:', e));
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
        
        // Pass audio element AND track for visualization
        // Track-based visualization works better for WebRTC streams
        this.callbacks.onAudioTrack?.(audioEl, participant.identity, track.mediaStreamTrack);
      }
    };
    this.room.on('trackSubscribed', onTrackSubscribed);
    this.cleanupFunctions.push(() => {
      this.room?.off('trackSubscribed', onTrackSubscribed);
    });

    // Track unsubscribed - agent stopped speaking
    const onTrackUnsubscribed = (
      track: { kind: string },
      _publication: unknown,
      participant: { identity: string; isLocal?: boolean }
    ) => {
      // Only care about remote audio tracks (agent speaking)
      if (!participant.isLocal && track.kind === 'audio') {
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
    const onLocalTrackUnpublished = (
      publication: { kind: string },
      _participant: unknown
    ) => {
      if (publication.kind === 'audio') {
        this.callbacks.onLocalMicActive?.(false);
      }
    };
    this.room.on('localTrackUnpublished', onLocalTrackUnpublished);
    this.cleanupFunctions.push(() => {
      this.room?.off('localTrackUnpublished', onLocalTrackUnpublished);
    });

    // Track muted/unmuted (for detecting when user mutes their mic)
    const onTrackMuted = (
      publication: { kind: string },
      participant: { isLocal?: boolean }
    ) => {
      if (participant.isLocal && publication.kind === 'audio') {
        this.callbacks.onLocalMicActive?.(false);
      }
    };
    this.room.on('trackMuted', onTrackMuted);
    this.cleanupFunctions.push(() => {
      this.room?.off('trackMuted', onTrackMuted);
    });

    const onTrackUnmuted = (
      publication: { kind: string },
      participant: { isLocal?: boolean }
    ) => {
      if (participant.isLocal && publication.kind === 'audio') {
        this.callbacks.onLocalMicActive?.(true);
      }
    };
    this.room.on('trackUnmuted', onTrackUnmuted);
    this.cleanupFunctions.push(() => {
      this.room?.off('trackUnmuted', onTrackUnmuted);
    });

    // Data messages (handoff notifications, etc.)
    const onDataReceived = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown
    ) => {
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

    // Disconnected
    const onDisconnected = () => {
      this.updateState('disconnected');
    };
    this.room.on('disconnected', onDisconnected);
    this.cleanupFunctions.push(() => {
      this.room?.off('disconnected', onDisconnected);
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
      const engine = (this.room as unknown as { engine?: { client?: { currentRTT?: number } } }).engine;
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

