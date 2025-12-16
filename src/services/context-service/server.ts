/**
 * Context Service Server
 *
 * Standalone HTTP server for the Context microservice.
 * Provides REST API for context building and semantic search.
 *
 * Endpoints:
 * - POST /context/build - Build conversation context
 * - POST /context/search - Semantic memory search
 * - GET /health - Health check
 * - GET /ready - Readiness check
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { getContextService, type ContextRequest, type SearchRequest } from './index.js';

const log = createLogger({ module: 'ContextServer' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = parseInt(process.env.PORT || '8080', 10);
let startTime: number;
let requestCount = 0;

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

async function handleBuildContext(body: string): Promise<{ status: number; data: unknown }> {
  try {
    const request = JSON.parse(body) as ContextRequest;

    if (!request.userId || !request.userMessage || !request.personaId || !request.sessionId) {
      return {
        status: 400,
        data: { error: 'Missing required fields: userId, userMessage, personaId, sessionId' },
      };
    }

    const context = await getContextService().buildContext(request);
    requestCount++;

    return { status: 200, data: context };
  } catch (error) {
    log.error({ error: String(error) }, 'Context build failed');
    return { status: 500, data: { error: 'Context build failed' } };
  }
}

async function handleSearch(body: string): Promise<{ status: number; data: unknown }> {
  try {
    const request = JSON.parse(body) as SearchRequest;

    if (!request.query || !request.userId) {
      return {
        status: 400,
        data: { error: 'Missing required fields: query, userId' },
      };
    }

    const results = await getContextService().search(request);
    requestCount++;

    return { status: 200, data: results };
  } catch (error) {
    log.error({ error: String(error) }, 'Search failed');
    return { status: 500, data: { error: 'Search failed' } };
  }
}

function handleHealth(): { status: number; data: unknown } {
  return {
    status: 200,
    data: {
      status: 'healthy',
      service: 'ferni-context',
      uptime: Date.now() - startTime,
      requestCount,
    },
  };
}

function handleReady(): { status: number; data: unknown } {
  return {
    status: 200,
    data: { ready: true },
  };
}

// ============================================================================
// HTTP SERVER
// ============================================================================

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/';
  const method = req.method || 'GET';

  let result: { status: number; data: unknown };

  try {
    // Health endpoints
    if (url === '/health' || url === '/healthz') {
      result = handleHealth();
    } else if (url === '/ready' || url === '/readyz') {
      result = handleReady();
    }
    // Context endpoints
    else if (url === '/context/build' && method === 'POST') {
      const body = await readBody(req);
      result = await handleBuildContext(body);
    } else if (url === '/context/search' && method === 'POST') {
      const body = await readBody(req);
      result = await handleSearch(body);
    }
    // Clear cache endpoint
    else if (url === '/context/cache/clear' && method === 'POST') {
      getContextService().clearCache();
      result = { status: 200, data: { cleared: true } };
    }
    // 404
    else {
      result = { status: 404, data: { error: 'Not found' } };
    }
  } catch (error) {
    log.error({ error: String(error), url, method }, 'Request handler error');
    result = { status: 500, data: { error: 'Internal server error' } };
  }

  res.writeHead(result.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.data));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  startTime = Date.now();

  log.info({ port: PORT }, 'Starting Context Service');

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      log.error({ error: String(error) }, 'Unhandled request error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  server.listen(PORT, () => {
    log.info({ port: PORT, startupMs: Date.now() - startTime }, 'Context Service ready');
  });

  // Graceful shutdown
  const shutdown = (signal: string): void => {
    log.info({ signal }, 'Shutting down');
    server.close(() => {
      log.info('Context Service stopped');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  log.error({ error: String(error) }, 'Fatal error');
  process.exit(1);
});
