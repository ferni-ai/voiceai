/**
 * Connection State Monitoring
 *
 * Monitors LiveKit room connection state and handles reconnection events.
 * Provides cleanup-tracked event handlers for proper resource management.
 *
 * @module agents/voice-agent/phases/connection-state
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { createSessionCleanupTracker } from '../../session/event-cleanup-registry.js';

/** Type for the cleanup tracker returned by createSessionCleanupTracker */
type SessionCleanupTracker = ReturnType<typeof createSessionCleanupTracker>;

const log = createLogger({ module: 'connection-state' });

// ============================================================================
// TYPES
// ============================================================================

export interface Room {
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  once(event: string, handler: (...args: unknown[]) => void): void;
  remoteParticipants?: Map<string, unknown>;
}

export interface DisconnectInfo {
  reason: string;
  durationMs: number;
  sessionId: string;
  roomName: string;
  userId?: string;
  personaId?: string;
  turnCount?: number;
}

export interface ConnectionMonitorConfig {
  room: Room;
  sessionId: string;
  roomName: string;
  cleanupTracker: SessionCleanupTracker;
  userId?: string;
  personaId?: string;
  sessionStartTime: number;
}

// ============================================================================
// CONNECTION MONITORING
// ============================================================================

/**
 * Setup connection state monitoring with cleanup tracking.
 *
 * @param config - Connection monitor configuration
 * @returns Promise that resolves with disconnect info when room disconnects
 */
export function setupConnectionMonitoring(
  config: ConnectionMonitorConfig
): Promise<DisconnectInfo> {
  const {
    room,
    sessionId,
    roomName,
    cleanupTracker,
    userId,
    personaId,
    sessionStartTime,
  } = config;

  // Connection state handler
  const connectionStateHandler = (state: unknown) => {
    log.debug({ sessionId: sessionId.slice(0, 8), state }, 'Connection state changed');
  };
  room.on('connectionStateChanged', connectionStateHandler);
  cleanupTracker.register('event', 'room.connectionStateChanged', () => {
    room.off('connectionStateChanged', connectionStateHandler);
  });

  // Reconnecting handler
  const reconnectingHandler = () => {
    log.info({ sessionId: sessionId.slice(0, 8) }, 'Reconnecting...');
  };
  room.on('reconnecting', reconnectingHandler);
  cleanupTracker.register('event', 'room.reconnecting', () => {
    room.off('reconnecting', reconnectingHandler);
  });

  // Reconnected handler
  const reconnectedHandler = () => {
    log.info({ sessionId: sessionId.slice(0, 8) }, 'Reconnected');
  };
  room.on('reconnected', reconnectedHandler);
  cleanupTracker.register('event', 'room.reconnected', () => {
    room.off('reconnected', reconnectedHandler);
  });

  // Return promise that resolves on disconnect
  return new Promise<DisconnectInfo>((resolve) => {
    room.once('disconnected', async (reason?: unknown) => {
      const disconnectReason = String(reason || 'unknown');
      const durationMs = Date.now() - sessionStartTime;

      const disconnectInfo: DisconnectInfo = {
        reason: disconnectReason,
        durationMs,
        sessionId,
        roomName,
        userId,
        personaId,
      };

      // Log with diagnostics (fire-and-forget)
      void logDisconnectWithDiagnostics(disconnectInfo, room);

      resolve(disconnectInfo);
    });
  });
}

/**
 * Log disconnect with enhanced diagnostics.
 */
async function logDisconnectWithDiagnostics(
  info: DisconnectInfo,
  room: Room
): Promise<void> {
  try {
    const [diagnosticsModule, crashModule] = await Promise.all([
      import('../../shared/disconnect-diagnostics.js'),
      import('../../shared/crash-analytics.js'),
    ]);

    const participantCount = room.remoteParticipants?.size ?? 0;

    diagnosticsModule.logDisconnect({
      sessionId: info.sessionId,
      roomName: info.roomName,
      reason: info.reason,
      durationMs: info.durationMs,
      turnCount: info.turnCount,
      participantCount: participantCount + 1,
      wasActive: info.durationMs > 30000,
      userId: info.userId,
      personaId: info.personaId,
    });

    const analysis = diagnosticsModule.analyzeDisconnect({
      sessionId: info.sessionId,
      roomName: info.roomName,
      reason: info.reason,
      durationMs: info.durationMs,
    });

    crashModule.recordConnectionDrop(info.sessionId, info.reason, analysis.wasGraceful);
  } catch (error) {
    // Fallback to basic logging
    log.info(
      {
        sessionId: info.sessionId.slice(0, 8),
        reason: info.reason,
        durationMs: info.durationMs,
      },
      'Disconnected'
    );
    log.warn({ error: String(error) }, 'Failed to capture disconnect diagnostics');
  }
}

