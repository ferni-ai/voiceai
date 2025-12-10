/**
 * Admin Experiments API Routes (v1)
 *
 * Admin endpoints for managing web A/B experiments.
 *
 * Routes:
 *   GET  /api/v1/admin/experiments          - List all experiments
 *   GET  /api/v1/admin/experiments/:id      - Get experiment details
 *   POST /api/v1/admin/experiments          - Create experiment
 *   POST /api/v1/admin/experiments/:id/start   - Start experiment
 *   POST /api/v1/admin/experiments/:id/pause   - Pause experiment
 *   POST /api/v1/admin/experiments/:id/complete - Complete with winner
 *
 * @module AdminExperimentsAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import {
  analyzeExperiment,
  completeWebExperiment,
  createWebExperiment,
  getWebExperiment,
  getWebExperiments,
  pauseWebExperiment,
  startWebExperiment,
  type WebExperimentVariant,
} from '../../../services/experiments/web-experiments.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'AdminExperimentsAPI' });

const BASE_PATH = '/api/v1/admin/experiments';

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Extract experiment ID from pathname
 */
function getExperimentId(pathname: string): string | null {
  const match = pathname.match(/\/experiments\/([^\/]+)/);
  return match ? match[1] : null;
}

/**
 * Handle admin experiments API routes
 */
export async function handleAdminExperimentsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method?.toUpperCase();

  try {
    // GET /api/v1/admin/experiments - List all
    if (pathname === BASE_PATH && method === 'GET') {
      const experiments = await getWebExperiments();

      // Include analysis for running experiments
      const withAnalysis = await Promise.all(
        experiments.map(async (exp) => {
          if (exp.status === 'running') {
            const analysis = await analyzeExperiment(exp.id);
            return { ...exp, analysis };
          }
          return exp;
        })
      );

      sendJson(res, 200, {
        experiments: withAnalysis,
        summary: {
          total: experiments.length,
          running: experiments.filter((e) => e.status === 'running').length,
          completed: experiments.filter((e) => e.status === 'completed').length,
          draft: experiments.filter((e) => e.status === 'draft').length,
          paused: experiments.filter((e) => e.status === 'paused').length,
        },
      });
      return true;
    }

    // POST /api/v1/admin/experiments - Create new
    if (pathname === BASE_PATH && method === 'POST') {
      const body = (await parseBody(req)) as {
        name: string;
        description?: string;
        variants: WebExperimentVariant[];
        primaryGoal?: string;
        secondaryGoals?: string[];
        targetAudience?: unknown;
        minimumSamples?: number;
      };

      if (
        !body.name ||
        !body.variants ||
        !Array.isArray(body.variants) ||
        body.variants.length < 2
      ) {
        sendJson(res, 400, { error: 'name and at least 2 variants are required' });
        return true;
      }

      // Validate variant weights sum to 100
      const totalWeight = body.variants.reduce((sum, v) => sum + (v.weight || 0), 0);
      if (totalWeight !== 100) {
        sendJson(res, 400, { error: 'Variant weights must sum to 100', currentTotal: totalWeight });
        return true;
      }

      const experiment = await createWebExperiment({
        name: body.name,
        description: body.description,
        variants: body.variants,
        primaryGoal: body.primaryGoal || 'conversion',
        secondaryGoals: body.secondaryGoals,
        targetAudience: body.targetAudience as Parameters<
          typeof createWebExperiment
        >[0]['targetAudience'],
        minimumSamples: body.minimumSamples,
      });

      log.info(
        { experimentId: experiment.id, name: experiment.name },
        'Experiment created via admin API'
      );
      sendJson(res, 201, experiment);
      return true;
    }

    // Routes with experiment ID
    const experimentId = getExperimentId(pathname);
    if (!experimentId) {
      return false;
    }

    // GET /api/v1/admin/experiments/:id - Get one
    if (pathname === `${BASE_PATH}/${experimentId}` && method === 'GET') {
      const experiment = await getWebExperiment(experimentId);

      if (!experiment) {
        sendJson(res, 404, { error: 'Experiment not found' });
        return true;
      }

      const analysis = await analyzeExperiment(experimentId);
      sendJson(res, 200, { experiment, analysis });
      return true;
    }

    // POST /api/v1/admin/experiments/:id/start
    if (pathname === `${BASE_PATH}/${experimentId}/start` && method === 'POST') {
      const experiment = await getWebExperiment(experimentId);

      if (!experiment) {
        sendJson(res, 404, { error: 'Experiment not found' });
        return true;
      }

      if (experiment.status === 'running') {
        sendJson(res, 400, { error: 'Experiment is already running' });
        return true;
      }

      if (experiment.status === 'completed') {
        sendJson(res, 400, { error: 'Cannot start a completed experiment' });
        return true;
      }

      await startWebExperiment(experimentId);
      log.info({ experimentId }, 'Experiment started via admin API');
      sendJson(res, 200, { success: true, status: 'running' });
      return true;
    }

    // POST /api/v1/admin/experiments/:id/pause
    if (pathname === `${BASE_PATH}/${experimentId}/pause` && method === 'POST') {
      await pauseWebExperiment(experimentId);
      log.info({ experimentId }, 'Experiment paused via admin API');
      sendJson(res, 200, { success: true, status: 'paused' });
      return true;
    }

    // POST /api/v1/admin/experiments/:id/complete
    if (pathname === `${BASE_PATH}/${experimentId}/complete` && method === 'POST') {
      const body = (await parseBody(req)) as { winner: string; confidence?: number };

      if (!body.winner) {
        sendJson(res, 400, { error: 'winner is required' });
        return true;
      }

      await completeWebExperiment(experimentId, body.winner, body.confidence || 95);
      log.info({ experimentId, winner: body.winner }, 'Experiment completed via admin API');
      sendJson(res, 200, { success: true, status: 'completed', winner: body.winner });
      return true;
    }

    // GET /api/v1/admin/experiments/:id/analysis
    if (pathname === `${BASE_PATH}/${experimentId}/analysis` && method === 'GET') {
      const analysis = await analyzeExperiment(experimentId);

      if (!analysis) {
        sendJson(res, 404, { error: 'Experiment not found' });
        return true;
      }

      sendJson(res, 200, analysis);
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Error in experiments API');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default { handleAdminExperimentsRoutes };
