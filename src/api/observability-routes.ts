/**
 * Observability API Routes
 *
 * Exposes all observability metrics via HTTP endpoints.
 *
 * Endpoints:
 * - GET /api/observability - Full observability snapshot
 * - GET /api/observability/llm - LLM health metrics
 * - GET /api/observability/connection - Connection health metrics
 * - GET /api/observability/ux - User experience metrics
 * - GET /api/observability/memory - Memory/RAG metrics
 * - GET /api/observability/cost - Cost tracking metrics
 * - GET /api/observability/errors - Error & recovery metrics
 * - GET /api/observability/personas - Persona health metrics
 * - GET /api/observability/alerts - Recent alerts
 * - POST /api/observability/clear - Clear all metrics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  connectionHealthMetrics,
  costMetrics,
  errorMetrics,
  llmHealthMetrics,
  memoryMetrics,
  observabilityHub,
  personaMetrics,
  uxQualityMetrics,
} from '../services/observability/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAdmin, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parsePositiveInt, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'ObservabilityAPI' });

/**
 * Parse window minutes from query string
 */
function getWindowMinutes(url: URL): number {
  return parsePositiveInt(url.searchParams.get('window'), 60, 1440);
}

/**
 * Handle observability API routes
 */
export async function handleObservabilityRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/observability routes
  if (!pathname.startsWith('/api/observability')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // Write operations (clear) require admin access
  if (req.method === 'POST') {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
  } else {
    // Read operations require basic auth
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const windowMinutes = getWindowMinutes(url);

  try {
    // GET /api/observability - Full snapshot
    if (pathname === '/api/observability' && req.method === 'GET') {
      const snapshot = observabilityHub.getSnapshot(windowMinutes);
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/llm - LLM health
    if (pathname === '/api/observability/llm' && req.method === 'GET') {
      const snapshot = llmHealthMetrics.getSnapshot(windowMinutes);
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/connection - Connection health
    if (pathname === '/api/observability/connection' && req.method === 'GET') {
      const snapshot = connectionHealthMetrics.getSnapshot(windowMinutes);
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/ux - UX quality
    if (pathname === '/api/observability/ux' && req.method === 'GET') {
      const snapshot = uxQualityMetrics.getSnapshot(windowMinutes);
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/memory - Memory/RAG health
    if (pathname === '/api/observability/memory' && req.method === 'GET') {
      const snapshot = memoryMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/cost - Cost tracking
    if (pathname === '/api/observability/cost' && req.method === 'GET') {
      const snapshot = costMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/errors - Error & recovery
    if (pathname === '/api/observability/errors' && req.method === 'GET') {
      const snapshot = errorMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/personas - Persona health
    if (pathname === '/api/observability/personas' && req.method === 'GET') {
      const snapshot = personaMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/alerts - Recent alerts
    if (pathname === '/api/observability/alerts' && req.method === 'GET') {
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      const alerts = observabilityHub.getRecentAlerts(limit);
      sendJSON(res, { alerts, count: alerts.length });
      return true;
    }

    // POST /api/observability/clear - Clear all metrics
    if (pathname === '/api/observability/clear' && req.method === 'POST') {
      observabilityHub.clearAlerts();
      sendJSON(res, { message: 'All observability metrics cleared' });
      log.info('All observability metrics cleared via API');
      return true;
    }

    // Unknown observability route
    sendError(res, 'Unknown observability endpoint', 404);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ error: err }, 'Observability API error');
    sendError(res, message, 500);
    return true;
  }
}
