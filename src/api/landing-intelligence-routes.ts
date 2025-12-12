/**
 * Landing Intelligence API Routes
 *
 * REST API for landing page optimization services.
 *
 * @module api/landing-intelligence-routes
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  generateDemoConversation,
  getOptimalSectionOrder,
  getReturningVisitorContext,
  getReturningVisitorExperience,
  getTimeAwareContent,
  optimizeLandingPage,
  recordVisitorSession,
  type LandingOptimizationRequest,
} from '../services/landing-intelligence/index.js';
import {
  getLandingIntelligenceFlags,
  getLandingIntelligenceHealth,
  setLandingIntelligenceFlags,
} from '../services/landing-intelligence/lifecycle.js';
import { getQuickOptimization } from '../services/landing-intelligence/orchestrator.js';
import { generateVisitorId } from '../services/landing-intelligence/returning-visitor.js';
import { createLogger } from '../utils/safe-logger.js';

/**
 * Wrapper for async route handlers to properly handle promises
 */
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };

const log = createLogger({ module: 'LandingIntelligenceAPI' });

export const landingIntelligenceRouter = Router();

// ============================================================================
// MAIN OPTIMIZATION ENDPOINT
// ============================================================================

/**
 * POST /api/landing/optimize
 *
 * Main optimization endpoint - returns everything needed for the landing page.
 */
landingIntelligenceRouter.post(
  '/optimize',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const request: LandingOptimizationRequest = {
        visitorId: req.body.visitorId,
        behaviorSignals: req.body.behaviorSignals,
        device: req.body.device,
        currentSection: req.body.currentSection,
        hour: req.body.hour ?? new Date().getHours(),
        include: req.body.include,
      };

      const response = await optimizeLandingPage(request);

      res.json(response);
    } catch (error) {
      log.error({ error }, 'Landing optimization failed');
      res.status(500).json({
        error: 'Optimization failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// ============================================================================
// TIME-AWARE CONTENT
// ============================================================================

/**
 * GET /api/landing/time-content
 *
 * Get time-aware content for the current hour.
 */
landingIntelligenceRouter.get('/time-content', (req: Request, res: Response) => {
  const hour = req.query.hour ? parseInt(req.query.hour as string, 10) : undefined;
  const content = getTimeAwareContent(hour);
  res.json(content);
});

// ============================================================================
// DEMO CONVERSATION
// ============================================================================

/**
 * GET /api/landing/demo
 *
 * Get a demo conversation for display.
 */
landingIntelligenceRouter.get(
  '/demo',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const concern = req.query.concern as string | undefined;
      const superpower = req.query.superpower as string | undefined;

      const demo = await generateDemoConversation(
        concern as Parameters<typeof generateDemoConversation>[0],
        superpower as Parameters<typeof generateDemoConversation>[1]
      );

      res.json(demo);
    } catch (error) {
      log.error({ error }, 'Demo generation failed');
      res.status(500).json({ error: 'Demo generation failed' });
    }
  })
);

// ============================================================================
// CHAT GREETING
// ============================================================================

/**
 * POST /api/landing/chat-greeting
 *
 * Get a contextual chat greeting.
 */
landingIntelligenceRouter.post(
  '/chat-greeting',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { section, timeOnPage, scrollDepth } = req.body;

      const result = await getQuickOptimization(
        section || 'hero',
        timeOnPage || 0,
        scrollDepth || 0
      );

      res.json(result);
    } catch (error) {
      log.error({ error }, 'Chat greeting generation failed');
      res.status(500).json({ error: 'Chat greeting failed' });
    }
  })
);

// ============================================================================
// LAYOUT OPTIMIZATION
// ============================================================================

/**
 * POST /api/landing/layout
 *
 * Get optimized section layout.
 */
landingIntelligenceRouter.post(
  '/layout',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { intent, timeMode, device, isReturning, visitCount } = req.body;

      const layout = await getOptimalSectionOrder({
        intent,
        timeMode,
        device,
        isReturning,
        visitCount,
      });

      res.json(layout);
    } catch (error) {
      log.error({ error }, 'Layout optimization failed');
      res.status(500).json({ error: 'Layout optimization failed' });
    }
  })
);

