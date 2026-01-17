/**
 * Intelligent Routing API Routes
 *
 * Provides endpoints for:
 * - Dashboard data (metrics, top tools, trends)
 * - Alerts (health checks)
 * - A/B test results
 * - Manual traffic control
 *
 * @module servers/api/routes/intelligent-routing
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { UrlWithParsedQuery } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'intelligent-routing-api' });

/**
 * Handle intelligent routing API routes
 *
 * @returns true if the request was handled, false otherwise
 */
export async function handleIntelligentRoutingRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: UrlWithParsedQuery
): Promise<boolean> {
  const method = req.method || 'GET';

  // ============================================================================
  // GET /api/intelligent-routing/dashboard
  // ============================================================================
  if (pathname === '/api/intelligent-routing/dashboard' && method === 'GET') {
    try {
      const { getDashboardData } =
        await import('../../../tools/semantic-router/advanced/intelligent/observability.js');

      const dashboard = getDashboardData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboard));
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to get dashboard data');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get dashboard data' }));
      return true;
    }
  }

  // ============================================================================
  // GET /api/intelligent-routing/alerts
  // ============================================================================
  if (pathname === '/api/intelligent-routing/alerts' && method === 'GET') {
    try {
      const { checkAlerts } =
        await import('../../../tools/semantic-router/advanced/intelligent/observability.js');

      const alerts = checkAlerts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ alerts, count: alerts.length }));
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to check alerts');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to check alerts' }));
      return true;
    }
  }

  // ============================================================================
  // GET /api/intelligent-routing/strategy/:strategy
  // ============================================================================
  if (pathname.startsWith('/api/intelligent-routing/strategy/') && method === 'GET') {
    try {
      const { getStrategyMetrics } =
        await import('../../../tools/semantic-router/advanced/intelligent/observability.js');
      type RoutingStrategy =
        | 'intent-classifier'
        | 'semantic-router'
        | 'llm-fallback'
        | 'react-reasoning'
        | 'goal-planner'
        | 'bandit-optimizer';

      const strategy = pathname.replace(
        '/api/intelligent-routing/strategy/',
        ''
      ) as RoutingStrategy;
      const metrics = getStrategyMetrics(strategy);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metrics));
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to get strategy metrics');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get strategy metrics' }));
      return true;
    }
  }

  // ============================================================================
  // GET /api/intelligent-routing/ab-test/results
  // ============================================================================
  if (pathname === '/api/intelligent-routing/ab-test/results' && method === 'GET') {
    try {
      const { getExperimentDashboard } =
        await import('../../../tools/semantic-router/advanced/intelligent/ab-testing.js');

      const results = getExperimentDashboard();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to get A/B test results');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get A/B test results' }));
      return true;
    }
  }

  // ============================================================================
  // POST /api/intelligent-routing/ab-test/traffic
  // ============================================================================
  if (pathname === '/api/intelligent-routing/ab-test/traffic' && method === 'POST') {
    try {
      const body = await parseBody(req);
      const { percentage } = body as { percentage?: number };

      if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid percentage (0-100)' }));
        return true;
      }

      const { enableIntelligentRouting } =
        await import('../../../tools/semantic-router/advanced/intelligent/ab-testing.js');

      enableIntelligentRouting(percentage);

      log.info({ percentage }, 'Intelligent routing traffic updated');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, percentage }));
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to update traffic');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update traffic' }));
      return true;
    }
  }

  // ============================================================================
  // GET /api/intelligent-routing/status
  // ============================================================================
  if (pathname === '/api/intelligent-routing/status' && method === 'GET') {
    try {
      const { isIntelligentRouterInitialized, getIntelligentRoutingStats } =
        await import('../../../tools/semantic-router/integration/intelligent-router-integration.js');

      const { getExperimentDashboard } =
        await import('../../../tools/semantic-router/advanced/intelligent/ab-testing.js');

      const { experiments } = getExperimentDashboard();
      const experiment = experiments.find((e) => e.id === 'intelligent-vs-semantic');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          initialized: isIntelligentRouterInitialized(),
          stats: getIntelligentRoutingStats(),
          abTest: {
            active: experiment?.active || false,
            trafficAllocation: experiment?.trafficAllocation || [],
          },
        })
      );
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to get status');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get status' }));
      return true;
    }
  }

  // ============================================================================
  // POST /api/intelligent-routing/outcome
  // ============================================================================
  if (pathname === '/api/intelligent-routing/outcome' && method === 'POST') {
    try {
      const body = await parseBody(req);
      const { userId, toolId, success, reward } = body as {
        userId?: string;
        toolId?: string;
        success?: boolean;
        reward?: number;
      };

      if (!userId || !toolId || typeof success !== 'boolean') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: userId, toolId, success' }));
        return true;
      }

      const { recordIntelligentOutcome } =
        await import('../../../tools/semantic-router/integration/intelligent-router-integration.js');

      // Create a minimal decision object for recording
      // Using 'as const' to satisfy type constraints
      const mockDecision = {
        action: 'execute' as const,
        toolId,
        args: {},
        confidence: 1,
        decidedBy: 'intent-classifier' as const,
        reasoning: 'Manual outcome recording',
        timing: { total: 0 },
        rawResults: {},
        strategiesUsed: ['intent-classifier' as const],
        shouldExplain: false,
      };

      recordIntelligentOutcome(mockDecision, {
        success,
        reward: reward ?? (success ? 1 : 0),
      });

      log.info({ userId, toolId, success }, 'Outcome recorded manually');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return true;
    } catch (error) {
      log.error({ error }, 'Failed to record outcome');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to record outcome' }));
      return true;
    }
  }

  // Not handled
  return false;
}

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Keep the Express-style export for potential future use
export { handleIntelligentRoutingRoutes as registerIntelligentRoutingRoutes };
