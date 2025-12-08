/**
 * Cognitive WebSocket Server
 *
 * Provides real-time WebSocket streaming of cognitive state updates.
 * Connects to the CognitiveBroadcast service and streams events to clients.
 *
 * Usage:
 * - Client connects to ws://localhost:8080/ws/cognitive
 * - Server streams cognitive events as JSON
 * - Client can send ping messages to keep connection alive
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { getLogger } from '../utils/safe-logger.js';
import { cognitiveBroadcast, type CognitiveBroadcastEvent } from './cognitive-broadcast.js';

const logger = getLogger();

// Track connected clients
const clients = new Set<WebSocket>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Store interval handle for cleanup
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize WebSocket server for cognitive streaming
 */
export function initCognitiveWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/cognitive',
  });

  logger.info('Cognitive WebSocket server initialized on /ws/cognitive');

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
  heartbeatInterval = setInterval(() => {
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
  }, HEARTBEAT_INTERVAL);

  return wss;
}

/**
 * Shutdown cognitive WebSocket service
 * Clears heartbeat interval and disconnects all clients
 */
export function shutdownCognitiveWebSocket(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
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
