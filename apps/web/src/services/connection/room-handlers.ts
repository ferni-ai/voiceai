/**
 * Connection Service - room and document event handlers
 */

import { appState } from '../../state/app.state.js';
import { createLogger } from '../../utils/logger.js';
import type { DataMessage } from '../../types/events.js';
import { mapConnectionState } from '../connection-helpers.js';
import { createTrackSubscribedHandler, createTrackUnsubscribedHandler } from './audio-tracks.js';
import { updateState, type ConnectionContext } from './context.js';

const log = createLogger('Connection');

/**
 * Set up room event handlers.
 */
export function setupRoomHandlers(ctx: ConnectionContext): void {
  if (!ctx.room) return;

  // Connection state changes
  const onConnectionStateChange = async (state: string) => {
    const mapped = mapConnectionState(state);
    updateState(ctx, mapped);

    // Update crash reporter context
    try {
      const { updateCrashContext } = await import('../crash-reporter.service.js');
      updateCrashContext({
        connectionState: mapped as 'connecting' | 'connected' | 'reconnecting' | 'disconnected',
        roomName: ctx.room?.name,
      });
    } catch {
      // Crash reporter not available
    }
  };
  ctx.room.on('connectionStateChanged', onConnectionStateChange);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('connectionStateChanged', onConnectionStateChange);
  });

  // 🔄 Handle reconnection - re-enable microphone after LiveKit reconnects
  // This fixes the issue where mic disconnects and needs to be manually re-enabled
  const onReconnected = async () => {
    log.info('🔄 Room reconnected - re-enabling microphone');
    try {
      // Check if mic should be enabled (user hasn't muted)
      const isMuted = appState.get('isMuted');
      if (!isMuted && ctx.room?.localParticipant) {
        await ctx.room.localParticipant.setMicrophoneEnabled(true);
        log.info('🎤 Microphone re-enabled after reconnection');
      }
    } catch (err) {
      log.warn('Failed to re-enable mic after reconnection:', err);
    }
  };
  ctx.room.on('reconnected', onReconnected);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('reconnected', onReconnected);
  });

  // Participant connected (agent joins)
  const onParticipantConnected = (participant: { identity: string; isLocal?: boolean }) => {
    if (!participant.isLocal) {
      ctx.callbacks.onAgentConnected?.(participant.identity);
    }
  };
  ctx.room.on('participantConnected', onParticipantConnected);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('participantConnected', onParticipantConnected);
  });

  // Participant disconnected
  const onParticipantDisconnected = (participant: { identity: string; isLocal?: boolean }) => {
    if (!participant.isLocal) {
      ctx.callbacks.onAgentDisconnected?.();
    }
  };
  ctx.room.on('participantDisconnected', onParticipantDisconnected);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('participantDisconnected', onParticipantDisconnected);
  });

  // Track subscribed (audio from agent) - use simple attach() like old frontend
  // FIX: Support MULTIPLE audio tracks per participant (voice + background music)
  const onTrackSubscribed = createTrackSubscribedHandler(ctx);
  ctx.room.on('trackSubscribed', onTrackSubscribed);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('trackSubscribed', onTrackSubscribed);
  });

  // Track unsubscribed - agent stopped speaking or music ended
  const onTrackUnsubscribed = createTrackUnsubscribedHandler(ctx);
  ctx.room.on('trackUnsubscribed', onTrackUnsubscribed);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('trackUnsubscribed', onTrackUnsubscribed);
  });

  // Local track published (user's microphone is now active)
  const onLocalTrackPublished = (
    publication: { kind: string; track?: { isMuted?: boolean } },
    _participant: unknown
  ) => {
    if (publication.kind === 'audio') {
      ctx.callbacks.onLocalMicActive?.(true);
    }
  };
  ctx.room.on('localTrackPublished', onLocalTrackPublished);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('localTrackPublished', onLocalTrackPublished);
  });

  // Local track unpublished (microphone disabled)
  // ⚠️ This fires when mic is taken away by iOS audio interruption, reconnect, etc.
  const onLocalTrackUnpublished = (publication: { kind: string }, _participant: unknown) => {
    if (publication.kind === 'audio') {
      log.warn('⚠️ Local audio track unpublished (mic dropped)', {
        roomState: ctx.room?.state,
        visibilityState: document.visibilityState,
      });
      ctx.callbacks.onLocalMicActive?.(false);
    }
  };
  ctx.room.on('localTrackUnpublished', onLocalTrackUnpublished);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('localTrackUnpublished', onLocalTrackUnpublished);
  });

  // Track muted/unmuted (for detecting when user mutes their mic)
  // ⚠️ trackMuted can fire due to iOS audio session interruption
  const onTrackMuted = (publication: { kind: string }, participant: { isLocal?: boolean }) => {
    if (participant.isLocal && publication.kind === 'audio') {
      log.debug('🔇 Local audio track muted', {
        roomState: ctx.room?.state,
        visibilityState: document.visibilityState,
      });
      ctx.callbacks.onLocalMicActive?.(false);
    }
  };
  ctx.room.on('trackMuted', onTrackMuted);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('trackMuted', onTrackMuted);
  });

  const onTrackUnmuted = (publication: { kind: string }, participant: { isLocal?: boolean }) => {
    if (participant.isLocal && publication.kind === 'audio') {
      ctx.callbacks.onLocalMicActive?.(true);
    }
  };
  ctx.room.on('trackUnmuted', onTrackUnmuted);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('trackUnmuted', onTrackUnmuted);
  });

  // Data messages (handoff notifications, etc.)
  const onDataReceived = (payload: Uint8Array, _participant: unknown, _kind: unknown) => {
    try {
      const text = new TextDecoder().decode(payload);
      const message = JSON.parse(text) as DataMessage;
      ctx.callbacks.onDataMessage?.(message);
    } catch {
      log.warn('Failed to parse data message');
    }
  };
  ctx.room.on('dataReceived', onDataReceived);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('dataReceived', onDataReceived);
  });

  // Disconnected - COMPREHENSIVE DIAGNOSTICS
  const onDisconnected = async (reason?: unknown) => {
    const disconnectTime = Date.now();
    const wasGraceful = ctx.isDisconnecting; // Check if we initiated the disconnect
    const disconnectReason = String(reason || 'unknown');

    // 🚨 CRITICAL: Capture FULL disconnect diagnostics
    log.warn(
      {
        wasGraceful,
        disconnectReason,
        roomName: ctx.room?.name,
        roomState: ctx.room?.state,
        isDisconnecting: ctx.isDisconnecting,
        disconnectTime: new Date(disconnectTime).toISOString(),
      },
      wasGraceful
        ? '🔌 Graceful disconnect from LiveKit room'
        : `🚨 UNEXPECTED DISCONNECT from LiveKit room - reason: ${disconnectReason}`
    );

    updateState(ctx, 'disconnected');

    // 📊 Capture comprehensive disconnect diagnostics
    try {
      const { captureDisconnectDiagnostic, endSession } =
        await import('../disconnect-diagnostics.service.js');
      await captureDisconnectDiagnostic(disconnectReason, wasGraceful, ctx.room?.state);
      endSession();
    } catch (err) {
      log.error({ error: String(err) }, 'Failed to capture disconnect diagnostics');
    }

    // Report unexpected disconnections to crash analytics with full context
    try {
      const { reportConnectionDrop } = await import('../crash-reporter.service.js');
      reportConnectionDrop(`LiveKit disconnect: ${disconnectReason}`, wasGraceful, {
        roomName: ctx.room?.name,
        disconnectTime: new Date(disconnectTime).toISOString(),
        disconnectReason,
        source: 'livekit_disconnected_event',
      });
    } catch (err) {
      log.error({ error: String(err) }, 'Failed to report connection drop');
    }
  };
  ctx.room.on('disconnected', onDisconnected);
  ctx.cleanupFunctions.push(() => {
    ctx.room?.off('disconnected', onDisconnected);
  });

  // 📱 Handle mobile visibility changes (screen lock, tab switch)
  // When returning to app, audio track may need to be restored
  const onVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && ctx.room?.state === 'connected') {
      log.debug('📱 App became visible - checking microphone state');
      try {
        const isMuted = appState.get('isMuted');
        if (!isMuted && ctx.room?.localParticipant) {
          // Small delay to let audio context resume
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Check if mic is already publishing
          const audioTracks = ctx.room.localParticipant
            .getTrackPublications()
            .filter((pub: { kind?: string; track?: unknown }) => pub.kind === 'audio' && pub.track);

          if (audioTracks.length === 0) {
            log.info('📱 No audio track found - re-enabling microphone');
            await ctx.room.localParticipant.setMicrophoneEnabled(true);
            log.info('🎤 Microphone restored after visibility change');
          }
        }
      } catch (err) {
        log.warn('Failed to restore mic on visibility change:', err);
      }
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  ctx.cleanupFunctions.push(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  // 📱 Handle native app state changes (iOS/Android via Capacitor)
  // This fires when app comes back from background, after phone calls, etc.
  const onAppState = async (event: Event) => {
    const { isActive } = (event as CustomEvent<{ isActive: boolean }>).detail;

    if (isActive && ctx.room?.state === 'connected') {
      log.info('📱 Native app became active - restoring microphone');
      try {
        const isMuted = appState.get('isMuted');
        if (!isMuted && ctx.room?.localParticipant) {
          // Longer delay for native - iOS audio session needs time to restore
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Re-enable microphone
          await ctx.room.localParticipant.setMicrophoneEnabled(true);
          log.info('🎤 Microphone restored after native app state change');
        }
      } catch (err) {
        log.warn('Failed to restore mic on app state change:', err);
      }
    }
  };
  document.addEventListener('ferni:app-state', onAppState);
  ctx.cleanupFunctions.push(() => {
    document.removeEventListener('ferni:app-state', onAppState);
  });
}

/**
 * Clean up event handlers.
 */
export function cleanup(ctx: ConnectionContext): void {
  for (const fn of ctx.cleanupFunctions) {
    fn();
  }
  ctx.cleanupFunctions = [];

  // 🎚️ Clean up music track identification state
  if (ctx.pendingTrackCleanupInterval) {
    clearInterval(ctx.pendingTrackCleanupInterval);
    ctx.pendingTrackCleanupInterval = null;
  }
  if (ctx.expectingMusicTrackTimeout) {
    clearTimeout(ctx.expectingMusicTrackTimeout);
    ctx.expectingMusicTrackTimeout = null;
  }
  ctx.pendingMusicTracks.clear();
  ctx.musicTrackIds.clear();
  ctx.voiceTrackId = null;
  ctx.expectingMusicTrack = false;
}
