/**
 * Web Experiments API Routes
 *
 * HTTP endpoints for web A/B testing.
 *
 * Public endpoints (for frontend):
 *   GET  /api/experiments/web/:id/variant    - Get variant assignment
 *   POST /api/experiments/web/track          - Track exposure/conversion
 *
 * Admin endpoints:
 *   GET  /api/experiments/web                - List all experiments
 *   GET  /api/experiments/web/:id            - Get experiment details
 *   GET  /api/experiments/web/:id/analysis   - Get analysis results
 *   POST /api/experiments/web                - Create experiment
 *   POST /api/experiments/web/:id/start      - Start experiment
 *   POST /api/experiments/web/:id/pause      - Pause experiment
 *   POST /api/experiments/web/:id/complete   - Complete with winner
 *
 * @module api/web-experiments-routes
 */

import { type Request, type Response, type NextFunction, Router } from 'express';
import {
  analyzeExperiment,
  assignVariant,
  completeWebExperiment,
  createWebExperiment,
  getWebExperiment,
  getWebExperiments,
  pauseWebExperiment,
  startWebExperiment,
  trackConversion,
  trackExposure,
  type WebExperimentVariant,
} from '../services/experiments/web-experiments.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'WebExperimentsAPI' });
const router = Router();

// Helper to wrap async route handlers and prevent unhandled promise warnings
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const asyncHandler =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// ============================================================================
// PUBLIC ENDPOINTS (for frontend)
// ============================================================================

/**
 * Get variant assignment for a user
 *
 * Query params:
 *   - userId: Required. The user's ID (can be anonymous ID)
 *   - isNewUser: Optional. Whether user is new
 *   - device: Optional. 'mobile' | 'tablet' | 'desktop'
 *   - source: Optional. utm_source value
 *   - country: Optional. Country code
 */
