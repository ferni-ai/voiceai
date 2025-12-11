/**
 * Optimizer Routes
 *
 * API endpoints for the AI Experiment Orchestrator.
 * Provides admin dashboard access to:
 * - Optimization status and history
 * - Manual winner shipping
 * - Bandit configuration
 * - Hypothesis management
 *
 * @module api/optimizer-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getOptimizerStatus,
  getRecentAlerts,
  runOptimizationLoop,
  type AutoOptimizerConfig,
} from '../services/experiments/auto-optimizer.js';
import {
  getHypotheses,
  runAnalysis,
  updateHypothesisStatus,
  type GeneratedHypothesis,
} from '../services/experiments/hypothesis-generator.js';
import {
  calculateRegret,
  disableBandit,
  enableBandit,
  getBanditConfig,
  updateBanditConfig,
} from '../services/experiments/thompson-sampler.js';
import {
  getCurrentDefault,
  getExperimentDefinitions,
  getVariantsForFrontend,
  setCurrentDefault,
} from '../services/experiments/variant-library.js';
import {
  analyzeExperiment,
  completeWebExperiment,
  createWebExperiment,
  getWebExperiment,
  getWebExperiments,
  pauseWebExperiment,
  startWebExperiment,
} from '../services/experiments/web-experiments.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { parseRequestBody, sendError, sendJsonResponse } from './helpers.js';

const log = createLogger({ module: 'OptimizerRoutes' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle optimizer API requests
 */
