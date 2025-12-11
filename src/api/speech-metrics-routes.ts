/**
 * Speech Metrics API Routes
 *
 * Dashboard endpoints for monitoring speech pipeline performance:
 * - GET /api/speech-metrics/dashboard - Full dashboard data
 * - GET /api/speech-metrics/global - Global metrics snapshot
 * - GET /api/speech-metrics/sessions - Active sessions list
 * - GET /api/speech-metrics/persona/:id - Per-persona metrics
 * - GET /api/speech-metrics/personas - All persona metrics
 *
 * @module SpeechMetricsRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getAllPersonaMetrics,
  getDashboardData,
  getGlobalMetricsSnapshot,
  getPersonaMetrics,
} from '../agents/integrations/speech-metrics-integration.js';
import { getLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded } from './helpers.js';

const log = getLogger().child({ module: 'SpeechMetricsRoutes' });

// ============================================================================
// HTTP HANDLER (for ui-server.js)
// ============================================================================

/**
 * Handle speech metrics routes (vanilla http server)
 */
export async function handleSpeechMetricsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting (generous for dashboard)
  if (rateLimit(req, res, { maxRequests: 200, windowMs: 60000 })) {
    return true;
  }

  // Require authentication (allow dev mode for local testing)
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  const method = req.method || 'GET';

  // Helper to send JSON response
  const sendJson = (statusCode: number, data: unknown) => {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(JSON.stringify(data));
  };

  // Only allow GET requests
  if (method !== 'GET') {
    sendJson(405, { error: 'Method not allowed', allowedMethods: ['GET'] });
    return true;
  }

  try {
    // Route: /api/speech-metrics/dashboard
    if (pathname === '/api/speech-metrics/dashboard') {
      const data = getDashboardData();
      sendJson(200, {
        success: true,
        data: {
          timestamp: Date.now(),
          ...data,
        },
      });
      return true;
    }

    // Route: /api/speech-metrics/global
    if (pathname === '/api/speech-metrics/global') {
      const snapshot = getGlobalMetricsSnapshot();
      sendJson(200, {
        success: true,
        data: snapshot,
      });
      return true;
    }

    // Route: /api/speech-metrics/sessions
    if (pathname === '/api/speech-metrics/sessions') {
      const { activeSessions } = getDashboardData();
      sendJson(200, {
        success: true,
        data: {
          count: activeSessions.length,
          sessions: activeSessions.map((s) => ({
            sessionId: s.sessionId,
            personaId: s.personaId,
            startTime: s.startTime,
            durationSec: Math.round((Date.now() - s.startTime) / 1000),
            turnCount: s.turnCount,
            emotionSamples: s.emotionSamples,
            backchannelCount: s.backchannelCount,
          })),
        },
      });
      return true;
    }

    // Route: /api/speech-metrics/personas
    if (pathname === '/api/speech-metrics/personas') {
      const personas = getAllPersonaMetrics();
      sendJson(200, {
        success: true,
        data: {
          count: personas.length,
          personas: personas.map((p) => ({
            ...p,
            avgBackchannelAccuracy: Math.round(p.avgBackchannelAccuracy * 100),
            avgTurnPredictionAccuracy: Math.round(p.avgTurnPredictionAccuracy * 100),
            avgEmotionConfidence: Math.round(p.avgEmotionConfidence * 100),
            avgResponseLatencyMs: Math.round(p.avgResponseLatencyMs),
            avgSessionDurationSec: Math.round(p.avgSessionDurationSec),
          })),
        },
      });
      return true;
    }

    // Route: /api/speech-metrics/persona/:id
    const personaMatch = pathname.match(/^\/api\/speech-metrics\/persona\/([a-z-]+)$/);
    if (personaMatch) {
      const personaId = personaMatch[1];
      const metrics = getPersonaMetrics(personaId);

      if (!metrics) {
        sendJson(404, {
          success: false,
          error: `No metrics found for persona: ${personaId}`,
        });
        return true;
      }

      sendJson(200, {
        success: true,
        data: {
          ...metrics,
          avgBackchannelAccuracy: Math.round(metrics.avgBackchannelAccuracy * 100),
          avgTurnPredictionAccuracy: Math.round(metrics.avgTurnPredictionAccuracy * 100),
          avgEmotionConfidence: Math.round(metrics.avgEmotionConfidence * 100),
          avgResponseLatencyMs: Math.round(metrics.avgResponseLatencyMs),
          avgSessionDurationSec: Math.round(metrics.avgSessionDurationSec),
        },
      });
      return true;
    }

    // Route: /api/speech-metrics/health (simple health check)
    if (pathname === '/api/speech-metrics/health') {
      const { global } = getDashboardData();
      sendJson(200, {
        success: true,
        status: 'healthy',
        uptimeSec: global.uptimeSec,
        activeSessions: global.metrics.usage.activeSessionCount,
      });
      return true;
    }

    // Unknown route
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Speech metrics route error');
    sendJson(500, {
      success: false,
      error: 'Internal server error',
    });
    return true;
  }
}

// ============================================================================
// EXPRESS MIDDLEWARE (for future Express migration)
// ============================================================================

/**
 * Express router for speech metrics
 * Use with: app.use('/api/speech-metrics', speechMetricsRouter)
 */
interface ExpressRequest {
  params: Record<string, string>;
}

interface ExpressResponse {
  json: (data: unknown) => void;
  status: (code: number) => ExpressResponse;
}

export function createSpeechMetricsRouter(router: {
  get: (path: string, handler: (req: ExpressRequest, res: ExpressResponse) => void) => void;
}): void {
  // Dashboard - full data
  router.get('/dashboard', (_req: ExpressRequest, res: ExpressResponse) => {
    const data = getDashboardData();
    res.json({
      success: true,
      data: {
        timestamp: Date.now(),
        ...data,
      },
    });
  });

  // Global metrics snapshot
  router.get('/global', (_req: ExpressRequest, res: ExpressResponse) => {
    const snapshot = getGlobalMetricsSnapshot();
    res.json({ success: true, data: snapshot });
  });

  // Active sessions
  router.get('/sessions', (_req: ExpressRequest, res: ExpressResponse) => {
    const { activeSessions } = getDashboardData();
    res.json({
      success: true,
      data: {
        count: activeSessions.length,
        sessions: activeSessions,
      },
    });
  });

  // All persona metrics
  router.get('/personas', (_req: ExpressRequest, res: ExpressResponse) => {
    const personas = getAllPersonaMetrics();
    res.json({
      success: true,
      data: { count: personas.length, personas },
    });
  });

  // Single persona metrics
  router.get('/persona/:id', (req: ExpressRequest, res: ExpressResponse) => {
    const { id } = req.params;
    const metrics = getPersonaMetrics(id);

    if (!metrics) {
      res.status(404).json({
        success: false,
        error: `No metrics found for persona: ${id}`,
      });
      return;
    }

    res.json({ success: true, data: metrics });
  });

  // Health check
  router.get('/health', (_req: ExpressRequest, res: ExpressResponse) => {
    const { global } = getDashboardData();
    res.json({
      success: true,
      status: 'healthy',
      uptimeSec: global.uptimeSec,
    });
  });
}

export default handleSpeechMetricsRoutes;
