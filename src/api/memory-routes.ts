/**
 * Memory API Routes
 *
 * Endpoints for the Superhuman Memory system:
 * - Memory feedback (learning engine)
 * - Memory metrics (observability)
 * - Memory health check
 *
 * @module api/memory-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';

import { getUnifiedMemoryService } from '../services/unified-memory-service.js';
import { createLogger } from '../utils/safe-logger.js';
import { optionalAuth, requireAuth } from './auth-middleware.js';
import {
  handleCorsPreflightIfNeeded,
  parseBody,
  sendError,
  sendJSON,
  sendJSONCached,
} from './helpers.js';

const log = createLogger({ module: 'MemoryRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface MemoryFeedbackInput {
  memoryId: string;
  userId: string;
  action: 'helpful' | 'not_helpful' | 'dismiss';
  sessionId?: string;
  personaId?: string;
  timestamp?: string;
}

interface MemoryMetricsResponse {
  learningMetrics: {
    totalFeedbackEvents: number;
    helpfulCount: number;
    notHelpfulCount: number;
    helpfulRate: number;
  };
  surfacingMetrics: {
    totalSurfaced: number;
    avgConfidence: number;
    timingBreakdown: {
      immediate: number;
      nextPause: number;
      sessionEnd: number;
    };
  };
  graphMetrics: {
    totalLinks: number;
    linksByType: Record<string, number>;
    avgLinksPerMemory: number;
  };
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastUpdated: string;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/memory/* routes
  if (!pathname.startsWith('/api/memory')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  try {
    // POST /api/memory/feedback - Submit memory feedback
    if (pathname === '/api/memory/feedback' && req.method === 'POST') {
      return await handleFeedback(req, res);
    }

    // GET /api/memory/metrics - Get memory system metrics
    if (pathname === '/api/memory/metrics' && req.method === 'GET') {
      return await handleMetrics(req, res);
    }

    // GET /api/memory/metrics/:userId - Get user-specific metrics
    if (pathname.startsWith('/api/memory/metrics/') && req.method === 'GET') {
      const userId = pathname.split('/')[4];
      if (userId) {
        return await handleUserMetrics(req, res, userId);
      }
    }

    // GET /api/memory/health - Health check
    if (pathname === '/api/memory/health' && req.method === 'GET') {
      return await handleHealthCheck(req, res);
    }

    // POST /api/memory/maintenance - Trigger maintenance for a user
    if (pathname === '/api/memory/maintenance' && req.method === 'POST') {
      return await handleMaintenanceTrigger(req, res);
    }

    // Unknown route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Memory route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * POST /api/memory/feedback
 * Records user feedback on a surfaced memory
 */
async function handleFeedback(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Optional auth - we accept feedback from authenticated users (sync check)
  const auth = optionalAuth(req);

  const body = await parseBody<MemoryFeedbackInput>(req);

  if (!body || !body.memoryId || !body.action) {
    sendError(res, 'Missing required fields: memoryId, action', 400);
    return true;
  }

  // Use auth userId if available, otherwise use body userId
  const userId = auth?.userId || body.userId;
  if (!userId) {
    sendError(res, 'User ID required', 400);
    return true;
  }

  try {
    const unifiedMemory = getUnifiedMemoryService();

    // Record feedback in the learning engine
    // Note: timestamp is added internally by the service
    unifiedMemory.recordFeedback({
      memoryId: body.memoryId,
      userId,
      action:
        body.action === 'helpful'
          ? 'surfaced'
          : body.action === 'not_helpful'
            ? 'dismissed'
            : 'ignored',
      context: {
        emotionalState: undefined,
        conversationPhase: undefined,
        personaId: body.personaId,
      },
    });

    // If feedback was positive, reinforce the memory
    if (body.action === 'helpful') {
      await unifiedMemory.reinforceMemory(userId, body.memoryId, 1.2);
    }

    log.debug(
      { userId, memoryId: body.memoryId, action: body.action },
      'Memory feedback recorded'
    );

    sendJSON(res, { success: true });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, memoryId: body.memoryId }, 'Feedback recording failed');
    sendError(res, 'Failed to record feedback', 500);
    return true;
  }
}

/**
 * GET /api/memory/metrics
 * Returns overall memory system metrics
 */
async function handleMetrics(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Require auth for metrics
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  try {
    // For now, return mock metrics structure
    // TODO: Implement actual metrics collection from learning engine
    const metrics: MemoryMetricsResponse = {
      learningMetrics: {
        totalFeedbackEvents: 0,
        helpfulCount: 0,
        notHelpfulCount: 0,
        helpfulRate: 0,
      },
      surfacingMetrics: {
        totalSurfaced: 0,
        avgConfidence: 0,
        timingBreakdown: {
          immediate: 0,
          nextPause: 0,
          sessionEnd: 0,
        },
      },
      graphMetrics: {
        totalLinks: 0,
        linksByType: {},
        avgLinksPerMemory: 0,
      },
      healthStatus: 'healthy',
      lastUpdated: new Date().toISOString(),
    };

    // Cache for 5 minutes
    sendJSONCached(res, metrics, 300);
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get memory metrics');
    sendError(res, 'Failed to get metrics', 500);
    return true;
  }
}

/**
 * GET /api/memory/metrics/:userId
 * Returns user-specific memory metrics
 */
async function handleUserMetrics(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  // Require auth and verify user access
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  // Only allow access to own metrics (or admin)
  if (auth.userId !== userId && !auth.isAdmin) {
    sendError(res, 'Forbidden', 403);
    return true;
  }

  try {
    const unifiedMemory = getUnifiedMemoryService();
    const health = await unifiedMemory.getHealth(userId);

    const userMetrics = {
      userId,
      memoryCount: health.totalMemories,
      recentMemoryCount: health.recentMemories,
      strongMemoryCount: health.strongMemories,
      emotionalMemoryCount: health.emotionalMemories,
      commitmentCount: health.commitments,
      timestamp: new Date().toISOString(),
    };

    sendJSON(res, userMetrics);
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user memory metrics');
    sendError(res, 'Failed to get user metrics', 500);
    return true;
  }
}

/**
 * GET /api/memory/health
 * Quick health check for the memory system
 */
async function handleHealthCheck(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    const unifiedMemory = getUnifiedMemoryService();

    // Basic health check - ensure service is running
    const isHealthy = unifiedMemory !== null;

    sendJSON(res, {
      status: isHealthy ? 'healthy' : 'unhealthy',
      components: {
        unifiedMemoryService: isHealthy ? 'up' : 'down',
        learningEngine: 'up',
        memoryGraph: 'up',
        spreadingActivation: 'up',
      },
      timestamp: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Memory health check failed');
    sendJSON(res, {
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
    return true;
  }
}

/**
 * POST /api/memory/maintenance
 * Triggers memory maintenance for a user (admin only)
 */
async function handleMaintenanceTrigger(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Require admin auth
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  if (!auth.isAdmin) {
    sendError(res, 'Admin access required', 403);
    return true;
  }

  const body = await parseBody<{ userId: string }>(req);
  if (!body || !body.userId) {
    sendError(res, 'User ID required', 400);
    return true;
  }

  try {
    const unifiedMemory = getUnifiedMemoryService();
    const result = await unifiedMemory.runMaintenance(body.userId);

    log.info({ userId: body.userId, result }, 'Memory maintenance triggered');

    sendJSON(res, {
      success: true,
      userId: body.userId,
      result,
    });
    return true;
  } catch (error) {
    log.error({ error: String(error), userId: body.userId }, 'Memory maintenance failed');
    sendError(res, 'Maintenance failed', 500);
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleMemoryRoutes,
};
