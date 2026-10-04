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

import { appState, setConnectionState } from '../state/app.state.js';
import type { ConnectionState, DataMessage } from '../types/events.js';
import type { RoomState, TokenRequest } from '../types/livekit.js';
import { createLogger } from '../utils/logger.js';
import {
  AGENT_JOIN_TIMEOUT_AFTER_FAILED_DISPATCH_MS,
  AGENT_JOIN_TIMEOUT_MS,
  waitForAgent,
} from './agent-presence.js';
import { classifyConnectError, ConnectStepError, type ConnectFailure } from './connect-failure.js';
import { reportDisconnect } from './disconnect-report.js';
import { registerMicRestoreHandlers, type MicRoom } from './mic-restore.js';
import { spotifyService } from './spotify.service.js';
import { fetchConnectionToken } from './token-fetch.service.js';
import { attachLiveTranscription } from './live-transcription.service.js';

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
  /** The room dropped without the user hanging up. The service has already cleaned up. */
  onUnexpectedDisconnect?: (reason: string) => void;
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

  /** From token response: when true, backend is Qwen3-Omni; show Director Console in menu */
  private useQwen3Omni = false;

  /** Room joined but the agent hasn't arrived yet: the call is still "connecting". */
  private awaitingAgent = false;
  /** Why the most recent connect() returned false (null after a success). */
  private lastFailure: ConnectFailure | null = null;
  /** Increments per connect() so a stale attempt never tears down a newer room. */
  private attemptSeq = 0;
  /** Aborts the in-flight connect(): by its caller's signal, or by a hang-up (disconnect()). */
  private attemptAbort: AbortController | null = null;

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
   * 🎚️ FIX: Re-attach the most recent music track for ducking.
   * Called when we receive music_state: playing to ensure ducking is on the right track.
   * This handles the case where a stinger was attached instead of real music.
   */
  reattachMusicTrackForDucking(): void {
    // Find the most recent music track from pending buffer
    if (this.pendingMusicTracks.size === 0) {
      log.debug('🎚️ No pending tracks to re-attach for ducking');
      return;
    }

    let mostRecentTrack: { trackKey: string; audioEl: HTMLAudioElement } | null = null;
    let mostRecentTime = 0;

    for (const [trackKey, { audioEl, timestamp }] of this.pendingMusicTracks) {
      if (timestamp > mostRecentTime) {
        mostRecentTime = timestamp;
        mostRecentTrack = { trackKey, audioEl };
      }
    }

    if (!mostRecentTrack) {
      return;
    }

    const { trackKey, audioEl } = mostRecentTrack;

    // Mark as music track
    this.musicTrackIds.add(trackKey);
    this.pendingMusicTracks.delete(trackKey);

    log.info('🎚️ Re-attaching music track for ducking', { trackKey });

    // Route to MusicAudioController for ducking
    this.callbacks.onMusicTrack?.(audioEl, trackKey);
  }

  /**
   * Check if we're expecting a music track (music_state: playing was received).
   * Used by fallback UI logic to distinguish real music from system stingers.
   * System stingers (sound-*) don't send music_state messages.
   */
  isExpectingMusic(): boolean {
    return this.expectingMusicTrack;
  }

  /** Why the last connect() failed, or null if it succeeded. */
  getLastFailure(): ConnectFailure | null {
    return this.lastFailure;
  }

  /**
   * Connect to a LiveKit room and wait for the voice agent to join.
   * Resolves false on failure; getLastFailure() says why. Aborting `signal`
   * cancels the attempt and closes any room it opened.
   */
  async connect(options: { signal?: AbortSignal } = {}): Promise<boolean> {
    if (this.room?.state === 'connected') {
      log.warn('Already connected');
      return true;
    }

    const { signal } = options;
    const attempt = ++this.attemptSeq;
    let room: LiveKitRoom | null = null;
    const attemptAbort = new AbortController();
    this.attemptAbort = attemptAbort;
    const throwIfAborted = (): void => {
      if (attemptAbort.signal.aborted || attempt !== this.attemptSeq) {
        throw new ConnectStepError('cancelled');
      }
    };
    // Closing the room makes a pending room.connect() reject instead of hanging.
    const onAbort = (): void => {
      attemptAbort.abort();
      void this.closeAttemptRoom(room);
    };
    if (signal?.aborted) attemptAbort.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      this.lastFailure = null;
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
        tokenResponse = await fetchConnectionToken(tokenRequest);
      } catch (tokenError) {
        log.error('Token fetch failed:', tokenError);
        throw tokenError;
      }
      throwIfAborted();
      if (tokenResponse.agent_dispatched === false) {
        log.error('Server could not dispatch the voice agent', { room: tokenResponse.room });
      }

      this.useQwen3Omni = tokenResponse.useQwen3Omni === true;

      // Create and configure room using global LiveKit (iOS compatible)
      const LiveKit = getLiveKit();
      room = new LiveKit.Room({
        adaptiveStream: true,
        dynacast: true,
        stopLocalTrackOnUnpublish: true,
      });
      this.room = room;
      this.awaitingAgent = true;

      // Set up event handlers
      this.setupRoomHandlers();

      // Connect to room
      try {
        await room.connect(tokenResponse.url, tokenResponse.token, { autoSubscribe: true });
      } catch (roomError) {
        throwIfAborted();
        log.error('Room connection failed:', roomError);
        throw roomError;
      }
      throwIfAborted();

      // Enable microphone so the agent can hear us
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micError) {
        const name = (micError as { name?: string } | null)?.name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          throw new ConnectStepError('mic_denied');
        }
        // No device / iOS quirks: continue so the user can at least hear
        log.warn(
          'Microphone not available:',
          micError instanceof Error ? micError.message : micError
        );
      }

      // Not "connected" until the agent is actually here (it may already be).
      const dispatched = tokenResponse.agent_dispatched !== false;
      let agentIdentity: string;
      try {
        agentIdentity = await waitForAgent(
          room,
          dispatched ? AGENT_JOIN_TIMEOUT_MS : AGENT_JOIN_TIMEOUT_AFTER_FAILED_DISPATCH_MS,
          attemptAbort.signal
        );
      } catch (agentError) {
        const timedOut =
          agentError instanceof ConnectStepError && agentError.kind === 'agent_timeout';
        throw timedOut && !dispatched ? new ConnectStepError('agent_unavailable') : agentError;
      }
      throwIfAborted();
      this.awaitingAgent = false;
      this.updateState('connected');
      this.callbacks.onAgentConnected?.(agentIdentity);
      this.startQualityMonitoring();

      // 📊 Initialize disconnect diagnostics session
      try {
        const { startSession, trackPeerConnection } =
          await import('./disconnect-diagnostics.service.js');
        const sessionId = tokenResponse.room || `session-${Date.now()}`;
        startSession(sessionId, tokenResponse.room || 'unknown', tokenResponse.username);

        // Track the RTCPeerConnection for WebRTC diagnostics
        // LiveKit's Room internally uses RTCPeerConnection - try to access it
        const pc = (
          this.room as unknown as {
            engine?: { pcManager?: { publisher?: { pc?: RTCPeerConnection } } };
          }
        ).engine?.pcManager?.publisher?.pc;
        if (pc) {
          trackPeerConnection(pc);
          log.debug('📊 Tracking RTCPeerConnection for diagnostics');
        }
      } catch (err) {
        log.debug({ error: String(err) }, 'Disconnect diagnostics not available');
      }

      // Initialize Spotify Web Playback SDK now that user has interacted
      // This must happen after user interaction (browser autoplay policy)
      spotifyService
        .initialize()
        .then((success) => {
          if (success) {
            log.info('🎵 Spotify Web Playback initialized');
          } else {
            log.debug('Spotify not available (not linked or not Premium)');
          }
        })
        .catch((err) => {
          log.warn('Spotify init failed:', err);
        });

      return true;
    } catch (error) {
      const failure = classifyConnectError(error);
      await this.closeAttemptRoom(room);
      // A superseded attempt must not overwrite the newer attempt's state.
      if (attempt !== this.attemptSeq) return false;
      this.lastFailure = failure;
      if (failure.kind === 'cancelled') {
        this.updateState('disconnected');
        return false;
      }
      log.error('Connection failed:', { kind: failure.kind, error });
      this.updateState('error');
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      return false;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (this.attemptAbort === attemptAbort) this.attemptAbort = null;
    }
  }

  /** Close a room opened by a failed or cancelled connect attempt. */
  private async closeAttemptRoom(room: LiveKitRoom | null): Promise<void> {
    if (!room || this.room !== room) return;
    this.awaitingAgent = false;
    await this.disconnect();
  }

  /**
   * Disconnect from the current room.
   */
  async disconnect(): Promise<void> {
    // A hang-up also cancels a call still connecting, so it can't fail ~15 s later.
    this.attemptAbort?.abort();
    this.awaitingAgent = false;
    const room = this.room;
    if (!room) return;

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

      // Disconnect (release our reference first so nothing else closes this room twice)
      this.room = null;
      this.useQwen3Omni = false;
      await room.disconnect();

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
        useQwen3Omni: this.useQwen3Omni,
      };
    }

    return {
      isConnected: this.room.state === 'connected',
      roomName: this.room.name,
      localParticipantId: this.room.localParticipant?.identity ?? null,
      remoteParticipantCount: this.room.remoteParticipants.size,
      hasActiveAudio: this.hasActiveAudioTrack(),
      useQwen3Omni: this.useQwen3Omni,
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
   * Set up room event handlers.
   */
  private setupRoomHandlers(): void {
    if (!this.room) return;

    // Connection state changes
    const onConnectionStateChange = async (state: string) => {
      const mapped = this.mapConnectionState(state);
      // Joining the room isn't the call being ready: connect() reports it once the agent is here.
      if (this.awaitingAgent && mapped === 'connected') return;
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

    // 🔄 Re-enable the mic after reconnects, foregrounding and native resume (unless muted)
    this.cleanupFunctions.push(registerMicRestoreHandlers(this.room as unknown as MicRoom));

    // Participant connected (agent joins)
    // During connect(), waitForAgent reports the arrival instead (including an agent already here).
    const onParticipantConnected = (participant: { identity: string; isLocal?: boolean }) => {
      if (!participant.isLocal && !this.awaitingAgent) {
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

        // 🎚️ CRITICAL FIX: For music tracks, we need Web Audio attached BEFORE playing!
        // If we play first and attach Web Audio later, the audio bypasses our GainNode.
        //
        // For MUSIC tracks: Trigger attachment, wait briefly for Web Audio setup, then play
        // For VOICE tracks: Play immediately (ducking triggers from this callback)
        if (isMusicTrack) {
          // 🎚️ Attach to Web Audio FIRST, then play
          // This ensures the audio flows through our GainNode from the start
          const musicCallback = this.callbacks.onMusicTrack;
          if (musicCallback) {
            log.info('🎚️ Music track detected - starting Web Audio attachment BEFORE playback', {
              trackKey,
            });

            // Call the callback which will start async attachment
            // The callback's async work will complete in parallel with our timeout
            musicCallback(audioEl, trackKey);

            // Give Web Audio time to:
            // 1. Initialize AudioContext if needed (may require user gesture)
            // 2. Create MediaElementSource
            // 3. Connect the audio chain
            // 200ms should be enough for Web Audio initialization
            setTimeout(() => {
              log.info('🎚️ Starting music playback (Web Audio attachment should be complete)', {
                trackKey,
              });
              void playAudio();
            }, 200);
          } else {
            // No callback - just play directly
            void playAudio();
          }
        } else {
          // Voice tracks: Play immediately, fire callback for ducking trigger
          void playAudio();
          // Pass VOICE audio element AND track for visualization
          // Track-based visualization works better for WebRTC streams
          // NOTE: Only for voice tracks - music visualization is handled separately
          this.callbacks.onAudioTrack?.(audioEl, participant.identity, track.mediaStreamTrack);
        }
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
    this.cleanupFunctions.push(() => this.room?.off('trackMuted', onTrackMuted));

    const onTrackUnmuted = (publication: { kind: string }, participant: { isLocal?: boolean }) => {
      if (participant.isLocal && publication.kind === 'audio') {
        this.callbacks.onLocalMicActive?.(true);
      }
    };
    this.room.on('trackUnmuted', onTrackUnmuted);
    this.cleanupFunctions.push(() => this.room?.off('trackUnmuted', onTrackUnmuted));

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
    this.cleanupFunctions.push(() => this.room?.off('dataReceived', onDataReceived));
    // Live transcripts arrive as lk.transcription text streams, not data messages.
    const onTranscript = (message: DataMessage): void => this.callbacks.onDataMessage?.(message);
    this.cleanupFunctions.push(attachLiveTranscription(this.room, onTranscript));

    // Disconnected: an unexpected drop is cleaned up like a hang-up, then reported
    const onDisconnected = (reason?: unknown) => {
      const wasGraceful = this.isDisconnecting; // Check if we initiated the disconnect
      const details = {
        reason: String(reason || 'unknown'),
        wasGraceful,
        roomName: this.room?.name,
        roomState: this.room?.state,
        at: Date.now(),
      };
      this.updateState('disconnected');
      // Clean up synchronously, before any await, so a new call can't be torn down by this one.
      if (!wasGraceful) this.handleUnexpectedDisconnect(details.reason);
      void reportDisconnect(details);
    };
    this.room.on('disconnected', onDisconnected);
    this.cleanupFunctions.push(() => {
      this.room?.off('disconnected', onDisconnected);
    });
  }

  /**
   * The room dropped on its own: release it exactly like a hang-up does (handlers,
   * audio elements, voice/music track identity) so the next call starts clean.
   * While connect() is still waiting for the agent, its own failure path reports it.
   */
  private handleUnexpectedDisconnect(reason: string): void {
    const wasAwaitingAgent = this.awaitingAgent;
    this.awaitingAgent = false;
    this.stopQualityMonitoring();
    this.cleanup();
    this.audioElements.forEach((audioEl) => {
      audioEl.pause();
      audioEl.remove();
    });
    this.audioElements.clear();
    this.room = null;
    this.useQwen3Omni = false;
    if (!wasAwaitingAgent) this.callbacks.onUnexpectedDisconnect?.(reason);
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
