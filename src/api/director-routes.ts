/**
 * Director Mode WebSocket Routes
 *
 * WebSocket endpoint for the Director Console UI.
 * Enables real-time bidirectional communication between the Director
 * and the DirectorEngine.
 *
 * Protocol:
 * - Director → Server: DirectorChannelInbound (commands, queries, suggestions)
 * - Server → Director: DirectorChannelOutbound (state updates, events, errors)
 *
 * Auth: Only authorized director user IDs can connect.
 *
 * @route /ws/director
 */

import { createLogger } from '../utils/safe-logger.js';
import { WebSocketServer, type WebSocket } from 'ws';

import type { IncomingMessage } from 'http';
import type { Server } from 'node:http';
import type { DirectorEngine } from '../integrations/qwen3-omni/director/director-engine.js';
import type {
  DirectorChannelInbound,
  DirectorChannelOutbound,
  DirectorEvent,
} from '../integrations/qwen3-omni/director/types.js';

const log = createLogger({ module: 'DirectorRoutes' });

// =============================================================================
// TYPES
// =============================================================================

export interface DirectorRoutesConfig {
  /** Authorized director user IDs */
  authorizedDirectorIds: readonly string[];
}

// =============================================================================
// DIRECTOR SESSION REGISTRY
// =============================================================================

/**
 * Maps session IDs to their DirectorEngine instances.
 * Set by the voice agent when a Director Mode session starts.
 */
const directorEngines = new Map<string, DirectorEngine>();

/**
 * Register a DirectorEngine for a session.
 * Called by the voice agent when setting up a Director Mode session.
 */
export function registerDirectorEngine(sessionId: string, engine: DirectorEngine): void {
  directorEngines.set(sessionId, engine);
  log.info({ sessionId }, 'DirectorEngine registered for WebSocket access');
}

/**
 * Unregister a DirectorEngine when session ends.
 */
export function unregisterDirectorEngine(sessionId: string): void {
  directorEngines.delete(sessionId);
  log.info({ sessionId }, 'DirectorEngine unregistered');
}

// =============================================================================
// WEBSOCKET SERVER INIT
// =============================================================================

let directorWss: WebSocketServer | null = null;
let directorUpgradeHandler:
  | ((request: IncomingMessage, socket: unknown, head: Buffer) => void)
  | null = null;

/**
 * Initialize Director Mode WebSocket server on /ws/director.
 * Uses noServer: true and registers an upgrade handler on the HTTP server.
 */
export function initDirectorWebSocket(httpServer: Server, config: DirectorRoutesConfig): void {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
  });

  directorWss = wss;

  const upgradeHandler = (request: IncomingMessage, socket: unknown, head: Buffer): void => {
    const url = request.url ?? '';
    const pathname = url.split('?')[0];
    if (pathname === '/ws/director') {
      wss.handleUpgrade(request, socket as import('node:net').Socket, head, (ws: WebSocket) => {
        handleDirectorWebSocket(ws, request, config);
      });
    }
  };

  directorUpgradeHandler = upgradeHandler;
  httpServer.on('upgrade', upgradeHandler);

  log.info('Director WebSocket server initialized on /ws/director');
}

/**
 * Shutdown Director WebSocket server (close all connections).
 */
export function shutdownDirectorWebSocket(): void {
  if (directorWss) {
    directorWss.close(() => {
      log.info('Director WebSocket server closed');
    });
    directorWss = null;
  }
  if (directorUpgradeHandler) {
    directorUpgradeHandler = null;
  }
}

// =============================================================================
// WEBSOCKET HANDLER
// =============================================================================

/**
 * Handle a new WebSocket connection for Director Mode.
 *
 * Expected URL format: /ws/director?sessionId=xxx&userId=yyy
 *
 * @param ws - WebSocket connection
 * @param req - Incoming HTTP request (for URL params)
 * @param config - Route configuration
 */
export function handleDirectorWebSocket(
  ws: WebSocket,
  req: IncomingMessage,
  config: DirectorRoutesConfig
): void {
  // Parse query params
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const sessionId = url.searchParams.get('sessionId');
  const userId = url.searchParams.get('userId');

  // Validate auth
  if (!userId || !config.authorizedDirectorIds.includes(userId)) {
    log.warn({ userId }, 'Unauthorized director WebSocket connection attempt');
    sendMessage(ws, {
      type: 'error',
      message: 'Unauthorized: Not a registered director',
    });
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Validate session
  if (!sessionId) {
    sendMessage(ws, {
      type: 'error',
      message: 'Missing sessionId parameter',
    });
    ws.close(4002, 'Missing sessionId');
    return;
  }

  const engine = directorEngines.get(sessionId);
  if (!engine) {
    sendMessage(ws, {
      type: 'error',
      message: `No active Director session for ${sessionId}`,
    });
    ws.close(4003, 'Session not found');
    return;
  }

  log.info({ sessionId, userId }, 'Director WebSocket connected');

  // Send initial state
  sendMessage(ws, {
    type: 'state',
    snapshot: engine.getStateSnapshot(),
  });

  // Subscribe to director events
  const eventHandler = (event: DirectorEvent) => {
    if (ws.readyState === ws.OPEN) {
      sendMessage(ws, { type: 'event', event });
    }
  };

  engine.on('director_event', eventHandler);

  // Handle incoming messages
  ws.on('message', (data) => {
    void (async () => {
      try {
        const message = JSON.parse(data.toString()) as DirectorChannelInbound;
        await handleInboundMessage(ws, engine, message);
      } catch (error) {
        log.warn({ error: String(error) }, 'Invalid director WebSocket message');
        sendMessage(ws, {
          type: 'error',
          message: `Invalid message format: ${String(error)}`,
        });
      }
    })();
  });

  // Handle disconnect
  ws.on('close', () => {
    engine.off('director_event', eventHandler);
    log.info({ sessionId, userId }, 'Director WebSocket disconnected');
  });

  ws.on('error', (error) => {
    log.warn({ error: String(error) }, 'Director WebSocket error');
    engine.off('director_event', eventHandler);
  });
}

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

async function handleInboundMessage(
  ws: WebSocket,
  engine: DirectorEngine,
  message: DirectorChannelInbound
): Promise<void> {
  switch (message.type) {
    case 'command': {
      await engine.executeCommand(message.command);
      break;
    }

    case 'override': {
      await engine.executeCommand({ type: 'OVERRIDE', override: message.override });
      break;
    }

    case 'query': {
      handleQuery(ws, engine, message.query);
      break;
    }

    case 'set_auto_director': {
      engine.setAutoDirectorMode(message.mode);
      sendMessage(ws, {
        type: 'state',
        snapshot: engine.getStateSnapshot(),
      });
      break;
    }

    case 'accept_suggestion': {
      await engine.acceptSuggestion(message.suggestionId);
      break;
    }

    case 'dismiss_suggestion': {
      engine.dismissSuggestion(message.suggestionId);
      break;
    }

    default: {
      sendMessage(ws, {
        type: 'error',
        message: `Unknown message type: ${(message as { type: string }).type}`,
      });
    }
  }
}

function handleQuery(
  ws: WebSocket,
  engine: DirectorEngine,
  query: 'state' | 'suggestions' | 'cast' | 'scene'
): void {
  // All queries return the full state snapshot for simplicity
  sendMessage(ws, {
    type: 'state',
    snapshot: engine.getStateSnapshot(),
  });
}

// =============================================================================
// HELPERS
// =============================================================================

function sendMessage(ws: WebSocket, message: DirectorChannelOutbound): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
