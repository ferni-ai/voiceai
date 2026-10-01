/**
 * Connection Service - connect / disconnect lifecycle and room state
 */

import { appState } from '../../state/app.state.js';
import type { RoomState, TokenRequest } from '../../types/livekit.js';
import { createLogger } from '../../utils/logger.js';
import { spotifyService } from '../spotify.service.js';
import { getLiveKit } from '../connection-livekit.js';
import { fetchToken } from '../connection-helpers.js';
import { updateState, type ConnectionContext } from './context.js';
import { hasActiveAudioTrack, startQualityMonitoring, stopQualityMonitoring } from './quality.js';
import { cleanup, setupRoomHandlers } from './room-handlers.js';

const log = createLogger('Connection');

/**
 * Connect to a LiveKit room.
 *
 * Concurrent calls (double tap, check-in handler, auto-retry) share the
 * in-flight attempt instead of creating a second Room.
 */
export function connect(ctx: ConnectionContext): Promise<boolean> {
  if (ctx.room?.state === 'connected') {
    log.warn('Already connected');
    return Promise.resolve(true);
  }
  if (ctx.connectPromise) {
    log.debug('Connect already in progress');
    return ctx.connectPromise;
  }
  ctx.connectPromise = doConnect(ctx).finally(() => {
    ctx.connectPromise = null;
  });
  return ctx.connectPromise;
}

async function doConnect(ctx: ConnectionContext): Promise<boolean> {
  try {
    updateState(ctx, 'connecting');

    // CRITICAL FIX: Wait for Firebase Auth to initialize before connecting
    // This ensures we have the Firebase UID for proper user identification
    try {
      const { initializeAuth } = await import('../auth-init.service.js');
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
      const { getClaimedConversation } = await import('../demo-claim.service.js');
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
      const { apiGet } = await import('../../utils/api.js');
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
      tokenResponse = await fetchToken(tokenRequest);
    } catch (tokenError) {
      log.error('Token fetch failed:', tokenError);
      throw new Error(
        `Token fetch failed: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`
      );
    }

    ctx.useQwen3Omni = tokenResponse.useQwen3Omni === true;

    // Tear down a room left over from a failed connect or an unexpected
    // disconnect, otherwise its handlers and document listeners stack up.
    // cleanup() must run before ctx.room is reassigned (its closures use it).
    if (ctx.room) {
      stopQualityMonitoring(ctx);
      cleanup(ctx);
      ctx.audioElements.forEach((audioEl) => {
        audioEl.pause();
        audioEl.remove();
      });
      ctx.audioElements.clear();
      const staleRoom = ctx.room;
      ctx.room = null;
      void staleRoom.disconnect().catch((e: unknown) => {
        log.debug({ error: String(e) }, 'Stale room disconnect failed');
      });
    }

    // Create and configure room using global LiveKit (iOS compatible)
    const LiveKit = getLiveKit();
    ctx.room = new LiveKit.Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true,
    });

    // Set up event handlers
    setupRoomHandlers(ctx);

    // Connect to room
    try {
      await ctx.room.connect(tokenResponse.url, tokenResponse.token, {
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
      await ctx.room.localParticipant.setMicrophoneEnabled(true);
    } catch (micError) {
      const errMsg = micError instanceof Error ? micError.message : String(micError);
      log.warn('Microphone not available:', errMsg);
      // On iOS, this might fail - continue anyway so user can at least hear
    }

    updateState(ctx, 'connected');
    startQualityMonitoring(ctx);

    // 📊 Initialize disconnect diagnostics session
    try {
      const { startSession, trackPeerConnection } =
        await import('../disconnect-diagnostics.service.js');
      const sessionId = tokenResponse.room || `session-${Date.now()}`;
      startSession(sessionId, tokenResponse.room || 'unknown', tokenResponse.username);

      // Track the RTCPeerConnection for WebRTC diagnostics
      // LiveKit's Room internally uses RTCPeerConnection - try to access it
      const pc = (
        ctx.room as unknown as {
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
    log.error('Connection failed:', error);
    updateState(ctx, 'error');
    ctx.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Disconnect from the current room.
 */
export async function disconnect(ctx: ConnectionContext): Promise<void> {
  if (!ctx.room) return;

  // Mark as intentional disconnect (for crash analytics)
  ctx.isDisconnecting = true;

  try {
    // Stop quality monitoring
    stopQualityMonitoring(ctx);

    // Clean up event handlers
    cleanup(ctx);

    // Clean up cached audio elements
    ctx.audioElements.forEach((audioEl) => {
      audioEl.pause();
      audioEl.remove();
    });
    ctx.audioElements.clear();

    // Disconnect
    await ctx.room.disconnect();
    ctx.room = null;
    ctx.useQwen3Omni = false;

    updateState(ctx, 'disconnected');
  } catch (error) {
    log.error('Disconnect error:', error);
  } finally {
    ctx.isDisconnecting = false;
  }
}

/**
 * Get current room state.
 */
export function getRoomState(ctx: ConnectionContext): RoomState {
  if (!ctx.room) {
    return {
      isConnected: false,
      roomName: null,
      localParticipantId: null,
      remoteParticipantCount: 0,
      hasActiveAudio: false,
      useQwen3Omni: ctx.useQwen3Omni,
    };
  }

  return {
    isConnected: ctx.room.state === 'connected',
    roomName: ctx.room.name,
    localParticipantId: ctx.room.localParticipant?.identity ?? null,
    remoteParticipantCount: ctx.room.remoteParticipants.size,
    hasActiveAudio: hasActiveAudioTrack(ctx),
    useQwen3Omni: ctx.useQwen3Omni,
  };
}
