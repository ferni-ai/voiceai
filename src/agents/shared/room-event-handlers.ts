/**
 * Room Event Handlers
 *
 * Extracted event handlers for LiveKit room connection monitoring.
 * These handlers help diagnose "agent cutting out" issues and manage
 * session lifecycle based on room connection state.
 *
 * @module agents/shared/room-event-handlers
 */

import { diag } from '../../services/observability/diagnostic-logger.js';

// ============================================================================
// TYPES
// ============================================================================

// Connection states from LiveKit SDK
export enum ConnectionState {
  CONN_DISCONNECTED = 0,
  CONN_CONNECTED = 1,
  CONN_RECONNECTING = 2,
}

// Generic room interface for event handling
interface RoomLike {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
  remoteParticipants?: { size: number };
  localParticipant?: unknown;
}

export interface RoomEventHandlersConfig {
  room: RoomLike;
  sessionId: string;
  onDisconnect: () => Promise<void>;
}

export interface RoomEventCleanup {
  removeAllListeners: () => void;
}

// ============================================================================
// ROOM EVENT HANDLERS
// ============================================================================

/**
 * Set up room event handlers for connection monitoring
 * Returns a cleanup function to remove all listeners
 */
export function setupRoomEventHandlers(config: RoomEventHandlersConfig): RoomEventCleanup {
  const { room, sessionId, onDisconnect } = config;

  // Track handlers for cleanup
  const handlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  // Connection state change handler
  const connectionStateHandler = (...args: unknown[]) => {
    const state = args[0] as ConnectionState;
    const stateName = ConnectionState[state] || String(state);
    diag.session('🔌 Room connection state changed', { state: stateName, sessionId });

    if (state === ConnectionState.CONN_RECONNECTING) {
      diag.warn('🔌 Room reconnecting - agent may be temporarily unresponsive', { sessionId });
    } else if (state === ConnectionState.CONN_DISCONNECTED) {
      diag.warn('🔌 Room disconnected unexpectedly', { sessionId });
    } else if (state === ConnectionState.CONN_CONNECTED) {
      diag.session('🔌 Room connected/reconnected', { sessionId });
    }
  };
  room.on('connectionStateChanged', connectionStateHandler);
  handlers.push({ event: 'connectionStateChanged', handler: connectionStateHandler });

  // Reconnecting handler
  const reconnectingHandler = () => {
    diag.warn('🔌 Room is reconnecting...', { sessionId });
  };
  room.on('reconnecting', reconnectingHandler);
  handlers.push({ event: 'reconnecting', handler: reconnectingHandler });

  // Reconnected handler
  const reconnectedHandler = () => {
    diag.session('🔌 Room reconnected successfully', { sessionId });
  };
  room.on('reconnected', reconnectedHandler);
  handlers.push({ event: 'reconnected', handler: reconnectedHandler });

  // Disconnected handler - triggers session cleanup
  const disconnectedHandler = () => {
    onDisconnect().catch((err) => {
      diag.error('Session cleanup failed', { error: String(err) });
    });
  };
  room.on('disconnected', disconnectedHandler);
  handlers.push({ event: 'disconnected', handler: disconnectedHandler });

  // Return cleanup function
  return {
    removeAllListeners: () => {
      for (const { event, handler } of handlers) {
        try {
          room.off(event, handler);
        } catch {
          // Ignore errors during cleanup
        }
      }
      handlers.length = 0;
    },
  };
}

/**
 * Log room connection metrics for observability
 */
export function logRoomConnectionMetrics(room: RoomLike, sessionId: string): void {
  try {
    const participants = room.remoteParticipants?.size || 0;
    diag.session('📊 Room metrics', {
      sessionId,
      participants,
      localParticipant: !!room.localParticipant,
    });
  } catch {
    // Non-critical - ignore errors
  }
}

export default {
  setupRoomEventHandlers,
  logRoomConnectionMetrics,
  ConnectionState,
};
