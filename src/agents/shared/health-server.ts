/**
 * Health Check Server
 *
 * Simple HTTP server for Cloud Run health checks, cognitive API, and metrics.
 * Starts immediately so health checks pass while LiveKit agent initializes.
 *
 * Used by ALL agents regardless of persona.
 *
 * Endpoints:
 * - GET /health - Health check
 * - GET /api/cognitive - Current cognitive state (for dashboard)
 * - GET /api/cognitive/history - Recent cognitive events
 * - GET /api/metrics - Full persistence metrics snapshot
 * - GET /api/metrics/summary - Concise metrics summary
 * - GET /api/metrics/sessions - Active sessions only
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

// Debug flag for startup logging
const DEBUG_STARTUP = process.env['DEBUG_AGENT'] === 'true' || process.env['NODE_ENV'] !== 'production';

// Lazy imports to avoid circular dependencies
let cognitiveBroadcast: typeof import('../../services/cognitive-broadcast.js').cognitiveBroadcast | null = null;
let persistenceMetrics: typeof import('../../services/persistence-metrics.js').persistenceMetrics | null = null;

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

async function getPersistenceMetrics() {
  if (!persistenceMetrics) {
    try {
      const module = await import('../../services/persistence-metrics.js');
      persistenceMetrics = module.persistenceMetrics;
    } catch {
      return null;
    }
  }
  return persistenceMetrics;
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
 * Handle persistence metrics API requests
 */
async function handleMetricsAPI(url: string, res: ServerResponse): Promise<void> {
  const metrics = await getPersistenceMetrics();

  // CORS headers for dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!metrics) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Metrics service not available' }));
    return;
  }

  if (url === '/api/metrics' || url === '/api/metrics/snapshot') {
    // Return full metrics snapshot
    const snapshot = metrics.getSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: snapshot,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  if (url === '/api/metrics/summary') {
    // Return summary report (more concise)
    const summary = metrics.getSummaryReport();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  if (url === '/api/metrics/sessions') {
    // Return only active sessions
    const snapshot = metrics.getSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: {
        activeSessions: snapshot.activeSessions,
        sessions: snapshot.currentSessions,
      },
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // Unknown metrics endpoint
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unknown metrics endpoint' }));
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

    // Persistence metrics API endpoints
    if (url.startsWith('/api/metrics')) {
      await handleMetricsAPI(url, res);
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
