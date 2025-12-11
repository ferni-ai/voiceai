/**
 * Feature Rollout API Routes
 *
 * REST API for managing automated feature rollouts:
 * - POST /api/rollouts - Start a new rollout
 * - GET /api/rollouts - List all rollouts
 * - GET /api/rollouts/:id - Get rollout status
 * - POST /api/rollouts/:id/advance - Manually advance stage
 * - POST /api/rollouts/:id/rollback - Rollback feature
 * - DELETE /api/rollouts/:id - Cancel rollout
 * - GET /api/rollouts/presets - Get available presets
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getFeatureRollout,
  ROLLOUT_PRESETS,
  type RolloutConfig,
} from '../services/feature-rollout.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseBody, sendJSON, sendError } from './helpers.js';
import { requireAdmin, rateLimit } from './auth-middleware.js';
import { z } from 'zod';

const log = createLogger({ module: 'RolloutAPI' });

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const StartRolloutSchema = z.object({
  featureId: z.string().min(1),
  preset: z.enum(['conservative', 'standard', 'aggressive', 'canary']).optional(),
  stages: z.array(z.number().min(0).max(100)).optional(),
  stageMinDurationMs: z.number().positive().optional(),
  validationChecks: z.array(z.string()).optional(),
  autoAdvance: z.boolean().optional(),
  autoRollback: z.boolean().optional(),
  rollbackThresholds: z
    .object({
      maxErrorRate: z.number().min(0).max(1),
      maxLatencyMs: z.number().positive(),
      minSatisfaction: z.number().min(0).max(1).optional(),
    })
    .optional(),
  webhookUrl: z.string().url().optional(),
});

const RollbackSchema = z.object({
  reason: z.string().min(1),
});

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleRolloutRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // Only handle /api/rollouts routes
  if (!pathname.startsWith('/api/rollouts')) {
    return false;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 30, windowMs: 60000 })) {
    return true;
  }

  // All rollout operations require admin access
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  const rollout = getFeatureRollout();

  try {
    // GET /api/rollouts/presets - List available presets
    if (pathname === '/api/rollouts/presets' && method === 'GET') {
      sendJSON(res, {
        presets: Object.entries(ROLLOUT_PRESETS).map(([name, config]) => ({
          name,
          ...config,
        })),
      });
      return true;
    }

    // GET /api/rollouts - List all rollouts
    if (pathname === '/api/rollouts' && method === 'GET') {
      const rollouts = rollout.getAllRollouts();
      sendJSON(res, {
        rollouts,
        count: rollouts.length,
      });
      return true;
    }

    // POST /api/rollouts - Start a new rollout
    if (pathname === '/api/rollouts' && method === 'POST') {
      const body = await parseBody<z.infer<typeof StartRolloutSchema>>(req);
      const parsed = StartRolloutSchema.safeParse(body);

      if (!parsed.success) {
        sendError(res, `Invalid request: ${parsed.error.message}`, 400);
        return true;
      }

      const { data } = parsed;

      // Get preset config if specified
      const presetConfig = data.preset ? ROLLOUT_PRESETS[data.preset] : ROLLOUT_PRESETS.standard;

      // Build rollout config
      const config: RolloutConfig = {
        featureId: data.featureId,
        stages: data.stages || presetConfig.stages,
        stageMinDurationMs: data.stageMinDurationMs || presetConfig.stageMinDurationMs,
        validationChecks: data.validationChecks || presetConfig.validationChecks,
        autoAdvance: data.autoAdvance ?? presetConfig.autoAdvance,
        autoRollback: data.autoRollback ?? presetConfig.autoRollback,
        rollbackThresholds: data.rollbackThresholds || presetConfig.rollbackThresholds,
        webhookUrl: data.webhookUrl,
        initiatedBy: auth.userId,
      };

      try {
        const state = await rollout.startRollout(config);
        sendJSON(res, { success: true, rollout: state }, 201);
      } catch (error) {
        sendError(res, (error as Error).message, 400);
      }
      return true;
    }

    // Routes with rollout ID
    const rolloutIdMatch = pathname.match(/^\/api\/rollouts\/([^/]+)$/);
    const advanceMatch = pathname.match(/^\/api\/rollouts\/([^/]+)\/advance$/);
    const rollbackMatch = pathname.match(/^\/api\/rollouts\/([^/]+)\/rollback$/);

    // GET /api/rollouts/:id - Get rollout status
    if (rolloutIdMatch && method === 'GET') {
      const featureId = decodeURIComponent(rolloutIdMatch[1]);
      const state = rollout.getRolloutStatus(featureId);

      if (!state) {
        sendError(res, `Rollout "${featureId}" not found`, 404);
        return true;
      }

      sendJSON(res, { rollout: state });
      return true;
    }

    // POST /api/rollouts/:id/advance - Manually advance stage
    if (advanceMatch && method === 'POST') {
      const featureId = decodeURIComponent(advanceMatch[1]);

      try {
        const state = await rollout.advanceStage(featureId);
        sendJSON(res, { success: true, rollout: state });
      } catch (error) {
        sendError(res, (error as Error).message, 400);
      }
      return true;
    }

    // POST /api/rollouts/:id/rollback - Rollback feature
    if (rollbackMatch && method === 'POST') {
      const featureId = decodeURIComponent(rollbackMatch[1]);
      const body = await parseBody<z.infer<typeof RollbackSchema>>(req);
      const parsed = RollbackSchema.safeParse(body);

      if (!parsed.success) {
        sendError(res, `Invalid request: ${parsed.error.message}`, 400);
        return true;
      }

      try {
        const state = await rollout.rollback(featureId, parsed.data.reason);
        sendJSON(res, { success: true, rollout: state });
      } catch (error) {
        sendError(res, (error as Error).message, 400);
      }
      return true;
    }

    // DELETE /api/rollouts/:id - Cancel rollout
    if (rolloutIdMatch && method === 'DELETE') {
      const featureId = decodeURIComponent(rolloutIdMatch[1]);
      rollout.cancelRollout(featureId);
      sendJSON(res, { success: true, message: `Rollout "${featureId}" cancelled` });
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Rollout API error');
    sendError(res, 'Internal server error');
    return true;
  }
}
