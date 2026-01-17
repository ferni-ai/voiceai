/**
 * Voice Presence API Routes
 *
 * Exposes voice presence analytics and tuning via HTTP endpoints.
 *
 * Endpoints:
 * - GET /api/voice-presence/dashboard - Full dashboard data
 * - GET /api/voice-presence/metrics - All feature metrics
 * - GET /api/voice-presence/config - Current configuration
 * - POST /api/voice-presence/config - Update configuration
 * - GET /api/voice-presence/recommendations - AI tuning recommendations
 * - POST /api/voice-presence/apply-recommendation - Apply a recommendation
 * - POST /api/voice-presence/auto-tune - Toggle auto-tuning
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getVoicePresenceAnalytics,
  type TuningRecommendation,
  type VoicePresenceConfig,
} from '../services/voice/voice-presence-analytics.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAdmin, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { UpdateVoicePresenceConfigSchema, validateBody } from './validators.js';

const log = createLogger({ module: 'VoicePresenceAPI' });

/**
 * Handle voice presence API routes
 */
export async function handleVoicePresenceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/voice-presence routes
  if (!pathname.startsWith('/api/voice-presence')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // Write operations require admin access
  if (req.method === 'POST') {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
  } else {
    // Read operations require basic auth
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;
  }

  const analytics = getVoicePresenceAnalytics();

  try {
    // GET /api/voice-presence/dashboard - Full dashboard data
    if (pathname === '/api/voice-presence/dashboard' && req.method === 'GET') {
      log.debug('Voice presence dashboard data requested');
      sendJSON(res, analytics.getDashboardData());
      return true;
    }

    // GET /api/voice-presence/metrics - All feature metrics
    if (pathname === '/api/voice-presence/metrics' && req.method === 'GET') {
      sendJSON(res, analytics.getAllMetrics());
      return true;
    }

    // GET /api/voice-presence/config - Current configuration
    if (pathname === '/api/voice-presence/config' && req.method === 'GET') {
      sendJSON(res, analytics.getConfig());
      return true;
    }

    // POST /api/voice-presence/config - Update configuration
    if (pathname === '/api/voice-presence/config' && req.method === 'POST') {
      const updates = await validateBody(req, res, UpdateVoicePresenceConfigSchema);
      if (!updates) return true; // Validation failed

      analytics.updateConfig(updates as Partial<VoicePresenceConfig>);
      log.info({ updates }, 'Voice presence config updated via API');
      sendJSON(res, { success: true, config: analytics.getConfig() });
      return true;
    }

    // GET /api/voice-presence/recommendations - AI tuning recommendations
    if (pathname === '/api/voice-presence/recommendations' && req.method === 'GET') {
      sendJSON(res, analytics.generateRecommendations());
      return true;
    }

    // POST /api/voice-presence/apply-recommendation - Apply a recommendation
    if (pathname === '/api/voice-presence/apply-recommendation' && req.method === 'POST') {
      const recommendation = await parseBody<TuningRecommendation>(req);
      const success = analytics.applyRecommendation(recommendation);
      if (success) {
        log.info(
          { feature: recommendation.feature, parameter: recommendation.parameter },
          'Recommendation applied via API'
        );
        sendJSON(res, { success: true, config: analytics.getConfig() });
      } else {
        sendError(res, 'Failed to apply recommendation', 400);
      }
      return true;
    }

    // POST /api/voice-presence/auto-tune - Toggle auto-tuning
    if (pathname === '/api/voice-presence/auto-tune' && req.method === 'POST') {
      const { enabled } = await parseBody<{ enabled: boolean }>(req);
      // In a full implementation, this would start/stop an auto-tuning scheduler
      log.info({ enabled }, 'Auto-tune toggled via API');
      sendJSON(res, { success: true, autoTuneEnabled: enabled });
      return true;
    }

    // Route not found
    sendError(res, 'Voice presence endpoint not found', 404);
    return true;
  } catch (error) {
    log.error({ error }, 'Voice presence API error');
    sendError(res, 'Internal server error');
    return true;
  }
}