router.get(
  '/:id/variant',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id: experimentId } = req.params;
      const { userId, isNewUser, device, source, country } = req.query;

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID',
        });
      }

      const assignment = await assignVariant(experimentId, userId, {
        isNewUser: isNewUser === 'true',
        device: device as 'mobile' | 'tablet' | 'desktop' | undefined,
        source: source as string | undefined,
        country: country as string | undefined,
      });

      if (!assignment) {
        return res.status(404).json({
          error: 'Experiment not found or user not in target audience',
          code: 'NOT_ASSIGNED',
        });
      }

      return res.json({
        experimentId: assignment.experimentId,
        variantId: assignment.variantId,
        isNewAssignment: assignment.isNewAssignment,
      });
    } catch (error) {
      log.error({ error, experimentId: req.params.id }, 'Failed to get variant');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

/**
 * Track experiment events
 *
 * Body:
 *   - experimentId: Required. The experiment ID
 *   - variantId: Required. The variant ID
 *   - userId: Required. The user's ID
 *   - eventType: Required. 'exposure' | 'conversion'
 *   - goalId: Required for conversions. The goal ID
 *   - value: Optional. Numeric value for the conversion
 *   - metadata: Optional. Additional context
 */
router.post(
  '/track',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { experimentId, variantId, userId, eventType, goalId, value, metadata } = req.body;

      if (!experimentId || !variantId || !userId || !eventType) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['experimentId', 'variantId', 'userId', 'eventType'],
        });
      }

      if (eventType === 'exposure') {
        await trackExposure(experimentId, variantId, userId, metadata);
      } else if (eventType === 'conversion') {
        if (!goalId) {
          return res.status(400).json({
            error: 'goalId is required for conversion events',
          });
        }
        await trackConversion(experimentId, variantId, userId, goalId, value, metadata);
      } else {
        return res.status(400).json({
          error: 'Invalid eventType',
          allowed: ['exposure', 'conversion'],
        });
      }

      return res.json({ success: true });
    } catch (error) {
      log.error({ error }, 'Failed to track event');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

/**
 * Batch track multiple events
 * Useful for sending multiple events in one request
 */
router.post(
  '/track/batch',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { events } = req.body;

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          error: 'events array is required',
        });
      }

      const results = await Promise.allSettled(
        events.map(async (event) => {
          const { experimentId, variantId, userId, eventType, goalId, value, metadata } = event;

          if (eventType === 'exposure') {
            await trackExposure(experimentId, variantId, userId, metadata);
          } else if (eventType === 'conversion' && goalId) {
            await trackConversion(experimentId, variantId, userId, goalId, value, metadata);
          }
        })
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return res.json({
        success: true,
        tracked: succeeded,
        failed,
      });
    } catch (error) {
      log.error({ error }, 'Failed to batch track events');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * List all experiments
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
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

      return res.json({
        experiments: withAnalysis,
        summary: {
          total: experiments.length,
          running: experiments.filter((e) => e.status === 'running').length,
          completed: experiments.filter((e) => e.status === 'completed').length,
          draft: experiments.filter((e) => e.status === 'draft').length,
          paused: experiments.filter((e) => e.status === 'paused').length,
        },
      });
    } catch (error) {
      log.error({ error }, 'Failed to list experiments');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

/**
 * Get single experiment with full details
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const experiment = await getWebExperiment(req.params.id);

      if (!experiment) {
        return res.status(404).json({ error: 'Experiment not found' });
      }

      const analysis = await analyzeExperiment(experiment.id);

      return res.json({
        experiment,
        analysis,
      });
    } catch (error) {
      log.error({ error, experimentId: req.params.id }, 'Failed to get experiment');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

/**
 * Get just the analysis for an experiment
 */
router.get(
  '/:id/analysis',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const analysis = await analyzeExperiment(req.params.id);

      if (!analysis) {
        return res.status(404).json({ error: 'Experiment not found' });
      }

      return res.json(analysis);
    } catch (error) {
      log.error({ error, experimentId: req.params.id }, 'Failed to analyze experiment');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

/**
 * Create a new experiment
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        variants,
        primaryGoal,
        secondaryGoals,
        targetAudience,
        minimumSamples,
      } = req.body;

      if (!name || !variants || !Array.isArray(variants) || variants.length < 2) {
        return res.status(400).json({
          error: 'name and at least 2 variants are required',
        });
      }

      // Validate variant weights sum to 100
      const totalWeight = variants.reduce(
        (sum: number, v: WebExperimentVariant) => sum + v.weight,
        0
      );
      if (totalWeight !== 100) {
        return res.status(400).json({
          error: 'Variant weights must sum to 100',
          currentTotal: totalWeight,
        });
      }

      const experiment = await createWebExperiment({
        name,
        description,
        variants,
        primaryGoal: primaryGoal || 'conversion',
        secondaryGoals,
        targetAudience,
        minimumSamples,
      });

      return res.status(201).json(experiment);
    } catch (error) {
      log.error({ error }, 'Failed to create experiment');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

/**
 * Start an experiment
 */
router.post(
  '/:id/start',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const experiment = await getWebExperiment(req.params.id);

      if (!experiment) {
        return res.status(404).json({ error: 'Experiment not found' });
      }

      if (experiment.status === 'running') {
        return res.status(400).json({ error: 'Experiment is already running' });
      }

      if (experiment.status === 'completed') {
        return res.status(400).json({ error: 'Cannot start a completed experiment' });
      }

      await startWebExperiment(req.params.id);

      return res.json({ success: true, status: 'running' });
    } catch (error) {
      log.error({ error, experimentId: req.params.id }, 'Failed to start experiment');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

/**
 * Pause an experiment
 */
router.post(
  '/:id/pause',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await pauseWebExperiment(req.params.id);
      return res.json({ success: true, status: 'paused' });
    } catch (error) {
      log.error({ error, experimentId: req.params.id }, 'Failed to pause experiment');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

/**
 * Complete an experiment with a winner
 */
router.post(
  '/:id/complete',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { winner, confidence } = req.body;

      if (!winner) {
        return res.status(400).json({ error: 'winner is required' });
      }

      await completeWebExperiment(req.params.id, winner, confidence || 95);

      return res.json({ success: true, status: 'completed', winner });
    } catch (error) {
      log.error({ error, experimentId: req.params.id }, 'Failed to complete experiment');
      return res.status(500).json({ error: 'Internal server error' });
    }
  })
);

// ============================================================================
// EXPORT
// ============================================================================

export default router;
export { router as webExperimentsRouter };
