/**
 * User Events WebSocket Server
 *
 * Provides real-time WebSocket streaming of user events from voice.
 * Used for voice-to-UI communication like theme changes, navigation, etc.
 *
 * Usage:
 * - Client connects to ws://localhost:3002/ws/user-events, offering subprotocols
 *   ['ferni.v1', 'bearer.<Firebase ID token>']
 *   (no valid token: the upgrade is refused with 401)
 * - Server streams the verified user's events as JSON. A userId in the URL or in a
 *   message is ignored: the socket is bound to the verified uid.
 * - Client updates UI based on event type
 *
 * @module services/user-events-websocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { createLogger } from '../../utils/safe-logger.js';
import { registerUserEventBroadcast } from '../user-events/index.js';
import {
  rejectUpgrade,
  selectWsProtocol,
  upgradePath,
  verifyUpgradeIdentity,
} from '../identity/ws-identity.js';

const log = createLogger({ module: 'UserEventsWebSocket' });

// ============================================================================
// TYPES
// ============================================================================

interface ClientInfo {
  ws: WebSocket;
  /** Verified at the upgrade; never changed by the client. */
  userId: string;
  connectedAt: number;
}

// ============================================================================
// STATE
// ============================================================================

// Track connected clients by WebSocket
const clients = new Map<WebSocket, ClientInfo>();

// Track which users have active connections
const userConnections = new Map<string, Set<WebSocket>>();

// Store instance for external access
let wssInstance: WebSocketServer | null = null;

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

/**
 * Get the WebSocket server instance (for combined upgrade handling)
 */
export function getUserEventsWebSocketServer(): WebSocketServer | null {
  return wssInstance;
}

/**
 * Initialize WebSocket server for user events streaming
 */
export function initUserEventsWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: selectWsProtocol,
    perMessageDeflate: false,
  });

  wssInstance = wss;

  // Other paths belong to other upgrade handlers: leave their sockets alone.
  httpServer.on('upgrade', (request, socket, head) => {
    if (upgradePath(request) !== '/ws/user-events') return;
    void verifyUpgradeIdentity(request).then((uid) => {
      if (!uid) return rejectUpgrade(socket);
      wss.handleUpgrade(request, socket, head, (ws) => onConnection(ws, uid));
    });
  });

  log.info('User Events WebSocket server initialized on /ws/user-events');

  // Register broadcast function with user-events service
  const unregister = registerUserEventBroadcast(
    (userId: string, eventType: string, data: unknown) => {
      broadcastToUser(userId, {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
      });
    }
  );

  function onConnection(ws: WebSocket, userId: string): void {
    clients.set(ws, { ws, userId, connectedAt: Date.now() });
    const conns = userConnections.get(userId) ?? new Set<WebSocket>();
    userConnections.set(userId, conns.add(ws));

    log.info({ clientCount: clients.size, userId }, 'User Events WebSocket client connected');

    // Send welcome message
    safeSend(ws, {
      type: 'welcome',
      message: 'Connected to Ferni User Events',
      userId,
      timestamp: new Date().toISOString(),
    });

    // Handle incoming messages
    ws.on('message', (message: Buffer) => {
      handleClientMessage(ws, message);
    });

    // Handle close
    ws.on('close', () => {
      handleClientDisconnect(ws);
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      log.warn({ error: String(error) }, 'User Events WebSocket client error');
      handleClientDisconnect(ws);
    });
  }

  // Store unregister for cleanup
  (wss as WebSocketServer & { _unregister?: () => void })._unregister = unregister;

  return wss;
}

/**
 * Handle incoming message from client
 */
function handleClientMessage(ws: WebSocket, message: Buffer): void {
  try {
    const data = JSON.parse(message.toString()) as { type: string };

    switch (data.type) {
      case 'ping':
        safeSend(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      case 'subscribe': {
        // The socket is already bound to its verified uid at the upgrade. A
        // userId in the message is ignored rather than rejected: clients send
        // whatever local id they hold, and re-binding is what let a socket
        // read another user's events. Confirm the bound uid instead.
        const clientInfo = clients.get(ws);
        if (clientInfo) {
          safeSend(ws, {
            type: 'subscribed',
            userId: clientInfo.userId,
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      default:
        log.debug({ type: data.type }, 'Unknown message type');
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Invalid message from client');
  }
}

/**
 * Handle client disconnect
 */
function handleClientDisconnect(ws: WebSocket): void {
  const clientInfo = clients.get(ws);

  if (clientInfo) {
    const conns = userConnections.get(clientInfo.userId);
    if (conns) {
      conns.delete(ws);
      if (conns.size === 0) {
        userConnections.delete(clientInfo.userId);
      }
    }
  }

  clients.delete(ws);
  log.debug({ clientCount: clients.size }, 'User Events WebSocket client disconnected');
}

/**
 * Broadcast message to all connections of a specific user
 */
function broadcastToUser(userId: string, message: Record<string, unknown>): void {
  const conns = userConnections.get(userId);
  if (!conns || conns.size === 0) {
    log.debug({ userId }, 'No WebSocket connections for user, event not delivered');
    return;
  }

  const messageStr = JSON.stringify(message);

  conns.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageStr);
        log.debug({ userId, type: message.type }, 'User event sent via WebSocket');
      } catch (error) {
        log.warn({ error: String(error) }, 'Error sending to WebSocket client');
      }
    }
  });
}

/**
 * Safely send a message to a WebSocket
 */
function safeSend(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      log.warn({ error: String(error) }, 'Error sending to WebSocket client');
    }
  }
}

/**
 * Shutdown user events WebSocket service
 */
export function shutdownUserEventsWebSocket(): void {
  if (wssInstance) {
    // Call unregister if set
    const unregister = (wssInstance as WebSocketServer & { _unregister?: () => void })._unregister;
    unregister?.();
  }

  // Close all connections
  clients.forEach((_info, ws) => {
    try {
      ws.close();
    } catch {
      // Ignore errors on close
    }
  });

  clients.clear();
  userConnections.clear();
  wssInstance = null;

  log.info('User Events WebSocket shutdown complete');
}
