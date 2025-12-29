/**
 * Life Context WebSocket Server
 *
 * Provides real-time WebSocket streaming of cross-domain life context updates.
 * Connects to the LifeContextBroadcast service and streams events to clients.
 *
 * Usage:
 * - Client connects to ws://localhost:PORT/ws/life-context
 * - Client sends { type: 'subscribe', userId: 'xxx' } to start receiving updates
 * - Server streams life context events as JSON
 * - Client can send ping messages to keep connection alive
 *
 * @module services/life-context-websocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { createLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../utils/interval-manager.js';
import {
  lifeContextBroadcast,
  type LifeContextBroadcastEvent,
  startLifeContextMonitoring,
  stopLifeContextMonitoring,
  getLifeContextSnapshot,
} from './life-context-broadcast.js';
import { generateSynthesisTriggers } from '../intelligence/triggers/index.js';

const log = createLogger({ module: 'LifeContextWebSocket' });

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

// Store WebSocket server reference for shutdown
let wssInstance: WebSocketServer | null = null;

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

/**
 * Get the WebSocket server instance (for combined upgrade handling)
 */
export function getLifeContextWebSocketServer(): WebSocketServer | null {
  return wssInstance;
}

/**
 * Initialize WebSocket server for life context streaming
 * Uses noServer: true to allow manual upgrade handling for multiple WebSocket servers
 */
