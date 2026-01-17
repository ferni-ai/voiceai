/**
 * Insights WebSocket Server
 *
 * Provides real-time WebSocket streaming of cross-persona insight updates.
 * Connects to the InsightsBroadcast service and streams events to clients.
 *
 * Usage:
 * - Client connects to ws://localhost:8080/ws/insights
 * - Client sends { type: 'subscribe', userId: 'xxx' } to start receiving updates
 * - Server streams insight events as JSON
 * - Client can send ping messages to keep connection alive
 *
 * @module services/insights-websocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { getLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../utils/interval-manager.js';
import {
  insightsBroadcast,
  type InsightBroadcastEvent,
  startInsightMonitoring,
  stopInsightMonitoring,
} from './insights-broadcast.js';
import { getProactiveInsights, generateTeamStatus } from './cross-persona-insights.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface ClientInfo {
  ws: WebSocket;
  userId: string | null;
  subscribedAt: number | null;
}

// ============================================================================
// STATE
// ============================================================================

// Track connected clients by WebSocket
const clients = new Map<WebSocket, ClientInfo>();

// Track which users have active subscriptions (for cleanup)
const userSubscribers = new Map<string, Set<WebSocket>>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Store interval handle for cleanup
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// Store broadcast subscription unsubscribe function to prevent memory leak
let broadcastUnsubscribe: (() => void) | null = null;

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

// Store reference for external access (e.g., combined upgrade handler)
let wssInstance: WebSocketServer | null = null;

/**
 * Get the WebSocket server instance (for combined upgrade handling)
 */
export function getInsightsWebSocketServer(): WebSocketServer | null {
  return wssInstance;
}

/**
 * Initialize WebSocket server for insights streaming
 * Uses noServer: true to allow manual upgrade handling for multiple WebSocket servers
 */
export function initInsightsWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    // Disable per-message compression to fix "RSV1 must be clear" / "Invalid frame header" errors
    // This is a known compatibility issue with Node.js 24 and certain browser WebSocket clients
    perMessageDeflate: false,
  });

  wssInstance = wss;

  // Handle upgrade requests for /ws/insights path
  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

    if (pathname === '/ws/insights') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Note: Don't destroy socket here - let other handlers process their paths
  });

  log.info('Insights WebSocket server initialized on /ws/insights');

  // Subscribe to broadcast events (store unsubscribe to prevent memory leak)
  broadcastUnsubscribe = insightsBroadcast.subscribe((event: InsightBroadcastEvent) => {
    broadcastToUser(event.userId, {
      type: 'event',
      event,
      timestamp: new Date().toISOString(),
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    // Initialize client info
    clients.set(ws, {
      ws,
      userId: null,
      subscribedAt: null,
    });

    log.info({ clientCount: clients.size }, 'Insights WebSocket client connected');

    // Send welcome message
    safeSend(ws, {
      type: 'welcome',
      message: 'Connected to Ferni Team Insights',
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
      log.warn({ error }, 'Insights WebSocket client error');
      handleClientDisconnect(ws);
    });
  });

  // Heartbeat to keep connections alive AND clean up stale connections
  registerInterval(
    'insights-websocket-heartbeat',
    () => {
      const heartbeat = {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        clientCount: clients.size,
      };

      // Collect stale connections for cleanup (can't modify Map during iteration)
      const staleConnections: WebSocket[] = [];

      clients.forEach((info, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          safeSend(ws, heartbeat);
        } else {
          // Connection is closed, closing, or connecting - mark for cleanup
          staleConnections.push(ws);
        }
      });

      // Clean up stale connections that didn't trigger close/error events
      // This prevents memory leaks from network disconnections
      if (staleConnections.length > 0) {
        log.info(
          { staleCount: staleConnections.length, totalClients: clients.size },
          'Cleaning up stale WebSocket connections'
        );
        staleConnections.forEach((ws) => handleClientDisconnect(ws));
      }
    },
    HEARTBEAT_INTERVAL
  );
  heartbeatInterval = 1 as unknown as ReturnType<typeof setInterval>; // Marker

  return wss;
}

/**
 * Handle incoming message from client
 */
interface ClientMessage {
  type: string;
  userId?: string;
}

