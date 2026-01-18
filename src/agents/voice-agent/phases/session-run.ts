/**
 * Session Run Phase
 *
 * Manages the main session run loop including:
 * - Connection state monitoring
 * - Reconnection handling
 * - Wait for disconnect with diagnostics
 *
 * @module voice-agent/phases/session-run
 */

import type { Room } from '@livekit/rtc-node';
import { createSessionCleanupTracker } from '../../session/event-cleanup-registry.js';

// ============================================================================
// TYPES
// ============================================================================

/** Type for the cleanup tracker returned by createSessionCleanupTracker */
export type SessionCleanupTracker = ReturnType<typeof createSessionCleanupTracker>;

export interface SessionRunConfig {
  /** LiveKit room */
  room: Room;
  /** Session ID */
  sessionId: string;
  /** Room name */
  roomName: string;
  /** Session start time (for duration calculation) */
  startTime: number;
  /** User ID (optional) */
  userId?: string;
  /** Persona ID (optional) */
  personaId?: string;
  /** Session object (for turn count) */
  session?: { turnCount?: number };
  /** Cleanup tracker for registering event handlers */
  cleanupTracker: SessionCleanupTracker;
}

export interface DisconnectResult {
  /** Disconnect reason string */
  reason: string;
  /** Session duration in milliseconds */
  durationMs: number;
  /** Whether the disconnect was graceful */
  wasGraceful: boolean;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Runs the session until disconnect.
 *
 * This function:
 * 1. Sets up connection state monitoring
 * 2. Registers reconnection handlers
 * 3. Waits for the room to disconnect
 * 4. Captures disconnect diagnostics
 *
 * @param config - Session run configuration
 * @returns Promise that resolves with disconnect information
 */
export async function runUntilDisconnect(config: SessionRunConfig): Promise<DisconnectResult> {
  const { room, sessionId, roomName, startTime, userId, personaId, session, cleanupTracker } =
    config;

  // Monitor connection state
  const connectionStateHandler = (state: unknown) => {
    process.stderr.write(`[session-run] 🔌 Connection state: ${state}\n`);
  };
  room.on('connectionStateChanged', connectionStateHandler);
  cleanupTracker.register('event', 'room.connectionStateChanged', () => {
    room.off('connectionStateChanged', connectionStateHandler);
  });

  // Handle reconnecting
  const reconnectingHandler = () => {
    process.stderr.write(`[session-run] 🔌 Reconnecting...\n`);
  };
  room.on('reconnecting', reconnectingHandler);
  cleanupTracker.register('event', 'room.reconnecting', () => {
    room.off('reconnecting', reconnectingHandler);
  });

  // Handle reconnected
  const reconnectedHandler = () => {
    process.stderr.write(`[session-run] 🔌 Reconnected!\n`);
  };
  room.on('reconnected', reconnectedHandler);
  cleanupTracker.register('event', 'room.reconnected', () => {
    room.off('reconnected', reconnectedHandler);
  });

  // Wait for disconnect
  const disconnectResult = await new Promise<DisconnectResult>((resolve) => {
    room.on('disconnected', (reason?: unknown) => {
      const disconnectReason = String(reason || 'unknown');
      const sessionDurationMs = Date.now() - startTime;

      // Enhanced disconnect diagnostics (async, non-blocking)
      void (async () => {
        try {
          const { logDisconnect, analyzeDisconnect } = await import(
            '../../shared/disconnect-diagnostics.js'
          );
          const { recordConnectionDrop } = await import('../../shared/crash-analytics.js');

          // Get participant count if available
          const participantCount = room.remoteParticipants?.size ?? 0;

          // Log with full diagnostic context
          logDisconnect({
            sessionId,
            roomName,
            reason: disconnectReason,
            durationMs: sessionDurationMs,
            turnCount: session?.turnCount,
            participantCount: participantCount + 1, // +1 for agent
            wasActive: sessionDurationMs > 30000, // Consider active if > 30s
            userId,
            personaId,
          });

          // Record in crash analytics
          const analysis = analyzeDisconnect({
            sessionId,
            roomName,
            reason: disconnectReason,
            durationMs: sessionDurationMs,
          });
          recordConnectionDrop(sessionId, disconnectReason, analysis.wasGraceful);
        } catch (e) {
          // Fallback to basic logging if diagnostics fail
          process.stderr.write(
            `[session-run] 🔌 Disconnected (reason: ${disconnectReason}, duration: ${sessionDurationMs}ms)\n`
          );
          process.stderr.write(`[session-run] Failed to capture disconnect diagnostics: ${e}\n`);
        }
      })();

      // Determine if graceful
      const wasGraceful =
        disconnectReason === 'unknown' ||
        disconnectReason.includes('client') ||
        disconnectReason.includes('normal');

      resolve({
        reason: disconnectReason,
        durationMs: sessionDurationMs,
        wasGraceful,
      });
    });
  });

  return disconnectResult;
}
