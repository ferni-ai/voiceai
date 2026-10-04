/**
 * Cognitive WebSocket Server
 *
 * Provides real-time WebSocket streaming of cognitive state updates.
 * Connects to the CognitiveBroadcast service and streams events to clients.
 *
 * ADMIN ONLY. The stream carries every user's events (voice_emotion and
 * user_style name the userId), so it used to hand any connected client every
 * user's emotional state with no credentials. Now the upgrade must carry a
 * verified Firebase ID token whose user has the `admin` custom claim (the same
 * claim auth-middleware reads for HTTP admins). No token, or an invalid one,
 * gets 401; a verified non-admin gets 403. Neither ever receives an event.
 *
 * Usage:
 * - Client (an admin) connects to ws://localhost:8080/ws/cognitive offering the
 *   subprotocols ['ferni.v1', 'bearer.<idToken>'] (see
 *   apps/web/src/services/authed-websocket.service.ts); the server selects
 *   ferni.v1. The only client is apps/web/public/cognitive-dashboard.html,
 *   which connects on localhost only.
 * - Server streams cognitive events as JSON
 * - Client can send ping messages to keep connection alive
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { getLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import {
  cognitiveBroadcast,
  type CognitiveBroadcastEvent,
} from '../cognitive-intelligence/cognitive-broadcast.js';
import {
  rejectUpgrade,
  selectWsProtocol,
  upgradePath,
  verifyUpgradeCaller,
} from '../identity/ws-identity.js';

const logger = getLogger();

// Track connected clients
const clients = new Set<WebSocket>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Store interval handle for cleanup
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

const COGNITIVE_PATH = '/ws/cognitive';

/**
 * Upgrade only a verified admin; everyone else is refused (401/403) before any
 * event can reach them. Other paths are left to their own handlers.
 */
function upgradeAdminsOnly(httpServer: Server, wss: WebSocketServer): void {
  httpServer.on('upgrade', (request, socket, head) => {
    if (upgradePath(request) !== COGNITIVE_PATH) return;
    void verifyUpgradeCaller(request).then((caller) => {
      if (!caller) return rejectUpgrade(socket, 401);
      if (!caller.isAdmin) {
        logger.warn({ uid: caller.uid }, 'Non-admin refused on /ws/cognitive');
        return rejectUpgrade(socket, 403);
      }
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
    });
  });
}

/**
 * Initialize WebSocket server for cognitive streaming (admins only).
 */
export function initCognitiveWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, handleProtocols: selectWsProtocol });
  upgradeAdminsOnly(httpServer, wss);

  logger.info('Cognitive WebSocket server initialized on /ws/cognitive (admin only)');

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    logger.info({ clientCount: clients.size }, 'Cognitive WebSocket client connected');

    // Send current state immediately on connection
    const currentState = cognitiveBroadcast.getCurrentState();
    ws.send(
      JSON.stringify({
        type: 'initial_state',
        data: currentState,
        timestamp: new Date().toISOString(),
      })
    );

    // Send recent history
    const history = cognitiveBroadcast.getHistory(20);
    ws.send(
      JSON.stringify({
        type: 'history',
        data: history,
        timestamp: new Date().toISOString(),
      })
    );

    // Handle incoming messages (ping/pong)
    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch {
        // Ignore invalid messages
      }
    });

    // Handle close
    ws.on('close', () => {
      clients.delete(ws);
      logger.info({ clientCount: clients.size }, 'Cognitive WebSocket client disconnected');
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      logger.warn({ error }, 'Cognitive WebSocket client error');
      clients.delete(ws);
    });
  });

  // Subscribe to cognitive broadcast and forward to all clients
  cognitiveBroadcast.subscribe((event: CognitiveBroadcastEvent) => {
    const message = JSON.stringify({
      type: 'event',
      event,
      timestamp: new Date().toISOString(),
    });

    Array.from(clients).forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (err) {
          logger.warn({ err }, 'Error sending to WebSocket client');
        }
      }
    });
  });

  // Heartbeat to keep connections alive
  registerInterval(
    'cognitive-websocket-heartbeat',
    () => {
      const heartbeat = JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        clientCount: clients.size,
      });

      Array.from(clients).forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(heartbeat);
          } catch {
            // Client disconnected
          }
        }
      });
    },
    HEARTBEAT_INTERVAL
  );
  heartbeatInterval = 1 as unknown as ReturnType<typeof setInterval>; // Marker

  return wss;
}

/**
 * Shutdown cognitive WebSocket service
 * Clears heartbeat interval and disconnects all clients
 */
export function shutdownCognitiveWebSocket(): void {
  if (heartbeatInterval) {
    clearNamedInterval('cognitive-websocket-heartbeat');
    heartbeatInterval = null;
  }

  // Close all client connections
  for (const client of clients) {
    try {
      client.close(1000, 'Server shutting down');
    } catch {
      // Ignore errors during shutdown
    }
  }
  clients.clear();

  logger.info('Cognitive WebSocket service shutdown');
}

/**
 * Get current connected client count
 */
export function getConnectedClientCount(): number {
  return clients.size;
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcastToClients(message: unknown): void {
  const json = JSON.stringify(message);
  Array.from(clients).forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(json);
      } catch {
        // Client disconnected
      }
    }
  });
}

export default { initCognitiveWebSocket, getConnectedClientCount, broadcastToClients };
