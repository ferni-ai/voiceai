/**
 * Team Insights API Routes
 *
 * Provides cross-persona insights to the frontend.
 * These insights represent the collaborative intelligence of the Ferni team.
 *
 * Routes:
 * - GET /api/team-insights - Get current insights and team status
 * - POST /api/team-insights/acknowledge/:id - Mark insight as acknowledged
 * - POST /api/team-insights/scan - Trigger a new insight scan
 *
 * @module api/routes/team-insights
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import {
  buildInsightBriefingForHandoff,
  generateTeamStatus,
  acknowledgeInsight as acknowledgeInsightService,
  scanForCrossPersonaInsights,
  type PersonaId,
  type CrossPersonaInsight,
} from '../../services/cross-persona-insights.js';
import {
  getPerformanceStats,
  clearPerformanceLog,
  clearAllSuperhumanCache,
} from '../../intelligence/context-builders/superhuman/superhuman-integration.js';
import { getUserId, sendJSON, sendError, handleCorsPreflightIfNeeded } from '../helpers.js';
import { API_ERRORS } from '../error-messages.js';

const log = createLogger({ module: 'api:team-insights' });

// ============================================================================
// TYPES
// ============================================================================

interface FormattedInsight {
  id: string;
  source: string;
  category: string;
  summary: string;
  content: string;
  priority: string;
  createdAt: number;
  isNew: boolean;
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/team-insights
 * Get current insights and team status for the user
 */
async function getTeamInsights(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    // Build insight briefing for all personas (use 'ferni' as default target)
    const briefing = await buildInsightBriefingForHandoff(userId, 'ferni' as PersonaId);
    const teamStatus = await generateTeamStatus(userId);

    // Format insights for frontend
    const formattedInsights: FormattedInsight[] = briefing.incomingInsights.map(
      (insight: CrossPersonaInsight) => ({
        id: insight.id,
        source: insight.source,
        category: insight.category,
        summary: insight.content.substring(0, 100), // Use first 100 chars as summary
        content: insight.content,
        priority: insight.priority,
        createdAt: insight.createdAt,
        isNew: insight.oneTime,
      })
    );

    sendJSON(res, {
      insights: formattedInsights,
      teamStatus: {
        financialHealth: teamStatus.financialHealth,
        habitHealth: teamStatus.habitHealth,
        goalHealth: teamStatus.goalStatus, // Note: actual field is goalStatus
      },
      proactiveDiscoveries: briefing.proactiveDiscoveries,
      lastUpdated: Date.now(),
    });

    log.debug({ userId, insightCount: formattedInsights.length }, 'Team insights fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get team insights');
    sendError(res, 'Failed to fetch team insights', 500);
  }
}

/**
 * POST /api/team-insights/acknowledge/:id
 * Mark an insight as acknowledged by the user
 */
async function acknowledgeInsight(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  insightId: string
): Promise<void> {
  try {
    await acknowledgeInsightService(userId, insightId, 'ferni' as PersonaId);

    sendJSON(res, {
      success: true,
      insightId,
      acknowledged: true,
    });

    log.debug({ userId, insightId }, 'Insight acknowledged');
  } catch (error) {
    log.error({ error, userId, insightId }, 'Failed to acknowledge insight');
    sendError(res, 'Failed to acknowledge insight', 500);
  }
}

/**
 * POST /api/team-insights/scan
 * Trigger a new scan for cross-persona insights
 */
async function triggerInsightScan(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    await scanForCrossPersonaInsights(userId);

    // Return the updated insights
    const briefing = await buildInsightBriefingForHandoff(userId, 'ferni' as PersonaId);

    sendJSON(res, {
      success: true,
      newInsightsCount: briefing.incomingInsights.length,
      scannedAt: Date.now(),
    });

    log.debug({ userId }, 'Insight scan completed');
  } catch (error) {
    log.error({ error, userId }, 'Failed to trigger insight scan');
    sendError(res, 'Failed to scan for insights', 500);
  }
}

/**
 * GET /api/team-insights/performance
 * Get performance stats for superhuman context builders (debug panel)
 */
function getPerformance(res: ServerResponse): void {
  try {
    const stats = getPerformanceStats();

    sendJSON(res, {
      ...stats,
      timestamp: Date.now(),
    });

    log.debug({ totalCalls: stats.totalCalls }, 'Performance stats fetched');
  } catch (error) {
    log.error({ error }, 'Failed to get performance stats');
    sendError(res, 'Failed to fetch performance stats', 500);
  }
}

/**
 * POST /api/team-insights/performance/clear
 * Clear performance logs and caches (debug panel)
 */
function clearPerformance(res: ServerResponse): void {
  try {
    clearPerformanceLog();
    clearAllSuperhumanCache();

    sendJSON(res, {
      success: true,
      clearedAt: Date.now(),
    });

    log.info('Performance logs and caches cleared');
  } catch (error) {
    log.error({ error }, 'Failed to clear performance data');
    sendError(res, 'Failed to clear performance data', 500);
  }
}

// ============================================================================
// ROUTE DISPATCHER
// ============================================================================

/**
 * Handle team insights routes
 * @returns true if the route was handled
 */
export async function handleTeamInsightsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl?: URL
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Get user ID (from headers or URL params)
  const dummyUrl = parsedUrl || new URL(`http://localhost${pathname}`);
  const userId = getUserId(req, dummyUrl);
  if (!userId) {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return true;
  }

  // Route matching
  try {
    // GET /api/team-insights
    if (pathname === '/api/team-insights' && method === 'GET') {
      await getTeamInsights(req, res, userId);
      return true;
    }

    // POST /api/team-insights/acknowledge/:id
    const acknowledgeMatch = pathname.match(/^\/api\/team-insights\/acknowledge\/([^/]+)$/);
    if (acknowledgeMatch && method === 'POST') {
      await acknowledgeInsight(req, res, userId, acknowledgeMatch[1]);
      return true;
    }

    // POST /api/team-insights/scan
    if (pathname === '/api/team-insights/scan' && method === 'POST') {
      await triggerInsightScan(req, res, userId);
      return true;
    }

    // GET /api/team-insights/performance (debug panel)
    if (pathname === '/api/team-insights/performance' && method === 'GET') {
      getPerformance(res);
      return true;
    }

    // POST /api/team-insights/performance/clear (debug panel)
    if (pathname === '/api/team-insights/performance/clear' && method === 'POST') {
      clearPerformance(res);
      return true;
    }

    return false; // Route not handled
  } catch (error) {
    log.error({ error, pathname, method }, 'Team insights route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

/**
 * Check if this is a team insights route
 */
export function isTeamInsightsRoute(pathname: string): boolean {
  return pathname.startsWith('/api/team-insights');
}
