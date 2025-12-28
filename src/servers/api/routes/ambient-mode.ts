/**
 * Ambient Mode API Routes
 *
 * "Better than Human" - Continuous background presence.
 *
 * Endpoints:
 * - POST /api/ambient-mode/sync → Sync ambient context from iOS app
 * - GET /api/ambient-mode/state → Get current ambient state
 * - GET /api/ambient-mode/preferences → Get user's ambient preferences
 * - PUT /api/ambient-mode/preferences → Update preferences
 * - POST /api/ambient-mode/enable → Enable ambient mode
 * - POST /api/ambient-mode/disable → Disable ambient mode
 * - POST /api/ambient-mode/quiet-hours → Set quiet hours
 * - GET /api/ambient-mode/nudge-history → Get recent nudges
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  ambientMode,
  type AmbientSyncRequest,
  type AmbientPreferences,
  type NudgeType,
} from '../../../services/ambient-mode/index.js';

const log = createLogger({ module: 'ambient-mode-routes' });

// ============================================================================
// HELPERS
// ============================================================================

function getUserId(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const userIdHeader = req.headers['x-user-id'];
  if (userIdHeader && typeof userIdHeader === 'string') {
    return userIdHeader;
  }

  return null;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

async function parseBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleAmbientModeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/ambient-mode/* routes
  if (!pathname.startsWith('/api/ambient-mode')) {
    return false;
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // All routes require user authentication
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 401, 'Authentication required');
    return true;
  }

  // ============================================================================
  // POST /api/ambient-mode/sync - Sync ambient context from iOS app
  // ============================================================================
  if (pathname === '/api/ambient-mode/sync' && req.method === 'POST') {
    const body = await parseBody<AmbientSyncRequest>(req);

    if (!body) {
      sendError(res, 400, 'Invalid sync payload');
      return true;
    }

    try {
      // Check if ambient mode is enabled
      const isEnabled = await ambientMode.isEnabled(userId);
      if (!isEnabled) {
        sendError(res, 403, 'Ambient mode is not enabled. Enable it in settings.');
        return true;
      }

      const result = await ambientMode.handleSync({
        ...body,
        userId,
      });

      log.debug({ userId, locationType: body.state?.locationType }, 'Ambient sync received');
      sendJson(res, 200, result);
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Ambient sync failed');
      sendError(res, 500, 'Sync failed');
      return true;
    }
  }

  // ============================================================================
  // GET /api/ambient-mode/state - Get current ambient state
  // ============================================================================
  if (pathname === '/api/ambient-mode/state' && req.method === 'GET') {
    try {
      const state = await ambientMode.getState(userId);
      sendJson(res, 200, { success: true, state });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Get ambient state failed');
      sendError(res, 500, 'Failed to get ambient state');
      return true;
    }
  }

  // ============================================================================
  // GET /api/ambient-mode/context - Get current ambient context (for LLM)
  // ============================================================================
  if (pathname === '/api/ambient-mode/context' && req.method === 'GET') {
    try {
      const context = await ambientMode.buildContext(userId);
      sendJson(res, 200, { success: true, context });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Get ambient context failed');
      sendError(res, 500, 'Failed to get ambient context');
      return true;
    }
  }

  // ============================================================================
  // GET /api/ambient-mode/preferences - Get ambient preferences
  // ============================================================================
  if (pathname === '/api/ambient-mode/preferences' && req.method === 'GET') {
    try {
      const preferences = await ambientMode.getPreferences(userId);
      sendJson(res, 200, { success: true, preferences });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Get ambient preferences failed');
      sendError(res, 500, 'Failed to get preferences');
      return true;
    }
  }

  // ============================================================================
  // PUT /api/ambient-mode/preferences - Update ambient preferences
  // ============================================================================
  if (pathname === '/api/ambient-mode/preferences' && req.method === 'PUT') {
    const body = await parseBody<Partial<AmbientPreferences>>(req);

    if (!body) {
      sendError(res, 400, 'Invalid request body');
      return true;
    }

    try {
      await ambientMode.updatePreferences(userId, body);
      log.info({ userId, updates: Object.keys(body) }, 'Ambient preferences updated');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Update ambient preferences failed');
      sendError(res, 500, 'Failed to update preferences');
      return true;
    }
  }

  // ============================================================================
  // POST /api/ambient-mode/enable - Enable ambient mode
  // ============================================================================
  if (pathname === '/api/ambient-mode/enable' && req.method === 'POST') {
    try {
      await ambientMode.enable(userId);
      sendJson(res, 200, { success: true, message: 'Ambient mode enabled' });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Enable ambient mode failed');
      sendError(res, 500, 'Failed to enable ambient mode');
      return true;
    }
  }

  // ============================================================================
  // POST /api/ambient-mode/disable - Disable ambient mode
  // ============================================================================
  if (pathname === '/api/ambient-mode/disable' && req.method === 'POST') {
    try {
      await ambientMode.disable(userId);
      sendJson(res, 200, { success: true, message: 'Ambient mode disabled' });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Disable ambient mode failed');
      sendError(res, 500, 'Failed to disable ambient mode');
      return true;
    }
  }

  // ============================================================================
  // POST /api/ambient-mode/quiet-hours - Set quiet hours
  // ============================================================================
  if (pathname === '/api/ambient-mode/quiet-hours' && req.method === 'POST') {
    const body = await parseBody<{ startTime: string; endTime: string }>(req);

    if (!body?.startTime || !body?.endTime) {
      sendError(res, 400, 'startTime and endTime required (HH:MM format)');
      return true;
    }

    // Validate time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(body.startTime) || !timeRegex.test(body.endTime)) {
      sendError(res, 400, 'Invalid time format. Use HH:MM (24-hour)');
      return true;
    }

    try {
      await ambientMode.setQuietHours(userId, body.startTime, body.endTime);
      sendJson(res, 200, {
        success: true,
        message: `Quiet hours set: ${body.startTime} - ${body.endTime}`,
      });
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Set quiet hours failed');
      sendError(res, 500, 'Failed to set quiet hours');
      return true;
    }
  }

  // ============================================================================
  // POST /api/ambient-mode/evaluate-nudge - Evaluate if nudge should be sent
  // ============================================================================
  if (pathname === '/api/ambient-mode/evaluate-nudge' && req.method === 'POST') {
    try {
      const state = await ambientMode.getState(userId);
      if (!state) {
        sendJson(res, 200, { shouldSend: false, reason: 'No ambient state' });
        return true;
      }

      // evaluateNudge takes the full state object
      const evaluation = await ambientMode.evaluateNudge(state);
      sendJson(res, 200, evaluation);
      return true;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Evaluate nudge failed');
      sendError(res, 500, 'Failed to evaluate nudge');
      return true;
    }
  }

  // Not an ambient mode route we handle
  return false;
}
