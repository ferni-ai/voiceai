/**
 * Better Than Human Analytics API Routes
 *
 * Exposes BTH capability effectiveness metrics via HTTP endpoints.
 *
 * Endpoints:
 * - GET /api/admin/bth-analytics/stats - All capability stats
 * - GET /api/admin/bth-analytics/stats/:capability - Single capability stats
 * - GET /api/admin/bth-analytics/top - Most effective capabilities
 * - GET /api/admin/bth-analytics/trend - Effectiveness trend over time
 * - GET /api/admin/bth-analytics/feedback/:userId - User feedback history
 * - POST /api/admin/bth-analytics/refresh - Refresh aggregates
 *
 * @module @ferni/api/bth-analytics-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { requireAdmin } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parsePositiveInt, sendError, sendJSON } from './helpers.js';
import {
  getPersistedCapabilityStats,
  getTopCapabilities,
  getEffectivenessTrend,
  getUserFeedbackHistory,
  updateAggregates,
} from '../conversation/superhuman/analytics-persistence.js';
import {
  getCapabilityStats,
  getMostEffectiveCapabilities,
  type SuperhumanCapability,
} from '../conversation/superhuman/analytics.js';

const log = createLogger({ module: 'BTHAnalyticsAPI' });

const BASE_PATH = '/api/admin/bth-analytics';

/**
 * Handle BTH Analytics routes
 */
export async function handleBTHAnalyticsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Require admin access for all endpoints
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    const route = pathname.slice(BASE_PATH.length);
    const url = new URL(pathname, `http://${req.headers.host || 'localhost'}`);

    // GET /api/admin/bth-analytics/stats
    if (route === '/stats' && req.method === 'GET') {
      return await handleGetStats(res, url);
    }

    // GET /api/admin/bth-analytics/stats/:capability
    if (route.startsWith('/stats/') && req.method === 'GET') {
      const capability = route.slice(7) as SuperhumanCapability;
      return await handleGetCapabilityStats(res, capability);
    }

    // GET /api/admin/bth-analytics/top
    if (route === '/top' && req.method === 'GET') {
      return await handleGetTopCapabilities(res, url);
    }

    // GET /api/admin/bth-analytics/trend
    if (route === '/trend' && req.method === 'GET') {
      return await handleGetTrend(res, url);
    }

    // GET /api/admin/bth-analytics/feedback/:userId
    if (route.startsWith('/feedback/') && req.method === 'GET') {
      const userId = route.slice(10);
      return await handleGetUserFeedback(res, userId, url);
    }

    // POST /api/admin/bth-analytics/refresh
    if (route === '/refresh' && req.method === 'POST') {
      return await handleRefreshAggregates(res);
    }

    // Unknown route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'BTH Analytics route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

/**
 * GET /api/admin/bth-analytics/stats
 * Returns stats for all capabilities
 */
async function handleGetStats(res: ServerResponse, url: URL): Promise<boolean> {
  const source = url.searchParams.get('source') || 'both';

  let stats;
  if (source === 'memory') {
    // In-memory stats (fast, current session only)
    stats = getCapabilityStats();
  } else if (source === 'firestore') {
    // Firestore stats (persisted, all time)
    stats = await getPersistedCapabilityStats();
  } else {
    // Merge both (default)
    const memoryStats = getCapabilityStats();
    const firestoreStats = await getPersistedCapabilityStats();

    // Merge by capability
    const merged = new Map<string, (typeof memoryStats)[0]>();

    for (const stat of firestoreStats) {
      merged.set(stat.capability, stat);
    }

    // Override with more recent memory stats
    for (const stat of memoryStats) {
      const existing = merged.get(stat.capability);
      if (existing) {
        merged.set(stat.capability, {
          ...existing,
          // Add memory stats on top of firestore
          totalUsage: existing.totalUsage + stat.totalUsage,
          appliedCount: existing.appliedCount + stat.appliedCount,
          positiveReactions: existing.positiveReactions + stat.positiveReactions,
          neutralReactions: existing.neutralReactions + stat.neutralReactions,
          negativeReactions: existing.negativeReactions + stat.negativeReactions,
        });
      } else {
        merged.set(stat.capability, stat);
      }
    }

    stats = Array.from(merged.values());
  }

  sendJSON(res, {
    success: true,
    source,
    count: stats.length,
    stats,
  });
  return true;
}

/**
 * GET /api/admin/bth-analytics/stats/:capability
 * Returns stats for a single capability
 */
async function handleGetCapabilityStats(
  res: ServerResponse,
  capability: SuperhumanCapability
): Promise<boolean> {
  const stats = await getPersistedCapabilityStats(capability);
  const stat = stats.find((s) => s.capability === capability);

  if (!stat) {
    sendError(res, `Capability not found: ${capability}`, 404);
    return true;
  }

  sendJSON(res, {
    success: true,
    capability,
    stats: stat,
  });
  return true;
}

/**
 * GET /api/admin/bth-analytics/top
 * Returns most effective capabilities
 */
async function handleGetTopCapabilities(res: ServerResponse, url: URL): Promise<boolean> {
  const limit = parsePositiveInt(url.searchParams.get('limit'), 10, 50);
  const source = url.searchParams.get('source') || 'memory';

  let topCapabilities;
  if (source === 'firestore') {
    topCapabilities = await getTopCapabilities(limit);
  } else {
    // In-memory (current session) - function returns all, we slice to limit
    topCapabilities = getMostEffectiveCapabilities().slice(0, limit);
  }

  sendJSON(res, {
    success: true,
    source,
    count: topCapabilities.length,
    capabilities: topCapabilities,
  });
  return true;
}

/**
 * GET /api/admin/bth-analytics/trend
 * Returns effectiveness trend over time
 */
async function handleGetTrend(res: ServerResponse, url: URL): Promise<boolean> {
  const days = parsePositiveInt(url.searchParams.get('days'), 7, 30);
  const capabilityParam = url.searchParams.get('capability');

  // If no capability specified, default to 'remember_like_elephant' as representative
  const capability = (capabilityParam as SuperhumanCapability) || 'remember_like_elephant';
  const trend = await getEffectivenessTrend(capability, days);

  sendJSON(res, {
    success: true,
    days,
    capability: capabilityParam || 'all',
    trend,
  });
  return true;
}

/**
 * GET /api/admin/bth-analytics/feedback/:userId
 * Returns feedback history for a specific user
 */
async function handleGetUserFeedback(
  res: ServerResponse,
  userId: string,
  url: URL
): Promise<boolean> {
  const limit = parsePositiveInt(url.searchParams.get('limit'), 50, 200);

  const feedback = await getUserFeedbackHistory(userId, limit);

  sendJSON(res, {
    success: true,
    userId,
    count: feedback.length,
    feedback,
  });
  return true;
}

/**
 * POST /api/admin/bth-analytics/refresh
 * Refresh aggregates from raw events
 */
async function handleRefreshAggregates(res: ServerResponse): Promise<boolean> {
  log.info('Refreshing BTH analytics aggregates');

  await updateAggregates();

  sendJSON(res, {
    success: true,
    message: 'Aggregates refreshed',
    timestamp: new Date().toISOString(),
  });
  return true;
}
