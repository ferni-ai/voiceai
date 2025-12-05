/**
 * Health Check Server
 *
 * Simple HTTP server for Cloud Run health checks and cognitive API.
 * Starts immediately so health checks pass while LiveKit agent initializes.
 *
 * Used by ALL agents regardless of persona.
 *
 * Endpoints:
 * - GET /health - Health check
 * - GET /api/cognitive - Current cognitive state (for dashboard)
 * - GET /api/cognitive/history - Recent cognitive events
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

// Debug flag for startup logging
const DEBUG_STARTUP = process.env['DEBUG_AGENT'] === 'true' || process.env['NODE_ENV'] !== 'production';

// Lazy import cognitive broadcast to avoid circular dependencies
let cognitiveBroadcast: typeof import('../../services/cognitive-broadcast.js').cognitiveBroadcast | null = null;

async function getCognitiveBroadcast() {
  if (!cognitiveBroadcast) {
    try {
      const module = await import('../../services/cognitive-broadcast.js');
      cognitiveBroadcast = module.cognitiveBroadcast;
    } catch {
      return null;
    }
  }
  return cognitiveBroadcast;
}

/**
 * Handle cognitive API requests
 */
async function handleCognitiveAPI(url: string, res: ServerResponse): Promise<void> {
  const broadcast = await getCognitiveBroadcast();

  // CORS headers for dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!broadcast) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Cognitive service not available' }));
    return;
  }

  if (url === '/api/cognitive' || url === '/api/cognitive/state') {
    // Return current cognitive state
    const state = broadcast.getCurrentState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: state,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  if (url === '/api/cognitive/history') {
    // Return recent event history
    const history = broadcast.getHistory(50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: history,
      count: history.length,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // Unknown cognitive endpoint
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unknown cognitive endpoint' }));
}

/**
 * Start a simple HTTP health check server for Cloud Run
 * This starts immediately so Cloud Run health checks pass while LiveKit agent initializes
 *
 * @param serviceName - Name of the service (e.g., 'voice-agent', 'jack-bogle-agent')
 */
export function startHealthCheckServer(serviceName: string = 'voice-agent'): void {
  const port = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 8080;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '/';

    // Health check endpoint for Cloud Run
    if (url === '/' || url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: serviceName,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Cognitive API endpoints
    if (url.startsWith('/api/cognitive')) {
      await handleCognitiveAPI(url, res);
      return;
    }

    // 404 for other routes (LiveKit agent will handle /worker)
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    // Use console here since diag may not be imported yet
    if (DEBUG_STARTUP)
      console.log(`[${serviceName}] Health check server listening on port ${port}`);
  });

  server.on('error', (err: Error) => {
    // If port is already in use, LiveKit's server is running - that's fine
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
      console.error(`[${serviceName}] Health check server error:`, err);
    }
  });
}