export function initLifeContextWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    // Disable compression to prevent "RSV1 must be clear" errors
    perMessageDeflate: false,
  });

  wssInstance = wss;

  // Handle upgrade requests for /ws/life-context path
  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

    if (pathname === '/ws/life-context') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Note: Don't destroy socket here - let other handlers process their paths
  });

  log.info('Life Context WebSocket server initialized on /ws/life-context');

  // Subscribe to broadcast events
  lifeContextBroadcast.subscribe((event: LifeContextBroadcastEvent) => {
    broadcastToUser(event.userId, {
      type: event.type,
      userId: event.userId,
      snapshot: event.snapshot
        ? {
            overallLoadScore: event.snapshot.overallLoadScore,
            wellbeingScore: event.snapshot.wellbeingScore,
            stressIndicators: event.snapshot.stressIndicators,
            patterns: event.snapshot.patterns,
            createdAt: event.snapshot.createdAt.toISOString(),
          }
        : undefined,
      trigger: event.trigger,
      triggers: event.triggers,
      scanDuration: event.scanDuration,
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

    log.info({ clientCount: clients.size }, 'Life Context WebSocket client connected');

    // Send welcome message
    safeSend(ws, {
      type: 'welcome',
      message: 'Connected to Ferni Life Context',
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
      log.warn({ error: String(error) }, 'Life Context WebSocket client error');
      handleClientDisconnect(ws);
    });
  });

  // Heartbeat to keep connections alive AND clean up stale connections
  registerInterval(
    'life-context-websocket-heartbeat',
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

      case 'refresh':
        if (data.userId) {
          handleRefreshRequest(ws, data.userId).catch((error: unknown) => {
            log.error({ error, userId: data.userId }, 'Unhandled error in refresh request');
          });
        }
        break;

      default:
        log.debug({ type: data.type }, 'Unknown message type');
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Invalid message from client');
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
  startLifeContextMonitoring(userId);

  // Send current state immediately
  sendCurrentState(ws, userId).catch((error: unknown) => {
    log.error({ error, userId }, 'Unhandled error sending initial state');
  });

  log.info(
    { userId, subscribers: userSubscribers.get(userId)?.size },
    'Client subscribed to life context'
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
      stopLifeContextMonitoring(userId);
    }
  }

  clientInfo.userId = null;
  clientInfo.subscribedAt = null;

  safeSend(ws, {
    type: 'unsubscribed',
    timestamp: new Date().toISOString(),
  });

  log.info({ userId }, 'Client unsubscribed from life context');
}

/**
 * Handle refresh request - trigger a new scan
 */
async function handleRefreshRequest(ws: WebSocket, userId: string): Promise<void> {
  if (!userId) {
    safeSend(ws, {
      type: 'error',
      message: 'userId is required for refresh',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const snapshot = await lifeContextBroadcast.triggerScan(userId);

    if (!snapshot) {
      safeSend(ws, {
        type: 'refresh_result',
        userId,
        success: false,
        message: 'No life context data available',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const triggers = generateSynthesisTriggers(snapshot);

    safeSend(ws, {
      type: 'refresh_result',
      userId,
      success: true,
      snapshot: {
        overallLoadScore: snapshot.overallLoadScore,
        wellbeingScore: snapshot.wellbeingScore,
        stressIndicators: snapshot.stressIndicators,
        patterns: snapshot.patterns,
        createdAt: snapshot.createdAt.toISOString(),
      },
      triggers: triggers.map((t) => ({
        id: t.id,
        category: t.category,
        suggestedResponse: t.suggestedResponse,
        reasoning: t.reasoning,
        confidence: t.confidence,
        priority: t.priority,
        contributingDomains: t.contributingDomains,
        recommendedPersona: t.recommendedPersona,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error handling refresh request');
    safeSend(ws, {
      type: 'error',
      message: 'Failed to refresh life context',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Send current state to a client
 */
async function sendCurrentState(ws: WebSocket, userId: string): Promise<void> {
  try {
    const snapshot = getLifeContextSnapshot(userId);

    if (!snapshot) {
      // No cached snapshot, trigger a scan
      const newSnapshot = await lifeContextBroadcast.triggerScan(userId);
      if (!newSnapshot) {
        safeSend(ws, {
          type: 'initial_state',
          userId,
          snapshot: null,
          triggers: [],
          message: 'No life context data available yet',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const triggers = generateSynthesisTriggers(newSnapshot);

      safeSend(ws, {
        type: 'initial_state',
        userId,
        snapshot: {
          overallLoadScore: newSnapshot.overallLoadScore,
          wellbeingScore: newSnapshot.wellbeingScore,
          stressIndicators: newSnapshot.stressIndicators,
          patterns: newSnapshot.patterns,
          createdAt: newSnapshot.createdAt.toISOString(),
        },
        triggers: triggers.map((t) => ({
          id: t.id,
          category: t.category,
          suggestedResponse: t.suggestedResponse,
          reasoning: t.reasoning,
          confidence: t.confidence,
          priority: t.priority,
          contributingDomains: t.contributingDomains,
          recommendedPersona: t.recommendedPersona,
        })),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const triggers = generateSynthesisTriggers(snapshot);

    safeSend(ws, {
      type: 'initial_state',
      userId,
      snapshot: {
        overallLoadScore: snapshot.overallLoadScore,
        wellbeingScore: snapshot.wellbeingScore,
        stressIndicators: snapshot.stressIndicators,
        patterns: snapshot.patterns,
        createdAt: snapshot.createdAt.toISOString(),
      },
      triggers: triggers.map((t) => ({
        id: t.id,
        category: t.category,
        suggestedResponse: t.suggestedResponse,
        reasoning: t.reasoning,
        confidence: t.confidence,
        priority: t.priority,
        contributingDomains: t.contributingDomains,
        recommendedPersona: t.recommendedPersona,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error sending current state');
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
        stopLifeContextMonitoring(clientInfo.userId);
      }
    }
  }

  clients.delete(ws);
  log.info({ clientCount: clients.size }, 'Life Context WebSocket client disconnected');
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
 * Get current connection stats
 */
export function getLifeContextWebSocketStats(): {
  connectedClients: number;
  subscribedUsers: number;
  userCounts: Record<string, number>;
} {
  const userCounts: Record<string, number> = {};
  userSubscribers.forEach((subs, userId) => {
    userCounts[userId] = subs.size;
  });

  return {
    connectedClients: clients.size,
    subscribedUsers: userSubscribers.size,
    userCounts,
  };
}

/**
 * Shutdown life context WebSocket service
 */
export function shutdownLifeContextWebSocket(): void {
  if (heartbeatInterval) {
    clearNamedInterval('life-context-websocket-heartbeat');
    heartbeatInterval = null;
  }

  // Stop all monitoring
  lifeContextBroadcast.shutdown();

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

  if (wssInstance) {
    wssInstance.close();
    wssInstance = null;
  }

  log.info('Life Context WebSocket shutdown complete');
}