export async function handleOptimizerRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // All optimizer routes require auth
  const authResult = await requireAuth(req, res);
  if (!authResult) return true; // Response already sent

  const method = req.method || 'GET';

  try {
    // GET /api/optimizer/status
    if (pathname === '/api/optimizer/status' && method === 'GET') {
      const status = getOptimizerStatus();
      sendJsonResponse(res, 200, status);
      return true;
    }

    // POST /api/optimizer/run
    if (pathname === '/api/optimizer/run' && method === 'POST') {
      const body = await parseRequestBody<Partial<AutoOptimizerConfig>>(req);
      const results = await runOptimizationLoop(body);
      sendJsonResponse(res, 200, {
        success: true,
        results,
        message: `Optimized ${results.length} experiments`,
      });
      return true;
    }

    // GET /api/optimizer/alerts
    if (pathname === '/api/optimizer/alerts' && method === 'GET') {
      const alerts = getRecentAlerts(50);
      sendJsonResponse(res, 200, { alerts });
      return true;
    }

    // GET /api/optimizer/experiments
    if (pathname === '/api/optimizer/experiments' && method === 'GET') {
      const experiments = await getWebExperiments();
      const running = experiments.filter((e) => e.status === 'running');
      const completed = experiments.filter((e) => e.status === 'completed');
      const paused = experiments.filter((e) => e.status === 'paused');
      const draft = experiments.filter((e) => e.status === 'draft');

      sendJsonResponse(res, 200, {
        total: experiments.length,
        running,
        completed,
        paused,
        draft,
      });
      return true;
    }

    // GET /api/optimizer/experiments/:id
    const experimentMatch = pathname.match(/^\/api\/optimizer\/experiments\/([^/]+)$/);
    if (experimentMatch && method === 'GET') {
      const experimentId = experimentMatch[1];
      const experiment = await getWebExperiment(experimentId);
      if (!experiment) {
        sendError(res, 'Experiment not found', 404);
        return true;
      }

      const analysis = await analyzeExperiment(experimentId);
      sendJsonResponse(res, 200, { experiment, analysis });
      return true;
    }

    // POST /api/optimizer/experiments/:id/ship
    const shipMatch = pathname.match(/^\/api\/optimizer\/experiments\/([^/]+)\/ship$/);
    if (shipMatch && method === 'POST') {
      const experimentId = shipMatch[1];
      const body = await parseRequestBody<{ winnerId: string; confidence: number }>(req);

      if (!body.winnerId) {
        sendError(res, 'winnerId is required', 400);
        return true;
      }

      await completeWebExperiment(experimentId, body.winnerId, body.confidence || 95);
      await setCurrentDefault(experimentId, body.winnerId);

      sendJsonResponse(res, 200, {
        success: true,
        message: `Winner ${body.winnerId} shipped for ${experimentId}`,
      });
      return true;
    }

    // POST /api/optimizer/experiments/:id/start
    const startMatch = pathname.match(/^\/api\/optimizer\/experiments\/([^/]+)\/start$/);
    if (startMatch && method === 'POST') {
      const experimentId = startMatch[1];
      await startWebExperiment(experimentId);
      sendJsonResponse(res, 200, { success: true, message: 'Experiment started' });
      return true;
    }

    // POST /api/optimizer/experiments/:id/pause
    const pauseMatch = pathname.match(/^\/api\/optimizer\/experiments\/([^/]+)\/pause$/);
    if (pauseMatch && method === 'POST') {
      const experimentId = pauseMatch[1];
      await pauseWebExperiment(experimentId);
      sendJsonResponse(res, 200, { success: true, message: 'Experiment paused' });
      return true;
    }

    // POST /api/optimizer/experiments
    if (pathname === '/api/optimizer/experiments' && method === 'POST') {
      const body = await parseRequestBody<{
        name: string;
        description?: string;
        variants: Array<{ id: string; name: string; weight: number }>;
        primaryGoal: string;
        minimumSamples?: number;
      }>(req);

      if (!body.name || !body.variants || !body.primaryGoal) {
        sendError(res, 'name, variants, and primaryGoal are required', 400);
        return true;
      }

      const experiment = await createWebExperiment(body);
      sendJsonResponse(res, 201, { success: true, experiment });
      return true;
    }

    // GET /api/optimizer/bandit/:id
    const banditGetMatch = pathname.match(/^\/api\/optimizer\/bandit\/([^/]+)$/);
    if (banditGetMatch && method === 'GET') {
      const experimentId = banditGetMatch[1];
      const config = await getBanditConfig(experimentId);
      const metrics = await calculateRegret(experimentId);
      sendJsonResponse(res, 200, { config, metrics });
      return true;
    }

    // POST /api/optimizer/bandit/:id
    const banditPostMatch = pathname.match(/^\/api\/optimizer\/bandit\/([^/]+)$/);
    if (banditPostMatch && method === 'POST') {
      const experimentId = banditPostMatch[1];
      const body = await parseRequestBody<{
        enabled?: boolean;
        explorationWeight?: number;
        minimumExploration?: number;
        warmupSamples?: number;
      }>(req);

      if (body.enabled === true) {
        await enableBandit(experimentId, body);
      } else if (body.enabled === false) {
        await disableBandit(experimentId);
      } else {
        await updateBanditConfig(experimentId, body);
      }

      const config = await getBanditConfig(experimentId);
      sendJsonResponse(res, 200, { success: true, config });
      return true;
    }

    // GET /api/optimizer/hypotheses
    if (pathname === '/api/optimizer/hypotheses' && method === 'GET') {
      const hypotheses = await getHypotheses();
      sendJsonResponse(res, 200, { hypotheses });
      return true;
    }

    // POST /api/optimizer/hypotheses/generate
    if (pathname === '/api/optimizer/hypotheses/generate' && method === 'POST') {
      const result = await runAnalysis();
      sendJsonResponse(res, 200, {
        success: true,
        patterns: result.patterns,
        hypotheses: result.hypotheses,
        experimentsAnalyzed: result.experimentsAnalyzed,
      });
      return true;
    }

    // POST /api/optimizer/hypotheses/:id/status
    const hypothesisMatch = pathname.match(/^\/api\/optimizer\/hypotheses\/([^/]+)\/status$/);
    if (hypothesisMatch && method === 'POST') {
      const hypothesisId = hypothesisMatch[1];
      const body = await parseRequestBody<{ status: GeneratedHypothesis['status'] }>(req);

      if (!body.status) {
        sendError(res, 'status is required', 400);
        return true;
      }

      await updateHypothesisStatus(hypothesisId, body.status);
      sendJsonResponse(res, 200, { success: true, hypothesisId, status: body.status });
      return true;
    }

    // GET /api/optimizer/variants
    if (pathname === '/api/optimizer/variants' && method === 'GET') {
      const variants = getVariantsForFrontend();
      const definitions = getExperimentDefinitions();
      sendJsonResponse(res, 200, { variants, definitions });
      return true;
    }

    // GET /api/optimizer/variants/:experimentId/default
    const defaultGetMatch = pathname.match(/^\/api\/optimizer\/variants\/([^/]+)\/default$/);
    if (defaultGetMatch && method === 'GET') {
      const experimentId = defaultGetMatch[1];
      const defaultVariant = await getCurrentDefault(experimentId);
      sendJsonResponse(res, 200, { experimentId, default: defaultVariant });
      return true;
    }

    // POST /api/optimizer/variants/:experimentId/default
    const defaultPostMatch = pathname.match(/^\/api\/optimizer\/variants\/([^/]+)\/default$/);
    if (defaultPostMatch && method === 'POST') {
      const experimentId = defaultPostMatch[1];
      const body = await parseRequestBody<{ variantId: string }>(req);

      if (!body.variantId) {
        sendError(res, 'variantId is required', 400);
        return true;
      }

      await setCurrentDefault(experimentId, body.variantId);
      sendJsonResponse(res, 200, {
        success: true,
        experimentId,
        default: body.variantId,
      });
      return true;
    }

    // Route not handled
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Optimizer route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { handleOptimizerRoutes };
