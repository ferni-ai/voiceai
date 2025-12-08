/**
 * Voice Humanization API Routes
 *
 * Endpoints for:
 * - GET /api/voice-humanization/metrics - Dashboard metrics
 * - GET /api/voice-humanization/flags - Current feature flags
 * - POST /api/voice-humanization/flags - Update feature flags
 *
 * @module VoiceHumanizationRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, Response, Router } from 'express';
import {
  getMetricsJson,
  getDashboardData,
  resetMetrics,
} from '../services/voice-humanization-metrics.js';
import {
  getFlags,
  updateFlags,
  resetFlags,
  type VoiceHumanizationFlags,
} from '../config/voice-humanization-flags.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'VoiceHumanizationRoutes' });

// ============================================================================
// HTTP HANDLER (for ui-server.js)
// ============================================================================

/**
 * Handle voice humanization routes (vanilla http server)
 */
export async function handleVoiceHumanizationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method || 'GET';

  // Helper to send JSON response
  const sendJson = (statusCode: number, data: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // Helper to read request body
  const readBody = async (): Promise<Record<string, unknown>> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  };

  try {
    // GET /api/voice-humanization/metrics
    if (pathname === '/api/voice-humanization/metrics' && method === 'GET') {
      const metrics = getMetricsJson();
      sendJson(200, metrics);
      return true;
    }

    // GET /api/voice-humanization/dashboard
    if (pathname === '/api/voice-humanization/dashboard' && method === 'GET') {
      const dashboard = getDashboardData();
      sendJson(200, { success: true, data: dashboard });
      return true;
    }

    // GET /api/voice-humanization/flags
    if (pathname === '/api/voice-humanization/flags' && method === 'GET') {
      const flags = getFlags();
      sendJson(200, { success: true, data: flags });
      return true;
    }

    // POST /api/voice-humanization/flags
    if (pathname === '/api/voice-humanization/flags' && method === 'POST') {
      const body = await readBody();

      const validKeys = [
        'enableProsodyTurnPrediction',
        'enableMicroInterruptions',
        'enableEmotionalArcTts',
        'enableLaughterDetection',
        'enableAmbientAwareness',
        'enableRhythmMirroring',
        'enableEmotionalContagion',
        'enableEnhancedVoiceFingerprinting',
        'enableFftAnalysis',
        'enableEnhancedTurnPrediction',
        'enableMultiSignalLaughter',
        'enableWordTimingRhythm',
        'enableResponseAnticipation',
        'useCachedResponses',
        'cacheConfidenceThreshold',
        'rolloutPercentage',
        'enableVerboseLogging',
        'enableMetrics',
      ];

      const sanitizedUpdates: Partial<VoiceHumanizationFlags> = {};
      for (const key of Object.keys(body)) {
        if (validKeys.includes(key)) {
          (sanitizedUpdates as Record<string, unknown>)[key] = body[key];
        }
      }

      updateFlags(sanitizedUpdates);
      const newFlags = getFlags();

      log.info({ updates: sanitizedUpdates }, '🚩 Flags updated via API');
      sendJson(200, { success: true, data: newFlags });
      return true;
    }

    // POST /api/voice-humanization/flags/reset
    if (pathname === '/api/voice-humanization/flags/reset' && method === 'POST') {
      resetFlags();
      const flags = getFlags();
      log.info('🚩 Flags reset via API');
      sendJson(200, { success: true, data: flags });
      return true;
    }

    // POST /api/voice-humanization/metrics/reset
    if (pathname === '/api/voice-humanization/metrics/reset' && method === 'POST') {
      resetMetrics();
      log.info('📊 Metrics reset via API');
      sendJson(200, { success: true, message: 'Metrics reset' });
      return true;
    }

    return false;
  } catch (error) {
    log.error({ error }, 'Voice humanization route error');
    sendJson(500, { success: false, error: 'Internal server error' });
    return true;
  }
}

// ============================================================================
// EXPRESS ROUTER (for express-based servers)
// ============================================================================

/**
 * Register voice humanization routes
 */
export function registerVoiceHumanizationRoutes(router: Router): void {
  // GET /api/voice-humanization/metrics
  router.get('/voice-humanization/metrics', (_req: Request, res: Response) => {
    try {
      const metrics = getMetricsJson();
      res.json(metrics);
    } catch (error) {
      log.error({ error }, 'Failed to get metrics');
      res.status(500).json({ success: false, error: 'Failed to get metrics' });
    }
  });

  // GET /api/voice-humanization/dashboard
  router.get('/voice-humanization/dashboard', (_req: Request, res: Response) => {
    try {
      const dashboard = getDashboardData();
      res.json({ success: true, data: dashboard });
    } catch (error) {
      log.error({ error }, 'Failed to get dashboard data');
      res.status(500).json({ success: false, error: 'Failed to get dashboard' });
    }
  });

  // GET /api/voice-humanization/flags
  router.get('/voice-humanization/flags', (_req: Request, res: Response) => {
    try {
      const flags = getFlags();
      res.json({ success: true, data: flags });
    } catch (error) {
      log.error({ error }, 'Failed to get flags');
      res.status(500).json({ success: false, error: 'Failed to get flags' });
    }
  });

  // POST /api/voice-humanization/flags
  router.post('/voice-humanization/flags', (req: Request, res: Response) => {
    try {
      const updates = req.body as Partial<VoiceHumanizationFlags>;

      // Validate updates
      const validKeys = [
        'enableProsodyTurnPrediction',
        'enableMicroInterruptions',
        'enableEmotionalArcTts',
        'enableLaughterDetection',
        'enableAmbientAwareness',
        'enableRhythmMirroring',
        'enableEmotionalContagion',
        'enableEnhancedVoiceFingerprinting',
        'enableFftAnalysis',
        'enableEnhancedTurnPrediction',
        'enableMultiSignalLaughter',
        'enableWordTimingRhythm',
        'enableResponseAnticipation',
        'useCachedResponses',
        'cacheConfidenceThreshold',
        'rolloutPercentage',
        'enableVerboseLogging',
        'enableMetrics',
      ];

      const sanitizedUpdates: Partial<VoiceHumanizationFlags> = {};
      for (const key of Object.keys(updates)) {
        if (validKeys.includes(key)) {
          (sanitizedUpdates as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[
            key
          ];
        }
      }

      updateFlags(sanitizedUpdates);
      const newFlags = getFlags();

      log.info({ updates: sanitizedUpdates }, '🚩 Flags updated via API');
      res.json({ success: true, data: newFlags });
    } catch (error) {
      log.error({ error }, 'Failed to update flags');
      res.status(500).json({ success: false, error: 'Failed to update flags' });
    }
  });

  // POST /api/voice-humanization/flags/reset
  router.post('/voice-humanization/flags/reset', (_req: Request, res: Response) => {
    try {
      resetFlags();
      const flags = getFlags();
      log.info('🚩 Flags reset via API');
      res.json({ success: true, data: flags });
    } catch (error) {
      log.error({ error }, 'Failed to reset flags');
      res.status(500).json({ success: false, error: 'Failed to reset flags' });
    }
  });

  // POST /api/voice-humanization/metrics/reset
  router.post('/voice-humanization/metrics/reset', (_req: Request, res: Response) => {
    try {
      resetMetrics();
      log.info('📊 Metrics reset via API');
      res.json({ success: true, message: 'Metrics reset' });
    } catch (error) {
      log.error({ error }, 'Failed to reset metrics');
      res.status(500).json({ success: false, error: 'Failed to reset metrics' });
    }
  });

  log.info('🎤 Voice humanization routes registered');
}
