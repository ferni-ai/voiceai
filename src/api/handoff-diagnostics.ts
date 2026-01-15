/**
 * Handoff Diagnostics API
 *
 * Provides endpoints for viewing handoff metrics and diagnostics.
 *
 * NOTE: All diagnostics endpoints require admin authentication.
 * These endpoints expose operational data that should not be public.
 *
 * Endpoints:
 *   GET /api/diagnostics/handoffs - Get handoff metrics summary
 *   GET /api/diagnostics/handoffs/recent - Get recent handoff traces
 *   GET /api/diagnostics/handoffs/failures - Get recent failures
 *   GET /api/diagnostics/handoffs/in-progress - Get in-progress handoffs
 *   GET /api/diagnostics/handoffs/:traceId - Get specific trace
 */

import type { Request, Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { handoffMetrics } from '../services/analytics/handoff-metrics.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { parsePositiveInt, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'HandoffDiagnostics' });

// ============================================================================
// API HANDLERS (Express-style for backward compatibility)
// ============================================================================

/**
 * GET /api/diagnostics/handoffs
 * Returns handoff metrics summary for the specified time window.
 */
export async function getHandoffMetrics(req: Request, res: Response): Promise<void> {
  try {
    const windowMinutes = parseInt(req.query['window'] as string) || 60;
    const summary = handoffMetrics.getSummary(windowMinutes);

    res.json({
      success: true,
      data: summary,
      meta: {
        windowMinutes,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get handoff metrics');
    res.status(500).json({
      success: false,
      error: 'Failed to get handoff metrics',
    });
  }
}

/**
 * GET /api/diagnostics/handoffs/recent
 * Returns recent handoff traces (both successful and failed).
 */
export async function getRecentHandoffs(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 200);
    const windowMinutes = parseInt(req.query['window'] as string) || 60;

    const summary = handoffMetrics.getSummary(windowMinutes);

    // Combine successes and failures, sort by time
    const traces = [...summary.recentFailures]
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);

    res.json({
      success: true,
      data: {
        traces,
        total: summary.totalAttempts,
        successRate: summary.successRate,
      },
      meta: {
        limit,
        windowMinutes,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get recent handoffs');
    res.status(500).json({
      success: false,
      error: 'Failed to get recent handoffs',
    });
  }
}

/**
 * GET /api/diagnostics/handoffs/failures
 * Returns recent handoff failures with detailed error information.
 */
export async function getHandoffFailures(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 200);
    const windowMinutes = parseInt(req.query['window'] as string) || 60;

    const summary = handoffMetrics.getSummary(windowMinutes);
    const failures = summary.recentFailures.slice(0, limit);

    res.json({
      success: true,
      data: {
        failures,
        totalFailures: summary.totalFailures,
        failureRate: 1 - summary.successRate,
        byReason: summary.byFailureReason,
      },
      meta: {
        limit,
        windowMinutes,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get handoff failures');
    res.status(500).json({
      success: false,
      error: 'Failed to get handoff failures',
    });
  }
}

/**
 * GET /api/diagnostics/handoffs/in-progress
 * Returns currently in-progress handoffs.
 */
export async function getInProgressHandoffs(req: Request, res: Response): Promise<void> {
  try {
    const inProgress = handoffMetrics.getInProgressHandoffs();

    res.json({
      success: true,
      data: {
        inProgress,
        count: inProgress.length,
      },
      meta: {
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get in-progress handoffs');
    res.status(500).json({
      success: false,
      error: 'Failed to get in-progress handoffs',
    });
  }
}

/**
 * GET /api/diagnostics/handoffs/:traceId
 * Returns a specific handoff trace by ID.
 */
export async function getHandoffTrace(req: Request, res: Response): Promise<void> {
  try {
    const traceId = req.params['traceId'];
    if (!traceId) {
      res.status(400).json({
        success: false,
        error: 'traceId is required',
      });
      return;
    }

    const trace = handoffMetrics.getTrace(traceId);

    if (!trace) {
      res.status(404).json({
        success: false,
        error: `Trace ${traceId} not found`,
      });
      return;
    }

    res.json({
      success: true,
      data: trace,
      meta: {
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get handoff trace');
    res.status(500).json({
      success: false,
      error: 'Failed to get handoff trace',
    });
  }
}

// ============================================================================
// RAW HTTP HANDLERS (with authentication)
// ============================================================================

/**
 * Handle diagnostics routes with raw HTTP (for ui-server.js integration).
 * All diagnostics endpoints require admin authentication.
 *
 * @returns true if request was handled, false otherwise
 */
export async function handleDiagnosticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/diagnostics routes
  if (!pathname.startsWith('/api/diagnostics/')) {
    return false;
  }

  // Require admin auth for all diagnostics endpoints
  const auth = await requireAuth(req, res, { requireAdmin: true });
  if (!auth) {
    return true; // Auth failed, response already sent
  }

  try {
    // GET /api/diagnostics/handoffs
    if (pathname === '/api/diagnostics/handoffs') {
      const windowMinutes = parsePositiveInt(
        parsedUrl.searchParams.get('window'),
        60,
        1440 // max 24 hours
      );
      const summary = handoffMetrics.getSummary(windowMinutes);

      sendJSON(res, {
        success: true,
        data: summary,
        meta: {
          windowMinutes,
          generatedAt: new Date().toISOString(),
        },
      });
      return true;
    }

    // GET /api/diagnostics/handoffs/recent
    if (pathname === '/api/diagnostics/handoffs/recent') {
      const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 50, 200);
      const windowMinutes = parsePositiveInt(parsedUrl.searchParams.get('window'), 60, 1440);

      const summary = handoffMetrics.getSummary(windowMinutes);
      const traces = [...summary.recentFailures]
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, limit);

      sendJSON(res, {
        success: true,
        data: {
          traces,
          total: summary.totalAttempts,
          successRate: summary.successRate,
        },
        meta: { limit, windowMinutes, generatedAt: new Date().toISOString() },
      });
      return true;
    }

    // GET /api/diagnostics/handoffs/failures
    if (pathname === '/api/diagnostics/handoffs/failures') {
      const limit = parsePositiveInt(parsedUrl.searchParams.get('limit'), 50, 200);
      const windowMinutes = parsePositiveInt(parsedUrl.searchParams.get('window'), 60, 1440);

      const summary = handoffMetrics.getSummary(windowMinutes);
      const failures = summary.recentFailures.slice(0, limit);

      sendJSON(res, {
        success: true,
        data: {
          failures,
          totalFailures: summary.totalFailures,
          failureRate: 1 - summary.successRate,
          byReason: summary.byFailureReason,
        },
        meta: { limit, windowMinutes, generatedAt: new Date().toISOString() },
      });
      return true;
    }

    // GET /api/diagnostics/handoffs/in-progress
    if (pathname === '/api/diagnostics/handoffs/in-progress') {
      const inProgress = handoffMetrics.getInProgressHandoffs();

      sendJSON(res, {
        success: true,
        data: { inProgress, count: inProgress.length },
        meta: { generatedAt: new Date().toISOString() },
      });
      return true;
    }

    // GET /api/diagnostics/handoffs/:traceId
    const traceMatch = pathname.match(/^\/api\/diagnostics\/handoffs\/([^/]+)$/);
    if (traceMatch) {
      const traceId = traceMatch[1];
      const trace = handoffMetrics.getTrace(traceId);

      if (!trace) {
        sendError(res, `Trace ${traceId} not found`, 404);
        return true;
      }

      sendJSON(res, {
        success: true,
        data: trace,
        meta: { generatedAt: new Date().toISOString() },
      });
      return true;
    }

    return false; // Route not matched
  } catch (error) {
    log.error({ error, pathname }, 'Diagnostics route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// ROUTE SETUP HELPER (Express)
// ============================================================================

/**
 * Set up handoff diagnostics routes on an Express app/router.
 *
 * NOTE: For raw HTTP servers (like ui-server.js), use handleDiagnosticsRoutes()
 * instead, which includes built-in admin authentication.
 */
export function setupHandoffDiagnosticsRoutes(app: {
  get: (path: string, handler: (req: Request, res: Response) => void | Promise<void>) => void;
}): void {
  // WARNING: When using Express, add your own auth middleware!
  // These handlers do NOT include authentication by default.
  app.get('/api/diagnostics/handoffs', getHandoffMetrics);
  app.get('/api/diagnostics/handoffs/recent', getRecentHandoffs);
  app.get('/api/diagnostics/handoffs/failures', getHandoffFailures);
  app.get('/api/diagnostics/handoffs/in-progress', getInProgressHandoffs);
  app.get('/api/diagnostics/handoffs/:traceId', getHandoffTrace);

  log.info('📊 Handoff diagnostics routes registered');
}

// ============================================================================
// DASHBOARD
// ============================================================================

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get the path to the static dashboard file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DASHBOARD_PATH = join(__dirname, '../../public/dashboards/handoff-diagnostics.html');

// Cache the dashboard HTML in memory
let cachedDashboardHtml: string | null = null;

/**
 * Get the dashboard HTML (cached for performance).
 */
export function getDashboardHtml(): string {
  if (!cachedDashboardHtml) {
    try {
      cachedDashboardHtml = readFileSync(DASHBOARD_PATH, 'utf-8');
    } catch (error) {
      log.error({ error, path: DASHBOARD_PATH }, 'Failed to read dashboard file');
      // Fallback to minimal HTML
      cachedDashboardHtml = `<!DOCTYPE html>
<html><head><title>Handoff Diagnostics</title></head>
<body style="font-family:sans-serif;padding:2rem;background:#1a1612;color:#faf6f0;">
<h1>Dashboard Not Found</h1>
<p>Could not load dashboard from ${DASHBOARD_PATH}</p>
<p><a href="/api/diagnostics/handoffs" style="color:#4a6741;">View raw metrics JSON</a></p>
</body></html>`;
    }
  }
  return cachedDashboardHtml;
}

/**
 * Clear the dashboard cache (useful for development).
 */
export function clearDashboardCache(): void {
  cachedDashboardHtml = null;
}

/**
 * Handler for the dashboard page.
 */
export function getDashboardPage(_req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
  res.send(getDashboardHtml());
}
