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
  type VoicePresenceConfig,
  type TuningRecommendation,
} from '../services/voice-presence-analytics.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

/**
 * Send JSON response
 */
function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Send error response
 */
function sendError(res: ServerResponse, message: string, status = 500): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ error: message }));
}

/**
 * Parse request body as JSON
 */
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

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
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
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
      const updates = await parseBody<Partial<VoicePresenceConfig>>(req);
      analytics.updateConfig(updates);
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

