/**
 * UI/API Server
 *
 * Serves the frontend UI, provides API routes, and handles integrations.
 *
 * This file is the thin entry point. The pieces live in:
 * - dispatch/request-handler.ts  request pipeline + ordered route groups
 * - dispatch/*-routes.ts         route groups (pathname guards → handlers)
 * - server-lifecycle.ts          WebSockets, background services, shutdown
 *
 * Route order is pinned by __tests__/route-table.test.ts.
 */

import 'dotenv/config';
import http from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { hardenServer, startDDoSMonitoring } from '../../utils/ddos-protection.js';
import { handleApiRequest } from './dispatch/request-handler.js';
import {
  createGracefulShutdown,
  initRealtimeWebSockets,
  registerDDoSAlerting,
  registerShutdownSignals,
  startBackgroundServices,
} from './server-lifecycle.js';

const log = createLogger({ module: 'APIServer' });

const PORT = parseInt(process.env.PORT || '3002', 10);

// Validate configuration
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  log.error(
    'Missing required environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET'
  );
  process.exit(1);
}

/**
 * Create the HTTP server
 */
// Node's http server ignores the listener's return value; the async handler is
// passed directly so a rejected request promise behaves exactly as it always has.
// eslint-disable-next-line @typescript-eslint/no-misused-promises
const server = http.createServer(handleApiRequest);

// Harden server with DDoS protection
hardenServer(server);

// Initialize WebSocket servers for real-time streaming
initRealtimeWebSockets(server);

// Register DDoS alerting to Slack
registerDDoSAlerting();

// Start automatic DDoS monitoring
const stopDDoSMonitoring = startDDoSMonitoring('ui-server', 30_000);

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  void startBackgroundServices(server, { port: PORT, livekitUrl: LIVEKIT_URL });
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Gracefully shutdown all services
 */
const gracefulShutdown = createGracefulShutdown(server, stopDDoSMonitoring);

// Handle shutdown signals
registerShutdownSignals(gracefulShutdown);

// Export for gateway
export { server, gracefulShutdown };
export { stopDDoSMonitoring };