// ============================================================================
// RETURNING VISITOR
// ============================================================================

/**
 * GET /api/landing/visitor/:visitorId
 *
 * Get returning visitor experience.
 */
landingIntelligenceRouter.get(
  '/visitor/:visitorId',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { visitorId } = req.params;

      const context = await getReturningVisitorContext(visitorId);

      if (!context) {
        res.json({
          isReturning: false,
          visitCount: 1,
        });
        return;
      }

      const experience = await getReturningVisitorExperience(context);

      res.json({
        isReturning: true,
        visitCount: context.visitCount,
        experience,
        context: {
          firstVisit: context.firstVisit,
          lastVisit: context.lastVisit,
          topSections: context.topSections,
        },
      });
    } catch (error) {
      log.error({ error }, 'Visitor lookup failed');
      res.status(500).json({ error: 'Visitor lookup failed' });
    }
  })
);

/**
 * POST /api/landing/visitor/new
 *
 * Generate a new visitor ID.
 */
landingIntelligenceRouter.post('/visitor/new', (_req: Request, res: Response) => {
  const visitorId = generateVisitorId();
  res.json({ visitorId });
});

// ============================================================================
// BEHAVIOR TRACKING
// ============================================================================

/**
 * POST /api/landing/track
 *
 * Track visitor behavior signals.
 */
landingIntelligenceRouter.post(
  '/track',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { visitorId, sessionId, signals } = req.body;

      if (!visitorId || !sessionId) {
        res.status(400).json({ error: 'visitorId and sessionId required' });
        return;
      }

      // Record the session
      recordVisitorSession({
        visitorId,
        sessionId,
        startTime: new Date(signals.startTime || Date.now()),
        sectionsViewed: signals.sectionsViewed || [],
        timePerSection: signals.timePerSection || {},
        scrollDepth: signals.scrollDepth || 0,
        ctaClicks: signals.ctaClicks || 0,
        variantsSeen: signals.variantsSeen || [],
        converted: signals.converted || false,
      });

      res.json({ success: true });
    } catch (error) {
      log.error({ error }, 'Behavior tracking failed');
      res.status(500).json({ error: 'Tracking failed' });
    }
  })
);

/**
 * POST /api/landing/track/end
 *
 * End a visitor session.
 */
landingIntelligenceRouter.post(
  '/track/end',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { visitorId, sessionId, signals } = req.body;

      if (!visitorId || !sessionId) {
        res.status(400).json({ error: 'visitorId and sessionId required' });
        return;
      }

      // Record final session state
      recordVisitorSession({
        visitorId,
        sessionId,
        startTime: new Date(signals.startTime || Date.now()),
        endTime: new Date(),
        sectionsViewed: signals.sectionsViewed || [],
        timePerSection: signals.timePerSection || {},
        scrollDepth: signals.scrollDepth || 0,
        ctaClicks: signals.ctaClicks || 0,
        variantsSeen: signals.variantsSeen || [],
        converted: signals.converted || false,
      });

      res.json({ success: true });
    } catch (error) {
      log.error({ error }, 'Session end tracking failed');
      res.status(500).json({ error: 'Tracking failed' });
    }
  })
);

// ============================================================================
// HEALTH & ADMIN
// ============================================================================

/**
 * GET /api/landing/health
 *
 * Health check for landing intelligence services.
 */
landingIntelligenceRouter.get('/health', (_req: Request, res: Response) => {
  const health = getLandingIntelligenceHealth();
  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /api/landing/flags
 *
 * Get current feature flags.
 */
landingIntelligenceRouter.get('/flags', (_req: Request, res: Response) => {
  res.json(getLandingIntelligenceFlags());
});

/**
 * PUT /api/landing/flags
 *
 * Update feature flags (admin only).
 */
landingIntelligenceRouter.put('/flags', (req: Request, res: Response) => {
  // In production, add admin auth here
  const flags = req.body;
  setLandingIntelligenceFlags(flags);
  res.json(getLandingIntelligenceFlags());
});

// ============================================================================
// EXPORTS
// ============================================================================

export default landingIntelligenceRouter;
