/**
 * Superhuman Experiments API Routes (v1)
 *
 * Public endpoints for the "Better than Human" A/B testing system.
 * Features Thompson Sampling, contextual personalization, and auto-graduation.
 *
 * Routes:
 *   GET  /api/v1/public/superhuman/experiments                    - List active experiments
 *   GET  /api/v1/public/superhuman/experiments/:id                - Get experiment details
 *   GET  /api/v1/public/superhuman/experiments/:id/stats          - Get experiment statistics
 *   POST /api/v1/public/superhuman/experiments/:id/enroll         - Enroll user and get variant
 *   POST /api/v1/public/superhuman/experiments/:id/convert        - Record conversion
 *   POST /api/v1/public/superhuman/experiments/route              - Semantic routing
 *
 * Admin Routes (require auth):
 *   POST /api/v1/public/superhuman/experiments                    - Create experiment
 *   PATCH /api/v1/public/superhuman/experiments/:id               - Update experiment
 *   POST /api/v1/public/superhuman/experiments/:id/graduate       - Graduate winner
 *   POST /api/v1/public/superhuman/experiments/:id/pause          - Pause experiment
 *   POST /api/v1/public/superhuman/experiments/:id/resume         - Resume experiment
 *
 * @module SuperhumanExperimentsAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import {
  createExperiment,
  getExperiment,
  listExperiments,
  enrollUser,
  recordUserConversion,
  getExperimentStats,
  graduateExperiment,
  pauseExperiment,
  resumeExperiment,
  updateExperimentMetadata,
  findExperimentsByTags,
  findExperimentsByIntent,
  createSimpleABTest,
  createMultiVariantTest,
  type ExperimentSettings,
} from '../../../services/experiments/superhuman-experiments.js';
import {
  extractContextFromRequest,
  type UserContext,
} from '../../../services/experiments/contextual-selector.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { parseBody } from '../../helpers.js';
import { requireAuth, optionalAuth } from '../../auth-middleware.js';

const log = createLogger({ module: 'SuperhumanExperimentsAPI' });

const BASE_PATH = '/api/v1/public/superhuman/experiments';

/**
 * Send JSON response with CORS headers
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

/**
 * Extract user context from request for contextual experiments
 */
function extractContext(req: IncomingMessage, parsedUrl: URL): UserContext {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = Array.isArray(value) ? value[0] : value;
  }

  const query: Record<string, string | undefined> = {};
  for (const [key, value] of parsedUrl.searchParams.entries()) {
    query[key] = value;
  }

  return extractContextFromRequest(headers, query);
}

/**
 * Handle superhuman experiments API routes
 */
export async function handleSuperhumanExperimentsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method?.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }

  try {
    // ============================================================
    // PUBLIC ROUTES (no auth required)
    // ============================================================

    // GET /api/v1/public/superhuman/experiments - List active experiments
    if (pathname === BASE_PATH && method === 'GET') {
      const status = parsedUrl.searchParams.get('status') as
        | 'running'
        | 'paused'
        | 'graduated'
        | 'stopped'
        | null;
      const experiments = await listExperiments(status || 'running');

      sendJson(res, 200, {
        experiments: experiments.map((exp) => ({
          id: exp.id,
          name: exp.name,
          description: exp.description,
          status: exp.metadata.status,
          variantCount: exp.variants.length,
          totalEnrollments: exp.banditState.totalPulls,
        })),
        count: experiments.length,
      });
      return true;
    }

    // GET /api/v1/public/superhuman/experiments/:id - Get experiment details
    const detailMatch = pathname.match(/\/superhuman\/experiments\/([^\/]+)$/);
    if (detailMatch && method === 'GET') {
      const experimentId = detailMatch[1];
      const experiment = await getExperiment(experimentId);

      if (!experiment) {
        sendJson(res, 404, { error: 'Experiment not found' });
        return true;
      }

      sendJson(res, 200, {
        id: experiment.id,
        name: experiment.name,
        description: experiment.description,
        status: experiment.metadata.status,
        variants: experiment.variants.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description,
        })),
        settings: {
          algorithm: experiment.settings.algorithm,
          enableContextual: experiment.settings.enableContextual,
          autoGraduate: experiment.settings.autoGraduate,
        },
        createdAt: experiment.createdAt,
      });
      return true;
    }

    // GET /api/v1/public/superhuman/experiments/:id/stats - Get statistics
    const statsMatch = pathname.match(/\/superhuman\/experiments\/([^\/]+)\/stats$/);
    if (statsMatch && method === 'GET') {
      const experimentId = statsMatch[1];
      const stats = await getExperimentStats(experimentId);

      if (!stats) {
        sendJson(res, 404, { error: 'Experiment not found' });
        return true;
      }

      sendJson(res, 200, stats);
      return true;
    }

    // POST /api/v1/public/superhuman/experiments/:id/enroll - Enroll user
    const enrollMatch = pathname.match(/\/superhuman\/experiments\/([^\/]+)\/enroll$/);
    if (enrollMatch && method === 'POST') {
      const experimentId = enrollMatch[1];
      const body = (await parseBody(req)) as {
        userId: string;
        context?: Partial<UserContext>;
      };

      if (!body.userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return true;
      }

      // Merge request context with provided context
      const requestContext = extractContext(req, parsedUrl);
      const context: UserContext = { ...requestContext, ...body.context };

      const enrollment = await enrollUser(experimentId, body.userId, context);

      if (!enrollment) {
        sendJson(res, 200, {
          experimentId,
          enrolled: false,
          reason: 'Not eligible or experiment not found',
        });
        return true;
      }

      sendJson(res, 200, {
        experimentId: enrollment.experimentId,
        enrolled: true,
        variantId: enrollment.variantId,
        variant: {
          id: enrollment.variant.id,
          name: enrollment.variant.name,
          config: enrollment.variant.config,
        },
        isNew: enrollment.isNew,
        source: enrollment.source,
        confidence:
          'confidence' in enrollment.selection ? enrollment.selection.confidence : undefined,
      });
      return true;
    }

    // POST /api/v1/public/superhuman/experiments/:id/convert - Record conversion
    const convertMatch = pathname.match(/\/superhuman\/experiments\/([^\/]+)\/convert$/);
    if (convertMatch && method === 'POST') {
      const experimentId = convertMatch[1];
      const body = (await parseBody(req)) as {
        userId: string;
        success: boolean;
      };

      if (!body.userId || body.success === undefined) {
        sendJson(res, 400, { error: 'userId and success are required' });
        return true;
      }

      const result = await recordUserConversion(experimentId, body.userId, body.success);

      if (!result) {
        sendJson(res, 404, { error: 'Enrollment not found' });
        return true;
      }

      sendJson(res, 200, {
        experimentId: result.experimentId,
        variantId: result.variantId,
        success: result.success,
        winnerDetected: result.winnerCheck?.hasWinner || false,
        graduated: result.graduated || false,
        recommendation: result.winnerCheck?.recommendation,
      });
      return true;
    }

    // POST /api/v1/public/superhuman/experiments/route - Semantic routing
    if (pathname === `${BASE_PATH}/route` && method === 'POST') {
      const body = (await parseBody(req)) as {
        tags?: string[];
        intent?: string;
        userId?: string;
        context?: Partial<UserContext>;
      };

      const requestContext = extractContext(req, parsedUrl);
      const context = {
        ...requestContext,
        ...body.context,
        userId: body.userId,
      };

      let result;
      if (body.intent) {
        result = await findExperimentsByIntent(body.intent, context);
      } else if (body.tags && body.tags.length > 0) {
        result = await findExperimentsByTags(body.tags, context);
      } else {
        sendJson(res, 400, { error: 'Either tags or intent is required' });
        return true;
      }

      sendJson(res, 200, {
        selectedExperiments: result.selectedExperiments.map((exp) => ({
          experimentId: exp.experimentId,
          score: exp.score,
          matchedTags: exp.matchedTags,
          matchedIntents: exp.matchedIntents,
        })),
        excludedCount: result.excludedExperiments.length,
        totalCandidates: result.totalCandidates,
      });
      return true;
    }

    // ============================================================
    // ADMIN ROUTES (require auth)
    // ============================================================

    // POST /api/v1/public/superhuman/experiments - Create experiment
    if (pathname === BASE_PATH && method === 'POST') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      const body = (await parseBody(req)) as {
        id: string;
        name: string;
        description?: string;
        type?: 'simple' | 'multi';
        variantA?: { name: string; config: Record<string, unknown> };
        variantB?: { name: string; config: Record<string, unknown> };
        variants?: Array<{ id: string; name: string; config: Record<string, unknown> }>;
        tags?: string[];
        settings?: Partial<ExperimentSettings>;
      };

      if (!body.id || !body.name) {
        sendJson(res, 400, { error: 'id and name are required' });
        return true;
      }

      let experiment;
      if (body.type === 'simple' && body.variantA && body.variantB) {
        experiment = await createSimpleABTest(
          body.id,
          body.name,
          body.variantA,
          body.variantB,
          body.tags
        );
      } else if (body.variants && body.variants.length >= 2) {
        experiment = await createMultiVariantTest(body.id, body.name, body.variants, body.settings);
      } else {
        sendJson(res, 400, {
          error:
            'Either provide variantA/variantB for simple test, or variants array for multi-variant',
        });
        return true;
      }

      log.info({ experimentId: experiment.id, creator: auth.userId }, 'Experiment created via API');

      sendJson(res, 201, {
        id: experiment.id,
        name: experiment.name,
        variantCount: experiment.variants.length,
        status: experiment.metadata.status,
      });
      return true;
    }

    // PATCH /api/v1/public/superhuman/experiments/:id - Update experiment
    const updateMatch = pathname.match(/\/superhuman\/experiments\/([^\/]+)$/);
    if (updateMatch && method === 'PATCH') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      const experimentId = updateMatch[1];
      const body = (await parseBody(req)) as {
        status?: 'running' | 'paused' | 'stopped';
        tags?: string[];
        priority?: number;
      };

      await updateExperimentMetadata(experimentId, body);

      log.info(
        { experimentId, updates: Object.keys(body), updater: auth.userId },
        'Experiment updated'
      );

      sendJson(res, 200, { success: true, experimentId });
      return true;
    }

    // POST /api/v1/public/superhuman/experiments/:id/graduate - Graduate winner
    const graduateMatch = pathname.match(/\/superhuman\/experiments\/([^\/]+)\/graduate$/);
    if (graduateMatch && method === 'POST') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      const experimentId = graduateMatch[1];
      const body = (await parseBody(req)) as { winnerId: string };

      if (!body.winnerId) {
        sendJson(res, 400, { error: 'winnerId is required' });
        return true;
      }

      await graduateExperiment(experimentId, body.winnerId);

      log.info(
        { experimentId, winnerId: body.winnerId, graduator: auth.userId },
        'Experiment graduated'
      );

      sendJson(res, 200, { success: true, experimentId, winnerId: body.winnerId });
      return true;
    }

    // POST /api/v1/public/superhuman/experiments/:id/pause - Pause experiment
    const pauseMatch = pathname.match(/\/superhuman\/experiments\/([^\/]+)\/pause$/);
    if (pauseMatch && method === 'POST') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      const experimentId = pauseMatch[1];
      await pauseExperiment(experimentId);

      log.info({ experimentId, pauser: auth.userId }, 'Experiment paused');

      sendJson(res, 200, { success: true, experimentId, status: 'paused' });
      return true;
    }

    // POST /api/v1/public/superhuman/experiments/:id/resume - Resume experiment
    const resumeMatch = pathname.match(/\/superhuman\/experiments\/([^\/]+)\/resume$/);
    if (resumeMatch && method === 'POST') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;

      const experimentId = resumeMatch[1];
      await resumeExperiment(experimentId);

      log.info({ experimentId, resumer: auth.userId }, 'Experiment resumed');

      sendJson(res, 200, { success: true, experimentId, status: 'running' });
      return true;
    }

    // Catch-all for unknown routes
    log.debug({ pathname, method }, 'Unmatched superhuman experiments route');
    sendJson(res, 404, {
      error: 'Unknown endpoint',
      path: pathname,
    });
    return true;
  } catch (error) {
    log.error({ error, pathname, method }, 'Error in superhuman experiments API');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default { handleSuperhumanExperimentsRoutes };
