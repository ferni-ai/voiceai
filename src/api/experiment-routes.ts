/**
 * Experiment API Routes
 *
 * REST API for managing A/B tests, bandits, and auto-rollouts.
 *
 * Endpoints:
 * - GET  /api/experiments - List all experiments
 * - GET  /api/experiments/summary - Get experiment summary
 * - GET  /api/experiments/:id - Get experiment details
 * - GET  /api/experiments/:id/health - Get experiment health
 * - POST /api/experiments - Create new experiment
 * - POST /api/experiments/:id/start - Start experiment
 * - POST /api/experiments/:id/pause - Pause experiment
 * - POST /api/experiments/:id/resume - Resume experiment
 * - POST /api/experiments/:id/complete - Complete experiment
 * - POST /api/experiments/:id/promote - Promote winner
 * - POST /api/experiments/:id/rollback - Force rollback
 * - DELETE /api/experiments/:id - Delete experiment
 *
 * @module api/experiment-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getExperimentManager,
  type ExperimentConfig,
  type ExperimentType,
} from '../tools/experiments/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAdmin } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'ExperimentAPI' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle experiment API routes
 */
export async function handleExperimentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/experiments')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require admin for experiment management
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  const manager = getExperimentManager();

  try {
    // GET /api/experiments - List all experiments
    if (pathname === '/api/experiments' && req.method === 'GET') {
      const experiments = manager.getAllExperiments();
      sendJSON(res, {
        experiments: experiments.map((e) => ({
          id: e.config.id,
          name: e.config.name,
          type: e.config.type,
          status: e.status,
          variants: e.config.variants.length,
          createdAt: e.createdAt,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          winner: e.winner,
        })),
        count: experiments.length,
      });
      return true;
    }

    // GET /api/experiments/summary - Get summary stats
    if (pathname === '/api/experiments/summary' && req.method === 'GET') {
      const summary = manager.getSummary();
      sendJSON(res, summary);
      return true;
    }

    // POST /api/experiments - Create new experiment
    if (pathname === '/api/experiments' && req.method === 'POST') {
      const body = await parseBody<CreateExperimentInput>(req);

      if (!body.id || !body.name || !body.type || !body.variants) {
        sendError(res, 'Missing required fields: id, name, type, variants', 400);
        return true;
      }

      if (!['ab', 'bandit', 'rollout'].includes(body.type)) {
        sendError(res, "Invalid type. Must be 'ab', 'bandit', or 'rollout'", 400);
        return true;
      }

      if (body.variants.length < 2) {
        sendError(res, 'At least 2 variants required', 400);
        return true;
      }

      const config: ExperimentConfig = {
        id: body.id,
        name: body.name,
        description: body.description,
        type: body.type as ExperimentType,
        variants: body.variants.map((v) => ({
          id: v.id,
          name: v.name,
          trafficPercent: v.trafficPercent,
          config: v.config,
        })),
        primaryMetric: body.primaryMetric || 'success_rate',
        secondaryMetrics: body.secondaryMetrics,
        autoEscalate: body.autoEscalate ?? true,
        autoPromote: body.autoPromote ?? false,
        autoRollback: body.autoRollback ?? true,
        schedule: body.schedule
          ? {
              startAt: body.schedule.startAt ? new Date(body.schedule.startAt) : undefined,
              endAt: body.schedule.endAt ? new Date(body.schedule.endAt) : undefined,
            }
          : undefined,
        abConfig: body.abConfig,
        banditConfig: body.banditConfig,
        rolloutConfig: body.rolloutConfig,
        sequentialConfig: body.sequentialConfig,
      };

      const experiment = manager.createExperiment(config);

      log.info(
        { experimentId: config.id, type: config.type, admin: auth.userId },
        'Experiment created via API'
      );

      sendJSON(res, { experiment }, 201);
      return true;
    }

    // Parse experiment ID from path
    const idMatch = pathname.match(/^\/api\/experiments\/([^/]+)(\/.*)?$/);
    if (!idMatch) {
      sendError(res, 'Not found', 404);
      return true;
    }

    const experimentId = idMatch[1];
    const action = idMatch[2] || '';

    // GET /api/experiments/:id - Get experiment details
    if (!action && req.method === 'GET') {
      const experiment = manager.getExperiment(experimentId);
      if (!experiment) {
        sendError(res, 'Experiment not found', 404);
        return true;
      }

      sendJSON(res, {
        experiment: {
          ...experiment,
          config: experiment.config,
        },
      });
      return true;
    }

    // GET /api/experiments/:id/health - Get experiment health
    if (action === '/health' && req.method === 'GET') {
      try {
        const health = manager.getExperimentHealth(experimentId);
        sendJSON(res, { health });
      } catch (error) {
        sendError(res, 'Experiment not found', 404);
      }
      return true;
    }

    // POST /api/experiments/:id/start - Start experiment
    if (action === '/start' && req.method === 'POST') {
      try {
        manager.startExperiment(experimentId);
        log.info({ experimentId, admin: auth.userId }, 'Experiment started via API');
        sendJSON(res, { success: true, message: 'Experiment started' });
      } catch (error) {
        sendError(res, String(error), 400);
      }
      return true;
    }

    // POST /api/experiments/:id/pause - Pause experiment
    if (action === '/pause' && req.method === 'POST') {
      const body = await parseBody<{ reason?: string }>(req);
      try {
        manager.pauseExperiment(experimentId, body.reason || 'Paused via API');
        log.info(
          { experimentId, reason: body.reason, admin: auth.userId },
          'Experiment paused via API'
        );
        sendJSON(res, { success: true, message: 'Experiment paused' });
      } catch (error) {
        sendError(res, String(error), 400);
      }
      return true;
    }

    // POST /api/experiments/:id/resume - Resume experiment
    if (action === '/resume' && req.method === 'POST') {
      try {
        manager.resumeExperiment(experimentId);
        log.info({ experimentId, admin: auth.userId }, 'Experiment resumed via API');
        sendJSON(res, { success: true, message: 'Experiment resumed' });
      } catch (error) {
        sendError(res, String(error), 400);
      }
      return true;
    }

    // POST /api/experiments/:id/complete - Complete experiment
    if (action === '/complete' && req.method === 'POST') {
      const body = await parseBody<{ winner?: string }>(req);
      try {
        manager.completeExperiment(experimentId, body.winner);
        log.info(
          { experimentId, winner: body.winner, admin: auth.userId },
          'Experiment completed via API'
        );
        sendJSON(res, { success: true, message: 'Experiment completed' });
      } catch (error) {
        sendError(res, String(error), 400);
      }
      return true;
    }

    // POST /api/experiments/:id/promote - Check and promote winner
    if (action === '/promote' && req.method === 'POST') {
      const promotion = manager.checkPromotion(experimentId);
      if (promotion.shouldPromote && promotion.winner) {
        manager.completeExperiment(experimentId, promotion.winner);
        log.info(
          { experimentId, winner: promotion.winner, admin: auth.userId },
          'Experiment winner promoted via API'
        );
        sendJSON(res, {
          success: true,
          message: `Winner promoted: ${promotion.winner}`,
          promotion,
        });
      } else {
        sendJSON(res, {
          success: false,
          message: 'Not ready to promote',
          promotion,
        });
      }
      return true;
    }

    // POST /api/experiments/:id/rollback - Force rollback
    if (action === '/rollback' && req.method === 'POST') {
      const body = await parseBody<{ reason?: string }>(req);
      const experiment = manager.getExperiment(experimentId);
      if (!experiment) {
        sendError(res, 'Experiment not found', 404);
        return true;
      }

      // Check rollback status
      const rollback = manager.checkRollback(experimentId);
      log.warn(
        { experimentId, reason: body.reason || rollback.reason, admin: auth.userId },
        'Experiment rollback triggered via API'
      );

      // Pause the experiment with rollback reason
      manager.pauseExperiment(
        experimentId,
        body.reason || rollback.reason || 'Rolled back via API'
      );

      sendJSON(res, {
        success: true,
        message: 'Experiment rolled back',
        rollback,
      });
      return true;
    }

    // DELETE /api/experiments/:id - Delete experiment
    if (!action && req.method === 'DELETE') {
      manager.deleteExperiment(experimentId);
      log.info({ experimentId, admin: auth.userId }, 'Experiment deleted via API');
      sendJSON(res, { success: true, message: 'Experiment deleted' });
      return true;
    }

    sendError(res, 'Not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err), pathname }, 'Experiment API error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

// ============================================================================
// INPUT TYPES
// ============================================================================

interface CreateExperimentInput {
  id: string;
  name: string;
  description?: string;
  type: string;
  variants: Array<{
    id: string;
    name: string;
    trafficPercent?: number;
    config?: Record<string, unknown>;
  }>;
  primaryMetric?: string;
  secondaryMetrics?: string[];
  autoEscalate?: boolean;
  autoPromote?: boolean;
  autoRollback?: boolean;
  schedule?: {
    startAt?: string;
    endAt?: string;
  };
  abConfig?: {
    minSampleSize: number;
  };
  banditConfig?: {
    explorationFactor?: number;
    minExploration?: number;
    updateBatchSize?: number;
    priorStrength?: number;
  };
  rolloutConfig?: {
    stages?: Array<{
      percentage: number;
      minDurationMs: number;
      minSamples: number;
    }>;
    minConfidence?: number;
    checkIntervalMs?: number;
  };
  sequentialConfig?: {
    alpha?: number;
    beta?: number;
    minEffect?: number;
    maxSamples?: number;
  };
}