function handleClientMessage(ws: WebSocket, message: Buffer): void {
  try {
    const data = JSON.parse(message.toString()) as ClientMessage;

    switch (data.type) {
      case 'ping':
        safeSend(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;

      case 'subscribe':
        if (data.userId) {
          handleSubscribe(ws, data.userId);
        }
        break;

      case 'unsubscribe':
        handleUnsubscribe(ws);
        break;

      case 'scan':
        if (data.userId) {
          handleScanRequest(ws, data.userId).catch((error: unknown) => {
            log.error({ error, userId: data.userId }, 'Unhandled error in scan request');
          });
        }
        break;

      default:
        log.debug({ type: data.type }, 'Unknown message type');
    }
  } catch (error) {
    log.debug({ error }, 'Invalid message from client');
  }
}

/**
 * Handle subscribe request
 */
function handleSubscribe(ws: WebSocket, userId: string): void {
  if (!userId) {
    safeSend(ws, {
      type: 'error',
      message: 'userId is required for subscription',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  // Update client info
  clientInfo.userId = userId;
  clientInfo.subscribedAt = Date.now();

  // Track subscriber for this user
  if (!userSubscribers.has(userId)) {
    userSubscribers.set(userId, new Set());
  }
  const subscribers = userSubscribers.get(userId);
  if (subscribers) {
    subscribers.add(ws);
  }

  // Start monitoring for this user
  startInsightMonitoring(userId);

  // Send current insights immediately
  sendCurrentState(ws, userId).catch((error: unknown) => {
    log.error({ error, userId }, 'Unhandled error sending initial state');
  });

  log.info(
    { userId, subscribers: userSubscribers.get(userId)?.size },
    'Client subscribed to insights'
  );
}

/**
 * Handle unsubscribe request
 */
function handleUnsubscribe(ws: WebSocket): void {
  const clientInfo = clients.get(ws);
  if (!clientInfo?.userId) return;

  const { userId } = clientInfo;

  // Remove from user subscribers
  const subs = userSubscribers.get(userId);
  if (subs) {
    subs.delete(ws);

    // If no more subscribers for this user, stop monitoring
    if (subs.size === 0) {
      userSubscribers.delete(userId);
      stopInsightMonitoring(userId);
    }
  }

  clientInfo.userId = null;
  clientInfo.subscribedAt = null;

  safeSend(ws, {
    type: 'unsubscribed',
    timestamp: new Date().toISOString(),
  });

  log.info({ userId }, 'Client unsubscribed from insights');
}

/**
 * Handle scan request
 */
async function handleScanRequest(ws: WebSocket, userId: string): Promise<void> {
  if (!userId) {
    safeSend(ws, {
      type: 'error',
      message: 'userId is required for scan',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const insights = await insightsBroadcast.triggerScan(userId);
    const teamStatus = await generateTeamStatus(userId);

    safeSend(ws, {
      type: 'scan_result',
      userId,
      insights,
      teamStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error, userId }, 'Error handling scan request');
    safeSend(ws, {
      type: 'error',
      message: 'Failed to scan insights',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Send current state to a client
 */
async function sendCurrentState(ws: WebSocket, userId: string): Promise<void> {
  try {
    const insights = getProactiveInsights(userId);
    const teamStatus = await generateTeamStatus(userId);

    safeSend(ws, {
      type: 'initial_state',
      userId,
      insights,
      teamStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error, userId }, 'Error sending current state');
  }
}

/**
 * Handle client disconnect
 */
function handleClientDisconnect(ws: WebSocket): void {
  const clientInfo = clients.get(ws);

  if (clientInfo?.userId) {
    // Clean up user subscriber tracking
    const subs = userSubscribers.get(clientInfo.userId);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        userSubscribers.delete(clientInfo.userId);
        stopInsightMonitoring(clientInfo.userId);
      }
    }
  }

  clients.delete(ws);
  log.info({ clientCount: clients.size }, 'Insights WebSocket client disconnected');
}

/**
 * Broadcast message to all subscribers of a specific user
 */
function broadcastToUser(userId: string, message: Record<string, unknown>): void {
  const subs = userSubscribers.get(userId);
  if (!subs || subs.size === 0) return;

  const messageStr = JSON.stringify(message);

  subs.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageStr);
      } catch (error) {
        log.warn({ error }, 'Error sending to WebSocket client');
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
      log.warn({ error }, 'Error sending to WebSocket client');
    }
  }
}

/**
 * Shutdown insights WebSocket service
 */
export function shutdownInsightsWebSocket(): void {
  if (heartbeatInterval) {
    clearNamedInterval('insights-websocket-heartbeat');
    heartbeatInterval = null;
  }

  // Unsubscribe from broadcast to prevent memory leak
  if (broadcastUnsubscribe) {
    broadcastUnsubscribe();
    broadcastUnsubscribe = null;
  }

  // Stop all monitoring
  insightsBroadcast.shutdown();

  // Close all connections
  clients.forEach((_info, ws) => {
    try {
      ws.close();
    } catch {
      // Ignore errors on close
    }
  });

  clients.clear();
  userSubscribers.clear();

  log.info('Insights WebSocket shutdown complete');
}
