/**
 * Health Check Server
 *
 * Simple HTTP server for Cloud Run health checks.
 * Starts immediately so health checks pass while LiveKit agent initializes.
 *
 * Used by ALL agents regardless of persona.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

// Debug flag for startup logging
const DEBUG_STARTUP = process.env['DEBUG_AGENT'] === 'true' || process.env['NODE_ENV'] !== 'production';

/**
 * Start a simple HTTP health check server for Cloud Run
 * This starts immediately so Cloud Run health checks pass while LiveKit agent initializes
 *
 * @param serviceName - Name of the service (e.g., 'voice-agent', 'jack-bogle-agent')
 */
export function startHealthCheckServer(serviceName: string = 'voice-agent'): void {
  const port = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 8080;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Health check endpoint for Cloud Run
    if (req.url === '/' || req.url === '/health') {
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
